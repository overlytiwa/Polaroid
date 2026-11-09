import { contextOf, processCanvas } from "./processing";
import type { Treatment } from "./types";
let canvas: OffscreenCanvas | undefined;
const scope = self as unknown as {
  onmessage: (
    e: MessageEvent<{
      bitmap: ImageBitmap;
      width: number;
      height: number;
      mirror: boolean;
      treatment: Treatment;
      revision: number;
    }>,
  ) => void;
  postMessage: (data: unknown, transfers: Transferable[]) => void;
};
scope.onmessage = ({ data }) => {
  const { bitmap, width, height, mirror, treatment, revision } = data;
  try {
    if (!canvas || canvas.width !== width || canvas.height !== height)
      canvas = new OffscreenCanvas(width, height);
    const ctx = contextOf(canvas);
    ctx.save();
    if (mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    ctx.restore();
    processCanvas(canvas, treatment, new Date().toISOString());
    const result = canvas.transferToImageBitmap();
    scope.postMessage({ bitmap: result, revision }, [result]);
  } catch {
    scope.postMessage({ error: true, revision }, []);
  } finally {
    bitmap.close();
  }
};
