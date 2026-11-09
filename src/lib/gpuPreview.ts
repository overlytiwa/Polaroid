import { FILTER_MAP } from "./filters";
import { canvasOf, contextOf, drawPrintMarks } from "./processing";
import type { Treatment } from "./types";
import { VERTEX, COLOR, BLUR, FINISH } from "./liveShaders";

export interface LiveRenderer {
  canvas: HTMLCanvasElement;
  render: (
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    treatment: Treatment,
    width: number,
    height: number,
    mirror: boolean,
  ) => void;
  dispose: () => void;
}
export function needsProcessing(t: Treatment) {
  return (
    t.intensity > 0 &&
    (t.filterId !== "none" || Object.values(t.adjustments).some((v) => v !== 0))
  );
}

/** Persistent GPU textures/programs. No frame readback, per-pixel JS, or JPEG encoding. */
export function createGpuPreview(): LiveRenderer | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [],
    programs: WebGLProgram[] = [],
    textures: WebGLTexture[] = [],
    buffers: WebGLFramebuffer[] = [];
  try {
    gl.disable(gl.DITHER);
    function compile(type: number, source: string) {
      const s = gl!.createShader(type)!;
      shaders.push(s);
      gl!.shaderSource(s, source);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS))
        throw new Error(
          gl!.getShaderInfoLog(s) ?? "Camera shader compilation failed",
        );
      return s;
    }
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    function program(fragment: string) {
      const p = gl!.createProgram()!;
      programs.push(p);
      gl!.attachShader(p, vertex);
      gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fragment));
      gl!.linkProgram(p);
      if (!gl!.getProgramParameter(p, gl!.LINK_STATUS))
        throw new Error(
          gl!.getProgramInfoLog(p) ?? "Camera shader link failed",
        );
      const uniforms = new Map<string, WebGLUniformLocation | null>();
      return {
        use: () => gl!.useProgram(p),
        at: (name: string) => {
          if (!uniforms.has(name))
            uniforms.set(name, gl!.getUniformLocation(p, name));
          return uniforms.get(name)!;
        },
      };
    }
    const color = program(COLOR),
      blur = program(BLUR),
      finish = program(FINISH);
    function texture(unit: number, nearest = false) {
      const t = gl!.createTexture()!;
      textures.push(t);
      gl!.activeTexture(gl!.TEXTURE0 + unit);
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texParameteri(
        gl!.TEXTURE_2D,
        gl!.TEXTURE_MIN_FILTER,
        nearest ? gl!.NEAREST : gl!.LINEAR,
      );
      gl!.texParameteri(
        gl!.TEXTURE_2D,
        gl!.TEXTURE_MAG_FILTER,
        nearest ? gl!.NEAREST : gl!.LINEAR,
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        1,
        1,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]),
      );
      return t;
    }
    const video = texture(0),
      lookup = texture(1, true),
      graded = texture(2),
      horizontal = texture(3),
      glow = texture(4),
      marks = texture(5);
    function target(t: WebGLTexture) {
      const f = gl!.createFramebuffer()!;
      buffers.push(f);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        t,
        0,
      );
      return f;
    }
    const colorTarget = target(graded),
      horizontalTarget = target(horizontal),
      glowTarget = target(glow);
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const software =
      debug &&
      /swiftshader|llvmpipe|software/i.test(
        String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
      );
    let budgetSide = software ? 320 : 640;
    let w = 0,
      h = 0,
      settingsKey = "",
      previousFilter = "",
      bloom = 0,
      halation = 0,
      sourceWidth = 0,
      sourceHeight = 0,
      duration = 0,
      samples = 0;
    const lut = new Uint8Array(256 * 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    function bind(unit: number, t: WebGLTexture) {
      gl!.activeTexture(gl!.TEXTURE0 + unit);
      gl!.bindTexture(gl!.TEXTURE_2D, t);
    }
    function allocate(
      unit: number,
      t: WebGLTexture,
      width: number,
      height: number,
    ) {
      bind(unit, t);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        width,
        height,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        null,
      );
    }
    function common(p: typeof color, iw: number, ih: number, mirror: boolean) {
      const scale = Math.max(w / iw, h / ih);
      gl!.uniform1i(p.at("source"), 0);
      gl!.uniform2f(p.at("size"), w, h);
      gl!.uniform2f(p.at("crop"), w / scale / iw, h / scale / ih);
      gl!.uniform1i(p.at("mirror"), mirror ? 1 : 0);
    }
    function update(t: Treatment) {
      const filter = FILTER_MAP.get(t.filterId) ?? FILTER_MAP.get("none")!,
        g = filter.grade ?? {},
        l = filter.legacy,
        a = t.adjustments;
      color.use();
      gl!.uniform1i(
        color.at("legacy"),
        l?.monochrome ? 2 : l?.color ? 1 : l ? 3 : 0,
      );
      gl!.uniform1i(
        color.at("adjustments"),
        Object.values(a).some((v) => v !== 0) ? 1 : 0,
      );
      gl!.uniform4f(
        color.at("tone"),
        2 ** ((g.exposure ?? 0) + a.exposure / 50),
        (g.contrast ?? 1) * (1 + a.contrast / 100),
        g.gamma ?? 1,
        (g.saturation ?? 1) * (1 + a.saturation / 100),
      );
      gl!.uniform4f(
        color.at("levels"),
        (g.black ?? 0) + a.fade / 3,
        g.white ?? 255,
        (g.temperature ?? 0) + a.temperature / 3,
        (g.tint ?? 0) + a.tint / 4,
      );
      gl!.uniform3fv(color.at("weights"), g.weights ?? [0.299, 0.587, 0.114]);
      gl!.uniform3fv(color.at("shadowTint"), g.shadow ?? [0, 0, 0]);
      gl!.uniform3fv(color.at("lightTint"), g.light ?? [0, 0, 0]);
      gl!.uniform4f(
        color.at("textureSettings"),
        (g.grain ?? 0) + a.grain / 10,
        g.noise ?? 0,
        g.bits ? 255 / (2 ** g.bits - 1) : 0,
        g.flash ?? 0,
      );
      gl!.uniform3f(color.at("zones"), a.shadows, a.highlights, l?.grain ?? 0);
      gl!.uniform1fv(color.at("curve[0]"), g.curve ?? [0, 64, 128, 192, 255]);
      gl!.uniform1i(color.at("hasCurve"), g.curve ? 1 : 0);
      gl!.uniform1i(
        color.at("mapping"),
        g.mapping
          ? ["purple", "turquoise", "redscale", "infrared"].indexOf(g.mapping) +
              1
          : 0,
      );
      gl!.uniform1i(color.at("halftone"), g.halftone ? 1 : 0);
      gl!.uniform1i(color.at("lut"), 1);
      if (previousFilter !== filter.id) {
        previousFilter = filter.id;
        for (let i = 0; i < 256; i++) {
          lut[i * 4] = l?.monochrome?.[i] ?? l?.color?.red[i] ?? i;
          lut[i * 4 + 1] = l?.color?.green[i] ?? i;
          lut[i * 4 + 2] = l?.color?.blue[i] ?? i;
          lut[i * 4 + 3] = 255;
        }
        bind(1, lookup);
        gl!.texImage2D(
          gl!.TEXTURE_2D,
          0,
          gl!.RGBA,
          256,
          1,
          0,
          gl!.RGBA,
          gl!.UNSIGNED_BYTE,
          lut,
        );
      }
      bloom = (g.bloom ?? 0) + a.bloom / 100;
      halation = (g.halation ?? 0) + a.halation / 100;
      finish.use();
      gl!.uniform1i(finish.at("graded"), 2);
      gl!.uniform1i(finish.at("glow"), 4);
      gl!.uniform1i(finish.at("marks"), 5);
      gl!.uniform4f(
        finish.at("effects"),
        Math.min(1, bloom + halation * 0.8),
        (g.sharpness ?? 0) + a.sharpness / 100,
        g.aberration ?? 0,
        Math.min(
          0.95,
          (g.vignette ??
            (l?.vignette ? (Math.abs(l.vignette) / 100) * 0.7 : 0)) +
            (a.vignette / 100) * 0.6,
        ),
      );
      gl!.uniform1f(
        finish.at("vignetteWhite"),
        l?.vignette && l.vignette > 0 ? 1 : 0,
      );
      gl!.uniform1f(finish.at("leak"), (g.leak ?? 0) + a.lightLeaks / 100);
      gl!.uniform1f(finish.at("intensity"), t.intensity / 100);
      const dust = (g.dust ?? 0) + a.dust / 100;
      if (g.date && !document.fonts.check('16px "Courier Prime"'))
        document.fonts
          .load('16px "Courier Prime"')
          .then(() => {
            settingsKey = "";
          })
          .catch(() => {});
      if (dust || g.date) {
        const c = canvasOf(w, h);
        drawPrintMarks(
          contextOf(c),
          w,
          h,
          dust,
          g.date ? new Date().toISOString() : null,
        );
        bind(5, marks);
        gl!.texImage2D(
          gl!.TEXTURE_2D,
          0,
          gl!.RGBA,
          gl!.RGBA,
          gl!.UNSIGNED_BYTE,
          c,
        );
      } else allocate(5, marks, 1, 1);
    }
    return {
      canvas,
      render(source, treatment, width, height, mirror) {
        const started = performance.now(),
          scale = Math.min(1, budgetSide / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        if (gl.isContextLost()) throw new Error("Camera graphics context lost");
        if (width !== w || height !== h) {
          w = width;
          h = height;
          canvas.width = w;
          canvas.height = h;
          settingsKey = "";
          allocate(2, graded, w, h);
          allocate(3, horizontal, Math.ceil(w / 2), Math.ceil(h / 2));
          allocate(4, glow, Math.ceil(w / 2), Math.ceil(h / 2));
        }
        const key = JSON.stringify(treatment);
        if (key !== settingsKey) {
          settingsKey = key;
          update(treatment);
        }
        const iw =
            source instanceof HTMLVideoElement
              ? source.videoWidth
              : source.width,
          ih =
            source instanceof HTMLVideoElement
              ? source.videoHeight
              : source.height;
        bind(0, video);
        if (iw !== sourceWidth || ih !== sourceHeight) {
          sourceWidth = iw;
          sourceHeight = ih;
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            iw,
            ih,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
        }
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source,
        );
        color.use();
        common(color, iw, ih, mirror);
        gl.bindFramebuffer(gl.FRAMEBUFFER, colorTarget);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (bloom > 0 || halation > 0) {
          blur.use();
          gl.viewport(0, 0, Math.ceil(w / 2), Math.ceil(h / 2));
          gl.uniform1i(blur.at("redHalation"), halation > 0 ? 1 : 0);
          const radius = Math.max(1, (w / 180) * (1 + bloom)) * 0.5;
          gl.uniform1i(blur.at("image"), 2);
          gl.uniform1i(blur.at("threshold"), 1);
          gl.uniform2f(blur.at("direction"), radius / w, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, horizontalTarget);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.uniform1i(blur.at("image"), 3);
          gl.uniform1i(blur.at("threshold"), 0);
          gl.uniform2f(blur.at("direction"), 0, radius / h);
          gl.bindFramebuffer(gl.FRAMEBUFFER, glowTarget);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        finish.use();
        common(finish, iw, ih, mirror);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        duration += performance.now() - started;
        if (++samples === 12) {
          if (duration / samples > 24)
            budgetSide = Math.max(256, budgetSide - 80);
          duration = 0;
          samples = 0;
        }
      },
      dispose() {
        for (const t of textures) gl.deleteTexture(t);
        for (const f of buffers) gl.deleteFramebuffer(f);
        for (const p of programs) gl.deleteProgram(p);
        for (const s of shaders) gl.deleteShader(s);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      },
    };
  } catch {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
}
