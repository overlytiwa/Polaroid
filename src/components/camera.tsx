import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";


type Step = (v: number) => number;

const clamp = (v: number) => Math.min(255, Math.max(0, v));

const curveOutput =
  (out: number): Step =>
  (v) =>
    out + (v * (255 - out)) / 255;

const curveInput =
  (inp: number): Step =>
  (v) =>
    ((v - inp) * 255) / (255 - inp);

const levels =
  (midtones: number, highlights: number): Step =>
  (v) =>
    255 * Math.pow(Math.min(1, v / highlights), 1 / midtones);

const brightnessContrast =
  (brightness: number, contrast: number): Step =>
  (v) => {
    const slope = 1 + contrast / 100;
    let t = Math.pow(v / 255, Math.pow(2, -brightness / 100));
    t =
      t < 0.5
        ? 0.5 * Math.pow(2 * t, slope)
        : 1 - 0.5 * Math.pow(2 * (1 - t), slope);
    return t * 255;
  };

const multiply =
  (color: number): Step =>
  (v) =>
    (v * color) / 255;

const buildLut = (steps: Step[]): Uint8Array =>
  Uint8Array.from({ length: 256 }, (_, i) =>
    Math.round(steps.reduce((v, step) => clamp(step(v)), i))
  );


type ColorLut = { red: Uint8Array; green: Uint8Array; blue: Uint8Array };

type CameraFilter = {
  id: string;
  name: string;
  
  color?: ColorLut;
};

const NO_FILTER: CameraFilter = { id: "none", name: "No filter" };


const nashvilleLevels = levels(1.35, 235);
const nashvillePrimary = brightnessContrast(5, 53);
const nashvilleSecondary = brightnessContrast(-7, 32);

const NASHVILLE: CameraFilter = {
  id: "nashville",
  name: "Nashville",
  
  color: {
    red: buildLut([
      nashvilleLevels,
      nashvillePrimary,
      nashvilleSecondary,
      multiply(250),
    ]),
    green: buildLut([
      curveOutput(35),
      nashvilleLevels,
      nashvillePrimary,
      curveInput(13),
      nashvilleSecondary,
      multiply(223),
    ]),
    blue: buildLut([
      curveOutput(133),
      nashvilleLevels,
      nashvillePrimary,
      curveInput(88),
      nashvilleSecondary,
      multiply(183),
    ]),
  },
};

const FILTERS: CameraFilter[] = [NO_FILTER, NASHVILLE];

const SWIPE_DISTANCE = 40; 

const MAX_SIDE = 800;

const coverRect = (vw: number, vh: number, cw: number, ch: number) => {
  const scale = Math.max(cw / vw, ch / vh);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
};


const applyColor = (pixels: Uint8ClampedArray, { red, green, blue }: ColorLut) => {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = red[pixels[i]];
    pixels[i + 1] = green[pixels[i + 1]];
    pixels[i + 2] = blue[pixels[i + 2]];
  }
};

const css = `
.cam-root {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.cam-source {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.cam-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.cam-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: #fff;
  font: 600 1.5rem system-ui, sans-serif;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
  opacity: 0;
  animation: cam-label-flash 1.8s ease-out;
}
@keyframes cam-label-flash {
  0% { opacity: 0; transform: scale(0.96); }
  15% { opacity: 1; transform: scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
.cam-fallback {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4da0b0, #d39d38);
}
.cam-blob {
  position: absolute;
  aspect-ratio: 1;
  filter: blur(40px);
  opacity: 0.75;
  border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
}
.cam-blob.one {
  width: 60%;
  top: -15%;
  left: -10%;
  background: #d39d38;
  animation: blob-one 12s ease-in-out infinite alternate;
}
.cam-blob.two {
  width: 55%;
  bottom: -20%;
  right: -10%;
  background: #4da0b0;
  animation: blob-two 14s ease-in-out infinite alternate;
}
.cam-blob.three {
  width: 40%;
  top: 30%;
  left: 35%;
  background: #e8c27a;
  animation: blob-three 10s ease-in-out infinite alternate;
}
@keyframes blob-one {
  to { transform: translate(45%, 35%) scale(1.2); border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; }
}
@keyframes blob-two {
  to { transform: translate(-50%, -30%) scale(1.15); border-radius: 70% 30% 40% 60% / 50% 60% 40% 50%; }
}
@keyframes blob-three {
  to { transform: translate(-40%, 40%) scale(0.8); border-radius: 40% 60% 60% 40% / 70% 30% 70% 30%; }
}
.cam-message {
  position: relative;
  z-index: 1;
  max-width: 80%;
  padding: 16px 20px;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  font-family: system-ui, sans-serif;
}
.cam-message h3 { margin: 0 0 6px; font-size: 1rem; }
.cam-message p { margin: 0; font-size: 0.875rem; line-height: 1.4; }
@media (prefers-reduced-motion: reduce) {
  .cam-blob { animation: none; }
}
`;

export default function Camera() {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swipeStartX = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0); 
  const [labelKey, setLabelKey] = useState(0); 

  const filter = FILTERS[filterIndex];

  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("The camera isn't available here. Open this page on localhost or https.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch((err: DOMException) => {
        if (err.name === "NotAllowedError") {
          setError("Camera access is blocked. Allow it from the lock icon next to the address bar, then reload.");
        } else if (err.name === "NotFoundError") {
          setError("We couldn't find a camera on this device.");
        } else {
          setError("Something went wrong starting the camera. Please try again.");
        }
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!root || !video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const resize = () => {
      const { width, height } = root.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(window.devicePixelRatio || 1, MAX_SIDE / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();

    const drawFrame = () => {
      if (video.readyState < 2 || !video.videoWidth) return; 

      const cw = canvas.width;
      const ch = canvas.height;
      const { sx, sy, sw, sh } = coverRect(video.videoWidth, video.videoHeight, cw, ch);

      ctx.setTransform(-1, 0, 0, 1, cw, 0); 
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const color = filterRef.current.color;
      if (color) {
        const frame = ctx.getImageData(0, 0, cw, ch);
        applyColor(frame.data, color);
        ctx.putImageData(frame, 0, 0);
      }
    };

    const hasFrameCallback = "requestVideoFrameCallback" in video;
    let handle = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      drawFrame();
      handle = hasFrameCallback
        ? video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };
    tick();

    return () => {
      stopped = true;
      observer.disconnect();
      if (hasFrameCallback) {
        video.cancelVideoFrameCallback(handle);
      } else {
        cancelAnimationFrame(handle);
      }
    };
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeStartX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (startX === null || error) return;

    const distance = e.clientX - startX;
    if (Math.abs(distance) < SWIPE_DISTANCE) return;

    
    const step = distance < 0 ? 1 : -1;
    setFilterIndex((i) => (i + step + FILTERS.length) % FILTERS.length);
    setLabelKey((k) => k + 1);
  };

  return (
    <div
      ref={rootRef}
      className="cam-root"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStartX.current = null;
      }}
    >
      <style>{css}</style>

      <video ref={videoRef} className="cam-source" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="cam-canvas" />

      {error ? (
        <div className="cam-fallback">
          <div className="cam-blob one" />
          <div className="cam-blob two" />
          <div className="cam-blob three" />
          <div className="cam-message">
            <h3>Camera unavailable</h3>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div key={labelKey} className="cam-label">
          {filter.name}
        </div>
      )}
    </div>
  );
}