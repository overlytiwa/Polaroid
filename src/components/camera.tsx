import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Camera as CameraIcon, RefreshCw, Upload } from "lucide-react";
import {
  canvasOf,
  contextOf,
  cover,
  decode,
  release,
  toBlob,
} from "../lib/processing";
import { needsProcessing } from "../lib/gpuPreview";
import { createLivePreview } from "../lib/livePreview";
import type { Treatment } from "../lib/types";
export interface CameraHandle {
  capture: () => Promise<Blob | null>;
}
interface Props {
  active: boolean;
  facingMode: "user" | "environment";
  treatment: Treatment;
  thumbnailsEnabled?: boolean;
  onActivate: () => void;
  onImport: () => void;
  onReady: (ready: boolean) => void;
  onSwipe: (direction: number) => void;
  onThumbnail: (url: string) => void;
}
const Camera = forwardRef<CameraHandle, Props>(function Camera(
  {
    active,
    facingMode,
    treatment,
    thumbnailsEnabled = false,
    onActivate,
    onImport,
    onReady,
    onSwipe,
    onThumbnail,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null),
    rootRef = useRef<HTMLDivElement>(null),
    outputRef = useRef<HTMLDivElement>(null);
  const current = useRef({ treatment, facingMode, onReady, onThumbnail }),
    dimensions = useRef({ width: 640, height: 480 }),
    redraw = useRef<() => void>(() => {});
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [ready, setReady] = useState(false),
    [aspect, setAspect] = useState("4:3"),
    start = useRef<number | null>(null);
  const filtered = needsProcessing(treatment);
  useEffect(() => {
    current.current = { treatment, facingMode, onReady, onThumbnail };
    redraw.current();
  }, [treatment, facingMode, onReady, onThumbnail]);
  useImperativeHandle(
    ref,
    () => ({
      capture: async () => {
        const video = videoRef.current;
        if (!active || !video?.videoWidth || video.readyState < 2) return null;
        // Capture the sensor's still-photo resolution where supported, independently of video FPS.
        const track = (
          video.srcObject as MediaStream | null
        )?.getVideoTracks()[0];
        const ImageCaptureClass = (
          globalThis as typeof globalThis & {
            ImageCapture?: new (track: MediaStreamTrack) => {
              takePhoto: () => Promise<Blob>;
            };
          }
        ).ImageCapture;
        let image: ImageBitmap | HTMLImageElement | undefined;
        if (track && ImageCaptureClass) {
          try {
            image = await decode(
              await new ImageCaptureClass(track).takePhoto(),
            );
          } catch {
            /* Video capture remains available on cameras without a still-photo API. */
          }
        }
        try {
          const iw = image?.width ?? video.videoWidth,
            ih = image?.height ?? video.videoHeight,
            ratio = dimensions.current.width / dimensions.current.height;
          const c = canvasOf(
              Math.min(iw, ih * ratio),
              Math.min(ih, iw / ratio),
            ),
            ctx = contextOf(c);
          if (facingMode === "user") {
            ctx.translate(c.width, 0);
            ctx.scale(-1, 1);
          }
          cover(ctx, image ?? video, iw, ih, c.width, c.height);
          return await toBlob(c);
        } finally {
          if (image) release(image);
        }
      },
    }),
    [active, facingMode],
  );
  useEffect(() => {
    const root = rootRef.current!,
      observer = new ResizeObserver(() => {
        const { width, height } = root.getBoundingClientRect();
        if (!width || !height) return;
        const ratio = width / height,
          max = 640;
        dimensions.current = {
          width: Math.round(ratio >= 1 ? max : max * ratio),
          height: Math.round(ratio >= 1 ? max / ratio : max),
        };
        setAspect(ratio >= 1 ? "4:3" : "3:4");
        redraw.current();
      });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let stream: MediaStream | undefined,
      cancelled = false;
    const video = videoRef.current;
    queueMicrotask(() => {
      if (!cancelled) {
        setError("");
        setReady(false);
        current.current.onReady(false);
      }
    });
    if (!active)
      return () => {
        cancelled = true;
      };
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => {
        if (!cancelled)
          setError(
            "Camera access needs HTTPS or localhost. You can still upload a photograph.",
          );
      });
      return () => {
        cancelled = true;
      };
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video) {
          video.srcObject = s;
          await video.play();
          if (!cancelled) {
            setReady(true);
            current.current.onReady(true);
          }
        }
      })
      .catch((e: DOMException) => {
        if (cancelled) return;
        setError(
          e.name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera in your browser’s site settings, then try again."
            : e.name === "NotFoundError"
              ? "No camera was found. Upload a photograph to start making memories."
              : e.name === "NotReadableError"
                ? "Your camera is being used by another app. Close it there and try again."
                : "The camera could not start. Try again or upload a photo.",
        );
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
      current.current.onReady(false);
    };
  }, [active, facingMode, retry]);
  useEffect(() => {
    if (!active || !ready || !filtered) return;
    const video = videoRef.current!,
      host = outputRef.current!;
    let renderer = createLivePreview(),
      stopped = false,
      frameHandle = 0,
      editHandle = 0,
      lastTime = -1;
    renderer.canvas.setAttribute("role", "img");
    renderer.canvas.setAttribute("aria-label", "Live filtered camera preview");
    host.replaceChildren(renderer.canvas);
    const frameCallbacks =
      typeof video.requestVideoFrameCallback === "function";
    const draw = () => {
      if (stopped || document.hidden || video.readyState < 2) return;
      const { width, height } = dimensions.current;
      try {
        renderer.render(
          video,
          current.current.treatment,
          width,
          height,
          current.current.facingMode === "user",
        );
      } catch {
        renderer.dispose();
        renderer = createLivePreview(false);
        host.replaceChildren(renderer.canvas);
      }
    };
    const tick = () => {
      if (stopped || document.hidden) return;
      if (frameCallbacks || video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        draw();
      }
      schedule();
    };
    const schedule = () => {
      frameHandle = frameCallbacks
        ? video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };
    const cancel = () => {
      if (frameCallbacks) video.cancelVideoFrameCallback(frameHandle);
      else cancelAnimationFrame(frameHandle);
    };
    redraw.current = () => {
      cancelAnimationFrame(editHandle);
      editHandle = requestAnimationFrame(draw);
    };
    const visibility = () => {
      cancel();
      if (!document.hidden) {
        draw();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    draw();
    if (!document.hidden) schedule();
    return () => {
      stopped = true;
      cancel();
      cancelAnimationFrame(editHandle);
      redraw.current = () => {};
      document.removeEventListener("visibilitychange", visibility);
      renderer.dispose();
      host.replaceChildren();
    };
  }, [active, ready, filtered]);
  useEffect(() => {
    // A single asynchronous snapshot when the shelf opens, then infrequent refreshes.
    if (!active || !ready || !thumbnailsEnabled) return;
    const thumbnail = canvasOf(160, 120),
      ctx = contextOf(thumbnail);
    let cancelled = false,
      pending = false;
    const snapshot = () => {
      const video = videoRef.current;
      if (cancelled || pending || document.hidden || !video?.videoWidth) return;
      pending = true;
      ctx.save();
      if (current.current.facingMode === "user") {
        ctx.translate(160, 0);
        ctx.scale(-1, 1);
      }
      cover(ctx, video, video.videoWidth, video.videoHeight, 160, 120);
      ctx.restore();
      thumbnail.toBlob(
        (blob) => {
          pending = false;
          if (blob && !cancelled)
            current.current.onThumbnail(URL.createObjectURL(blob));
        },
        "image/jpeg",
        0.75,
      );
    };
    snapshot();
    const timer = setInterval(snapshot, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, ready, thumbnailsEnabled]);
  return (
    <div
      ref={rootRef}
      className="camera-surface"
      onPointerDown={(e) => {
        start.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (start.current !== null && Math.abs(e.clientX - start.current) > 45)
          onSwipe(e.clientX < start.current ? 1 : -1);
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="camera-source"
        style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
        aria-label="Live camera preview"
        role="img"
        aria-hidden={filtered}
      />
      <div ref={outputRef} className="camera-filter-output" />
      <div className="viewfinder-top">
        <span className="viewfinder-status">
          <i className={ready ? "live" : ""} />
          {active ? (ready ? "Live" : "Camera") : "Camera off"}
        </span>
        <span>{aspect}</span>
      </div>
      <div className="focus-corners" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      {!active && (
        <div className="camera-invitation">
          <CameraIcon size={25} strokeWidth={1.4} />
          <h2>Camera is off</h2>
          <button className="button light" onClick={onActivate}>
            <CameraIcon size={16} />
            Open camera
          </button>
          <button className="on-dark" onClick={onImport}>
            <Upload size={13} />
            or upload a photograph
          </button>
        </div>
      )}
      {active && !ready && (
        <div className="camera-error">
          <CameraIcon size={28} />
          <h3>{error ? "Camera unavailable" : "Opening camera"}</h3>
          <p>{error || "Allow camera access when your browser asks."}</p>
          {error && (
            <>
              <button
                className="button light"
                onClick={() => setRetry((v) => v + 1)}
              >
                <RefreshCw size={15} />
                Try again
              </button>
              <button className="on-dark" onClick={onImport}>
                Upload a photo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
export default Camera;
