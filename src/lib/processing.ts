import { FILTER_MAP, type Grade } from "./filters";
import type { Treatment } from "./types";

export const clamp = (n: number, lo = 0, hi = 255) =>
  Math.max(lo, Math.min(hi, n));
const noise = (x: number, y: number, seed = 0) => {
  let n = Math.imul(x + 1, 374761393) + Math.imul(y + seed + 1, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295 - 0.5;
};
const interpolate = (x: number, points: number[]) => {
  const p = clamp((x / 255) * 4, 0, 3.99999);
  const i = Math.floor(p);
  return points[i] + (points[i + 1] - points[i]) * (p - i);
};
export function canvasOf(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}
export function contextOf(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create an image canvas.");
  return ctx;
}
export function toBlob(
  c: HTMLCanvasElement,
  type = "image/png",
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(
              new Error("The image could not be exported. Try a smaller size."),
            ),
      type,
      quality,
    ),
  );
}
export async function decode(
  blob: Blob,
): Promise<ImageBitmap | HTMLImageElement> {
  if (!blob.type.startsWith("image/") || blob.type === "image/svg+xml")
    throw new Error(
      "Choose a JPEG, PNG, WebP, GIF, or AVIF photograph. HEIC may need conversion to JPEG.",
    );
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error("This image could not be read. Try a JPEG or PNG file.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
export function release(image: ImageBitmap | HTMLImageElement) {
  if ("close" in image) image.close();
}
export function cover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  iw: number,
  ih: number,
  w: number,
  h: number,
  zoom = 1,
  px = 0,
  py = 0,
) {
  const ratio = Math.max(w / iw, h / ih) * zoom,
    sw = w / ratio,
    sh = h / ratio;
  const sx = ((iw - sw) / 2) * (1 + px / 100),
    sy = ((ih - sh) / 2) * (1 + py / 100);
  ctx.drawImage(
    image,
    clamp(sx, 0, iw - sw),
    clamp(sy, 0, ih - sh),
    sw,
    sh,
    0,
    0,
    w,
    h,
  );
}

/** One pipeline for video, uploads, thumbnails, gallery, and exports. Originals never change. */
export function processCanvas(
  canvas: HTMLCanvasElement,
  treatment: Treatment,
  date = "",
) {
  const filter = FILTER_MAP.get(treatment.filterId) ?? FILTER_MAP.get("none")!;
  const grade: Grade = filter.grade ?? {},
    legacy = filter.legacy;
  const ctx = contextOf(canvas),
    w = canvas.width,
    h = canvas.height,
    a = treatment.adjustments;
  const strength = clamp(treatment.intensity, 0, 100) / 100;
  if (
    strength === 0 ||
    (filter.id === "none" && Object.values(a).every((value) => value === 0))
  )
    return canvas;
  const original = ctx.getImageData(0, 0, w, h);
  // Sensor detail is deliberately limited only for digital grades; the source stays intact.
  if (grade.resolution && strength > 0 && w > grade.resolution) {
    const small = canvasOf(grade.resolution, (h * grade.resolution) / w);
    contextOf(small).drawImage(canvas, 0, 0, small.width, small.height);
    ctx.drawImage(small, 0, 0, w, h);
  }
  const frame = ctx.getImageData(0, 0, w, h),
    pixels = frame.data;
  const exposure = 2 ** ((grade.exposure ?? 0) + a.exposure / 50);
  const contrast = (grade.contrast ?? 1) * (1 + a.contrast / 100);
  const saturation = (grade.saturation ?? 1) * (1 + a.saturation / 100);
  const temperature = (grade.temperature ?? 0) + a.temperature / 3,
    tint = (grade.tint ?? 0) + a.tint / 4;
  const black = (grade.black ?? 0) + a.fade / 3,
    white = grade.white ?? 255;
  const grain = (grade.grain ?? 0) + a.grain / 10;
  const weights = grade.weights ?? [0.299, 0.587, 0.114];
  const hasAdjustments = Object.values(a).some((v) => v !== 0);
  // Preserve the original per-channel lookup tables, grayscale weights and grain amplitudes.
  for (let i = 0; i < pixels.length; i += 4) {
    const x = (i / 4) % w,
      y = Math.floor(i / 4 / w);
    let r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    if (legacy) {
      if (legacy.monochrome) {
        const v = legacy.monochrome[Math.round(0.38 * r + 0.48 * g + 0.14 * b)];
        r = v;
        g = v;
        b = v;
      } else if (legacy.color) {
        r = legacy.color.red[r];
        g = legacy.color.green[g];
        b = legacy.color.blue[b];
      }
      if (legacy.grain) {
        const n = noise(x, y) * legacy.grain * 0.45;
        r += n;
        g += n;
        b += n;
      }
    }
    if (!legacy || hasAdjustments) {
      if (grade.mapping === "purple") {
        const foliage = Math.max(0, g - (r + b) / 2);
        r += foliage * 1.5;
        b += foliage * 1.8;
        g -= foliage * 1.2;
      }
      if (grade.mapping === "turquoise") {
        const oldR = r;
        r = b * 0.8 + g * 0.15;
        b = oldR * 0.85 + b * 0.15;
        g = g * 0.7 + oldR * 0.3;
      }
      if (grade.mapping === "redscale") {
        const l = 0.35 * r + 0.5 * g + 0.15 * b;
        r = l * 1.65;
        g = l * 0.78;
        b = l * 0.3;
      }
      if (grade.mapping === "infrared") {
        const foliage = Math.max(0, g - r * 0.65 - b * 0.35);
        r += foliage * 2.4;
        g -= foliage * 1.5;
        b += foliage * 0.5;
      }
      const luma = weights[0] * r + weights[1] * g + weights[2] * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
      const lum = clamp(luma / 255, 0, 1),
        shadow = (1 - lum) ** 2,
        light = lum ** 2;
      const midShift = a.shadows * shadow * 0.45 + a.highlights * light * 0.45;
      const n =
        noise(Math.floor((x * 1200) / w), Math.floor((y * 1200) / w)) *
        grain *
        (1.1 - lum * 0.5);
      const rr = [r, g, b];
      for (let ch = 0; ch < 3; ch++) {
        let v = rr[ch] * exposure;
        if (grade.curve) v = interpolate(v, grade.curve);
        v = (v - 128) * contrast + 128;
        v = 255 * Math.pow(clamp(v / 255, 0, 1), 1 / (grade.gamma ?? 1));
        v = black + (v * (white - black)) / 255;
        v +=
          (grade.shadow?.[ch] ?? 0) * shadow +
          (grade.light?.[ch] ?? 0) * light +
          midShift;
        v +=
          ch === 0
            ? temperature + tint * 0.5
            : ch === 1
              ? -tint
              : -temperature + tint * 0.5;
        v +=
          n +
          (grade.noise
            ? noise(x, y, ch * 77 + 1) * grade.noise * (1.5 - lum)
            : 0);
        if (grade.bits) {
          const step = 255 / (2 ** grade.bits - 1);
          v = Math.round(v / step) * step;
        }
        rr[ch] = v;
      }
      [r, g, b] = rr;
      if (grade.halftone) {
        const cell = Math.max(2, w / 240),
          dx = (x % cell) / cell - 0.5,
          dy = (y % cell) / cell - 0.5;
        const ink = dx * dx + dy * dy < (1 - clamp(r / 255, 0, 1)) * 0.42;
        r = g = b = ink ? 24 : 242;
      }
      if (grade.flash) {
        const nx = x / w - 0.5,
          ny = y / h - 0.45,
          flash =
            Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny) * 2.2) * grade.flash;
        r += flash * 65;
        g += flash * 65;
        b += flash * 68;
      }
    }
    pixels[i] = clamp(r);
    pixels[i + 1] = clamp(g);
    pixels[i + 2] = clamp(b);
  }
  ctx.putImageData(frame, 0, 0);
  // Luminance threshold isolates glow to highlights instead of blurring the whole image.
  const bloom = (grade.bloom ?? 0) + a.bloom / 100,
    halation = (grade.halation ?? 0) + a.halation / 100;
  if (bloom > 0 || halation > 0) {
    const mask = canvasOf(w, h),
      mctx = contextOf(mask),
      m = mctx.createImageData(w, h);
    for (let i = 0; i < pixels.length; i += 4) {
      const l =
        0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      const alpha = clamp((l - 185) / 70, 0, 1) ** 2 * 255;
      m.data[i] = halation ? 255 : pixels[i];
      m.data[i + 1] = halation ? 48 : pixels[i + 1];
      m.data[i + 2] = halation ? 14 : pixels[i + 2];
      m.data[i + 3] = alpha;
    }
    mctx.putImageData(m, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp(bloom + halation * 0.8, 0, 1);
    ctx.filter = `blur(${Math.max(1, (w / 180) * (1 + bloom))}px)`;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
  }
  const sharpness = (grade.sharpness ?? 0) + a.sharpness / 100;
  if (sharpness > 0) {
    const data = ctx.getImageData(0, 0, w, h),
      copy = new Uint8ClampedArray(data.data),
      offset = Math.max(1, Math.round(w / 1600)) * 4;
    for (let y = 1; y < h - 1; y++)
      for (let x = offset / 4; x < w - offset / 4; x++) {
        const i = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch++)
          data.data[i + ch] = clamp(
            copy[i + ch] +
              sharpness *
                (copy[i + ch] -
                  (copy[i - offset + ch] + copy[i + offset + ch]) / 2),
          );
      }
    ctx.putImageData(data, 0, 0);
  }
  if (grade.aberration) {
    const data = ctx.getImageData(0, 0, w, h),
      copy = new Uint8ClampedArray(data.data),
      shift = Math.max(1, Math.round((w / 650) * grade.aberration));
    for (let y = 0; y < h; y++)
      for (let x = shift; x < w - shift; x++) {
        const i = (y * w + x) * 4;
        data.data[i] = copy[i + shift * 4];
        data.data[i + 2] = copy[i - shift * 4 + 2];
      }
    ctx.putImageData(data, 0, 0);
  }
  const legacyVignette = legacy?.vignette
    ? (Math.abs(legacy.vignette) / 100) * 0.7
    : 0;
  const vignette =
    (grade.vignette ?? legacyVignette) + (a.vignette / 100) * 0.6;
  if (vignette) {
    const radius = Math.hypot(w / 2, h / 2),
      grad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        radius * 0.45,
        w / 2,
        h / 2,
        radius * 1.05,
      );
    grad.addColorStop(0, "transparent");
    grad.addColorStop(
      1,
      `rgba(${legacy?.vignette && legacy.vignette > 0 ? "255,255,255" : "0,0,0"},${clamp(vignette, 0, 0.95)})`,
    );
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  const leak = (grade.leak ?? 0) + a.lightLeaks / 100;
  if (leak) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(
      -w * 0.15,
      h * 0.65,
      0,
      0,
      h * 0.5,
      w * 0.85,
    );
    g.addColorStop(0, `rgba(255,95,20,${clamp(leak, 0, 1)})`);
    g.addColorStop(0.5, `rgba(190,35,15,${clamp(leak * 0.32, 0, 1)})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const dust = (grade.dust ?? 0) + a.dust / 100;
  if (dust) {
    ctx.save();
    ctx.fillStyle = "rgba(245,241,230,.55)";
    ctx.strokeStyle = "rgba(235,230,215,.22)";
    ctx.lineWidth = Math.max(0.5, w / 1800);
    for (let n = 0; n < dust * 120; n++) {
      const x = (noise(n, 41) + 0.5) * w,
        y = (noise(n, 71) + 0.5) * h;
      ctx.fillRect(
        x,
        y,
        Math.max(0.6, ((noise(n, 23) + 0.6) * w) / 900),
        Math.max(0.6, w / 1800),
      );
      if (n % 30 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w / 2000, y + h / 7);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (grade.date) {
    ctx.save();
    ctx.font = `${Math.round(w / 35)}px 'Courier Prime', monospace`;
    ctx.fillStyle = "#f3a04f";
    ctx.textAlign = "right";
    ctx.fillText(
      (date || "UNDATED").slice(0, 10).replaceAll("-", "."),
      w * 0.95,
      h * 0.94,
    );
    ctx.restore();
  }
  if (strength < 1) {
    const finished = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < pixels.length; i += 4)
      for (let c = 0; c < 3; c++)
        finished.data[i + c] =
          original.data[i + c] +
          (finished.data[i + c] - original.data[i + c]) * strength;
    ctx.putImageData(finished, 0, 0);
  }
  return canvas;
}
