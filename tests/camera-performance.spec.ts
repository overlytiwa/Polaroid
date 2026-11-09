import { test, expect } from "@playwright/test";

test("still-photo capture keeps sensor detail independent of preview resolution", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ImageCapture", {
      value: class {
        async takePhoto() {
          const c = document.createElement("canvas");
          c.width = 2400;
          c.height = 1600;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#bc5242";
          ctx.fillRect(0, 0, c.width, c.height);
          return await new Promise<Blob>((resolve) =>
            c.toBlob((blob) => resolve(blob!)),
          );
        }
      },
    });
  });
  await movingCamera(page);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Keep photograph", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Gallery 1", exact: true }),
  ).toBeVisible();
  const photo = await page.evaluate(async () => {
    const { records } = await import("/src/lib/storage.ts");
    const [p] = await records("photos");
    return { width: p.width, height: p.height };
  });
  expect(photo.width).toBeGreaterThan(2000);
  expect(photo.height).toBe(1600);
});

async function movingCamera(
  page: import("@playwright/test").Page,
  options: { slowCapture?: boolean; noGpu?: boolean } = {},
) {
  await page.addInitScript(({ slowCapture, noGpu }) => {
    if (slowCapture) {
      const encode = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (
        ...args: Parameters<typeof encode>
      ) {
        setTimeout(() => Reflect.apply(encode, this, args), 400);
      };
    }
    if (noGpu) {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        type: string,
        ...args: unknown[]
      ) {
        return type === "webgl2"
          ? null
          : Reflect.apply(get, this, [type, ...args]);
      } as typeof get;
    }
  }, options);
  await page.addInitScript(() => {
    const stats = { frames: 0, readbacks: 0, encodes: 0 };
    Object.defineProperty(window, "__previewStats", { value: stats });
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      ...args: Parameters<typeof draw>
    ) {
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.matches(".camera-surface canvas")
      )
        stats.frames++;
      return Reflect.apply(draw, this, args);
    };
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      ...args: Parameters<typeof read>
    ) {
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.matches(".camera-surface canvas")
      )
        stats.readbacks++;
      return Reflect.apply(read, this, args);
    };
    const encode = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      stats.encodes++;
      return Reflect.apply(encode, this, args);
    };
    if (typeof WebGL2RenderingContext !== "undefined") {
      const states = new WeakMap<
        WebGL2RenderingContext,
        WebGLFramebuffer | null
      >();
      const bind = WebGL2RenderingContext.prototype.bindFramebuffer;
      WebGL2RenderingContext.prototype.bindFramebuffer = function (
        target,
        buffer,
      ) {
        states.set(this, buffer);
        return bind.call(this, target, buffer);
      };
      const render = WebGL2RenderingContext.prototype.drawArrays;
      WebGL2RenderingContext.prototype.drawArrays = function (...args) {
        if (
          this.canvas instanceof HTMLCanvasElement &&
          this.canvas.matches(".camera-surface canvas") &&
          !states.get(this)
        )
          stats.frames++;
        return Reflect.apply(render, this, args);
      };
    }
    if (typeof ImageBitmapRenderingContext !== "undefined") {
      const present =
        ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
      ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (
        bitmap,
      ) {
        if (
          this.canvas instanceof HTMLCanvasElement &&
          this.canvas.matches(".camera-surface canvas")
        )
          stats.frames++;
        return present.call(this, bitmap);
      };
    }
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", { value: {} });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d")!;
        let frame = 0;
        const render = () => {
          ctx.fillStyle = `rgb(${frame % 220},90,140)`;
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = "#ffffdd";
          ctx.fillRect((frame * 13) % 1000, 180, 160, 200);
          frame++;
          requestAnimationFrame(render);
        };
        render();
        return canvas.captureStream(30);
      },
    });
  });
  await page.goto("/");
  test.skip(
    !(await page.evaluate(
      () => typeof HTMLCanvasElement.prototype.captureStream === "function",
    )),
    "No synthetic camera support",
  );
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeEnabled();
}

test("live camera frame rate and main-thread work", async ({ page }, info) => {
  await movingCamera(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search filters" })
    .fill("Portra 400");
  await page
    .getByRole("button", { name: "Apply Portra 400", exact: true })
    .click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const metrics = await page.evaluate(async () => {
    const stats = (
      window as unknown as {
        __previewStats: { frames: number; readbacks: number; encodes: number };
      }
    ).__previewStats;
    await new Promise((resolve) => setTimeout(resolve, 500));
    stats.frames = stats.readbacks = stats.encodes = 0;
    const video = document.querySelector("video")!;
    let firstFrame: number | undefined,
      lastFrame = 0,
      frameHandle = 0,
      observing = true;
    const observe = (_time: number, metadata: VideoFrameCallbackMetadata) => {
      firstFrame ??= metadata.presentedFrames;
      lastFrame = metadata.presentedFrames;
      if (observing) frameHandle = video.requestVideoFrameCallback(observe);
    };
    frameHandle = video.requestVideoFrameCallback(observe);
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 2400));
    observing = false;
    video.cancelVideoFrameCallback(frameHandle);
    return {
      fps: (stats.frames * 1000) / (performance.now() - started),
      inputFps:
        ((lastFrame - (firstFrame ?? lastFrame) + 1) * 1000) /
        (performance.now() - started),
      readbacks: stats.readbacks,
      encodes: stats.encodes,
      renderer: document
        .querySelector(".camera-surface canvas")
        ?.getAttribute("data-renderer"),
      width: (
        document.querySelector(".camera-surface canvas") as HTMLCanvasElement
      )?.width,
    };
  });
  console.log(JSON.stringify({ browser: info.project.name, ...metrics }));
  await info.attach("preview-performance", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  // Compare to the frames the test camera actually supplied, including slow CI hosts.
  // The previous fixed 12 FPS loop fails this even when its frame processing is cheap.
  expect(metrics.fps).toBeGreaterThan(metrics.inputFps * 0.8);
  expect(metrics.inputFps).toBeGreaterThan(5);
  expect(metrics.readbacks).toBe(0);
  expect(metrics.encodes).toBe(0);
});

test("GPU presets preserve the exported photographic grades", async ({
  page,
}, info) => {
  await page.goto("/");
  const report = await page.evaluate(async () => {
    const { createGpuPreview } = await import("/src/lib/gpuPreview.ts"),
      { FILTERS } = await import("/src/lib/filters.ts"),
      { originalTreatment } = await import("/src/lib/types.ts"),
      { canvasOf, contextOf, cover, processCanvas } =
        await import("/src/lib/processing.ts"),
      { waitForFonts } = await import("/src/lib/render.ts");
    await waitForFonts();
    const renderer = createGpuPreview();
    if (!renderer) return null;
    const image = new Image();
    image.src = "/samples/lake.jpg";
    await image.decode();
    const source = canvasOf(128, 96);
    cover(
      contextOf(source),
      image,
      image.naturalWidth,
      image.naturalHeight,
      128,
      96,
    );
    const rows = [];
    for (const filter of FILTERS) {
      const t = { ...originalTreatment(), filterId: filter.id },
        cpu = canvasOf(128, 96);
      contextOf(cpu).drawImage(source, 0, 0);
      processCanvas(cpu, t, new Date().toISOString());
      renderer.render(source, t, 128, 96, false);
      const gpu = canvasOf(128, 96);
      contextOf(gpu).drawImage(renderer.canvas, 0, 0);
      const a = contextOf(cpu).getImageData(0, 0, 128, 96).data,
        b = contextOf(gpu).getImageData(0, 0, 128, 96).data;
      let error = 0;
      for (let i = 0; i < a.length; i += 4)
        error +=
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
      rows.push({
        name: filter.name,
        error: error / (128 * 96 * 3),
        legacy: !!filter.legacy,
      });
    }
    renderer.dispose();
    return rows;
  });
  test.skip(!report, "WebGL2 unavailable in this test engine");
  const worst = [...report!].sort((a, b) => b.error - a.error);
  console.log(JSON.stringify(worst.slice(0, 10)));
  await info.attach("GPU-export-parity", {
    body: JSON.stringify(report),
    contentType: "application/json",
  });
  expect(report!.filter((r) => r.legacy).every((r) => r.error < 1)).toBe(true);
  expect(worst[0].error).toBeLessThan(8);
});

test("shutter audio starts before slow image encoding finishes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const events = { audio: 0, encoded: 0 };
    Object.defineProperty(window, "__shutterEvents", { value: events });
    class FakeAudioContext {
      state = "running";
      destination = {};
      resume() {
        return Promise.resolve();
      }
      close() {
        this.state = "closed";
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 0.2 });
      }
      createGain() {
        return { gain: { value: 0 }, connect() {}, disconnect() {} };
      }
      createBufferSource() {
        return {
          buffer: null,
          onended: null,
          connect() {},
          disconnect() {},
          start() {
            events.audio = performance.now();
          },
        };
      }
    }
    Object.defineProperty(window, "AudioContext", { value: FakeAudioContext });
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      setTimeout(
        () =>
          encode.call(
            this,
            (blob) => {
              events.encoded = performance.now();
              callback(blob);
            },
            ...args,
          ),
        400,
      );
    };
  });
  await movingCamera(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some((e) => e.name.includes("camera_shutter")),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.locator(".shutter-flash")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Capture review" }),
  ).toBeVisible();
  const events = await page.evaluate(
    () =>
      (
        window as unknown as {
          __shutterEvents: { audio: number; encoded: number };
        }
      ).__shutterEvents,
  );
  expect(events.audio).toBeGreaterThan(0);
  expect(events.encoded - events.audio).toBeGreaterThan(300);
});

test("worker fallback keeps CPU filtering off the UI thread", async ({
  page,
}) => {
  await movingCamera(page, { noGpu: true });
  test.skip(
    !(await page.evaluate(() => typeof OffscreenCanvas !== "undefined")),
    "No worker canvas support",
  );
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("textbox", { name: "Search filters" }).fill("Nashville");
  await page
    .getByRole("button", { name: "Apply Nashville", exact: true })
    .click();
  await expect(page.locator(".camera-surface canvas")).toHaveAttribute(
    "data-renderer",
    "worker",
  );
  await expect
    .poll(() =>
      page
        .locator(".camera-surface canvas")
        .evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(100);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __previewStats: { readbacks: number } })
          .__previewStats.readbacks,
    ),
  ).toBe(0);
});
