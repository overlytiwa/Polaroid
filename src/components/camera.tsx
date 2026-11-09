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
  processCanvas,
  toBlob,
} from "../lib/processing";
import type { Treatment } from "../lib/types";
export interface CameraHandle {
  capture: () => Promise<Blob | null>;
}
interface Props {
  active: boolean;
  facingMode: "user" | "environment";
  treatment: Treatment;
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
    onActivate,
    onImport,
    onReady,
    onSwipe,
    onThumbnail,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    props = useRef({ treatment, facingMode, onThumbnail, onReady });
  useEffect(() => {
    props.current = { treatment, facingMode, onThumbnail, onReady };
  }, [treatment, facingMode, onThumbnail, onReady]);
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [streamReady, setStreamReady] = useState(false),
    [aspect, setAspect] = useState("4:3"),
    start = useRef<number | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      capture: async () => {
        const video = videoRef.current,
          preview = canvasRef.current;
        if (!active || !video?.videoWidth || video.readyState < 2 || !preview)
          return null;
        const ratio = preview.width / preview.height;
        const c = canvasOf(
            Math.min(video.videoWidth, video.videoHeight * ratio),
            Math.min(video.videoHeight, video.videoWidth / ratio),
          ),
          ctx = contextOf(c);
        if (facingMode === "user") {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        cover(
          ctx,
          video,
          video.videoWidth,
          video.videoHeight,
          c.width,
          c.height,
        );
        return toBlob(c);
      },
    }),
    [active, facingMode],
  );
  useEffect(() => {
    const c = canvasRef.current!;
    const observer = new ResizeObserver(() => {
      const box = c.getBoundingClientRect(),
        ratio = box.width / box.height;
      c.width = Math.round(ratio >= 1 ? 640 : 640 * ratio);
      c.height = Math.round(ratio >= 1 ? 640 / ratio : 640);
      setAspect(ratio >= 1 ? "4:3" : "3:4");
    });
    observer.observe(c);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let stream: MediaStream | undefined,
      cancelled = false;
    const video = videoRef.current;
    queueMicrotask(() => {
      if (!cancelled) {
        setError("");
        setStreamReady(false);
        props.current.onReady(false);
      }
    });
    if (!active) return;
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
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
          if (!cancelled) {
            setStreamReady(true);
            props.current.onReady(true);
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
      props.current.onReady(false);
    };
  }, [active, facingMode, retry]);
  useEffect(() => {
    let stopped = false,
      handle = 0,
      last = 0,
      thumbAt = 0;
    const draw = (time: number) => {
      if (stopped) return;
      const video = videoRef.current,
        c = canvasRef.current;
      const source = active && streamReady && video?.videoWidth ? video : null;
      if (c && source && time - last > (active ? 83 : 200)) {
        last = time;
        const ctx = contextOf(c),
          w = source.videoWidth,
          h = source.videoHeight;
        ctx.save();
        if (active && props.current.facingMode === "user") {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        cover(ctx, source, w, h, c.width, c.height);
        ctx.restore();
        if (active && time - thumbAt > 2000) {
          thumbAt = time;
          const thumb = canvasOf(180, 135);
          contextOf(thumb).drawImage(c, 0, 0, 180, 135);
          props.current.onThumbnail(thumb.toDataURL("image/jpeg", 0.7));
        }
        processCanvas(c, props.current.treatment);
      }
      handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(handle);
    };
  }, [active, streamReady]);
  return (
    <div
      className={`camera-surface ${!active ? "sample" : ""}`}
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
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        aria-label={active ? "Live filtered camera preview" : "Camera is off"}
        role="img"
      />
      <div className="viewfinder-top">
        <span className="viewfinder-status">
          <i className={streamReady ? "live" : ""} />
          {active ? (streamReady ? "Live" : "Camera") : "Camera off"}
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
      {active && !streamReady && (
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
