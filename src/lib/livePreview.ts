import { createGpuPreview, type LiveRenderer } from "./gpuPreview";
import { contextOf, cover, processCanvas } from "./processing";

/** One frame in flight. Slow fallback work never builds a queue or blocks camera controls. */
export function createLivePreview(preferGpu = true): LiveRenderer {
  const gpu = preferGpu ? createGpuPreview() : null;
  if (gpu) {
    gpu.canvas.dataset.renderer = "gpu";
    return gpu;
  }
  const canvas = document.createElement("canvas");
  canvas.dataset.renderer = "worker";
  if (
    typeof OffscreenCanvas !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  ) {
    const worker = new Worker(new URL("./preview.worker.ts", import.meta.url), {
      type: "module",
    });
    const ctx = canvas.getContext("bitmaprenderer"),
      fallback = ctx ? null : canvas.getContext("2d")!;
    let busy = false,
      disposed = false,
      revision = 0,
      lastKey = "";
    worker.onmessage = ({
      data,
    }: {
      data: { bitmap?: ImageBitmap; revision: number };
    }) => {
      busy = false;
      if (data.bitmap) {
        if (!disposed && data.revision === revision) {
          if (canvas.width !== data.bitmap.width)
            canvas.width = data.bitmap.width;
          if (canvas.height !== data.bitmap.height)
            canvas.height = data.bitmap.height;
          if (ctx) ctx.transferFromImageBitmap(data.bitmap);
          else fallback!.drawImage(data.bitmap, 0, 0);
        }
        data.bitmap.close();
      }
    };
    worker.onerror = () => {
      busy = false;
    };
    return {
      canvas,
      render(source, t, width, height, mirror) {
        const key = JSON.stringify(t);
        if (key !== lastKey) {
          lastKey = key;
          revision++;
        }
        if (busy || disposed || !(source instanceof HTMLVideoElement)) return;
        busy = true;
        const id = revision,
          scale = Math.min(1, 384 / Math.max(width, height)),
          w = Math.max(1, Math.round(width * scale)),
          h = Math.max(1, Math.round(height * scale));
        const ratio = Math.max(w / source.videoWidth, h / source.videoHeight),
          sw = w / ratio,
          sh = h / ratio;
        createImageBitmap(
          source,
          (source.videoWidth - sw) / 2,
          (source.videoHeight - sh) / 2,
          sw,
          sh,
          { resizeWidth: w, resizeHeight: h },
        )
          .then((bitmap) => {
            if (disposed) {
              bitmap.close();
              return;
            }
            worker.postMessage(
              {
                bitmap,
                width: w,
                height: h,
                mirror,
                treatment: t,
                revision: id,
              },
              [bitmap],
            );
          })
          .catch(() => {
            busy = false;
          });
      },
      dispose() {
        disposed = true;
        worker.terminate();
      },
    };
  }
  // Compatibility for old engines without WebGL2 or OffscreenCanvas. Bound the work.
  canvas.dataset.renderer = "compatibility";
  const ctx = contextOf(canvas);
  let maxSide = 240;
  return {
    canvas,
    render(source, t, width, height, mirror) {
      const started = performance.now(),
        scale = Math.min(1, maxSide / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const iw =
          source instanceof HTMLVideoElement ? source.videoWidth : source.width,
        ih =
          source instanceof HTMLVideoElement
            ? source.videoHeight
            : source.height;
      ctx.save();
      if (mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      cover(ctx, source, iw, ih, canvas.width, canvas.height);
      ctx.restore();
      processCanvas(canvas, t);
      if (performance.now() - started > 25)
        maxSide = Math.max(128, maxSide - 32);
    },
    dispose() {
      canvas.width = canvas.height = 1;
    },
  };
}
