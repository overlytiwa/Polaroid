import { useEffect, useRef, useState } from "react";
import { renderComposition, renderPhoto } from "../lib/render";
import { friendlyError } from "../lib/storage";
import type { Draft, Photo, Treatment } from "../lib/types";
const NO_PHOTOS: Photo[] = [];
export default function Preview({
  draft,
  photos = NO_PHOTOS,
  photo,
  treatment,
  frame = false,
  width = 900,
  label = "Composition preview",
}: {
  draft?: Draft;
  photos?: Photo[];
  photo?: Photo;
  treatment?: Treatment;
  frame?: boolean;
  width?: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (cancelled) return;
        setBusy(true);
        try {
          const output = draft
            ? await renderComposition(draft, photos, width)
            : photo
              ? await renderPhoto(
                  photo,
                  treatment ?? photo.treatment,
                  width,
                  frame,
                )
              : null;
          if (cancelled || !output || !ref.current) return;
          ref.current.width = output.width;
          ref.current.height = output.height;
          ref.current.getContext("2d")!.drawImage(output, 0, 0);
          setError("");
        } catch (e) {
          if (!cancelled) setError(friendlyError(e));
        } finally {
          if (!cancelled) setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft, photos, photo, treatment, frame, width]);
  return (
    <div className="render-preview" aria-busy={busy}>
      <canvas ref={ref} aria-label={label} role="img" />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
