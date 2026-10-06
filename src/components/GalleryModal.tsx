import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import ControlButton from "./controlButton";
import type { Photo } from "../lib/usePhotos";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(-2)}`;
}

// ─── Polaroid card ───────────────────────────────────────────────────────────

interface PolaroidCardProps {
  photo: Photo;
}

function PolaroidCard({ photo }: PolaroidCardProps) {
  return (
    <div className="polaroid-card">
      <span className="polaroid-time">{formatTime(photo.takenAt)}</span>
      <div className="polaroid-image-area">
        <img src={photo.dataUrl} alt="Captured" className="polaroid-img" />
      </div>
      <div className="polaroid-footer">
        <span className="polaroid-date">{formatDate(photo.takenAt)}</span>
        <span className="polaroid-watermark">polaroid.overly.cc</span>
      </div>
    </div>
  );
}

// ─── Download helper ─────────────────────────────────────────────────────────

function downloadPolaroid(photo: Photo) {
  // ── Canvas geometry (mirrors CSS layout exactly) ───────────────────────
  // Export scale: 3× CSS pixels
  //
  // CSS card: padding 0 24px (sides)
  // CSS time: padding 20px 0 10px   → TIME_H = (20+16+10)×3 = 138 → round to 138
  // CSS photo: width = card - 2×24px side padding, aspect 3:4
  // CSS footer: padding 12px 0 24px → FOOTER_H = (12+16+24)×3 = 156 → use 156
  //
  // At 3× scale:
  //   CARD_W   = 1080
  //   PAD_SIDE = 72   (24px × 3)
  //   IMG_W    = CARD_W - 2 × PAD_SIDE = 936
  //   IMG_H    = IMG_W × (4/3) = 1248
  //   TIME_H   = 138
  //   FOOTER_H = 156
  //   CARD_H   = TIME_H + IMG_H + FOOTER_H = 1542

  const CARD_W   = 1080;
  const PAD_SIDE = 120;                                   // 40px × 3
  const IMG_W    = CARD_W - PAD_SIDE * 2;                // 840
  const IMG_H    = Math.round(IMG_W * (4 / 3));           // 1120
  const TIME_H   = 168;                                   // 28+12+12 px × 3
  const FOOTER_H = 180;                                   // 14+12+36 px × 3
  const CARD_H   = TIME_H + IMG_H + FOOTER_H;            // 1468

  const FONT_SIZE = 36; // ~12px CSS at 3× scale

  const canvas = document.createElement("canvas");
  canvas.width  = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Photo is inset by PAD_SIDE on each side
  const imgX = PAD_SIDE;
  const imgY = TIME_H;

  const img = new Image();
  img.onload = () => {
    // Black photo area
    ctx.fillStyle = "#000000";
    ctx.fillRect(imgX, imgY, IMG_W, IMG_H);

    // Cover-fit photo into the 3:4 area
    const scaleX = IMG_W / img.naturalWidth;
    const scaleY = IMG_H / img.naturalHeight;
    const s  = Math.max(scaleX, scaleY);
    const dw = img.naturalWidth  * s;
    const dh = img.naturalHeight * s;
    const dx = imgX + (IMG_W - dw) / 2;
    const dy = imgY + (IMG_H - dh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(imgX, imgY, IMG_W, IMG_H);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();

    ctx.fillStyle = "#000000";
    ctx.font = `${FONT_SIZE}px 'Times New Roman', Times, serif`;
    ctx.textBaseline = "middle";

    // Time — top right, aligned to photo right edge, centred vertically in TIME_H
    ctx.textAlign = "right";
    ctx.fillText(formatTime(photo.takenAt), imgX + IMG_W, TIME_H / 2);

    // Footer row centred vertically in FOOTER_H, aligned to photo edges
    const footerMidY = imgY + IMG_H + FOOTER_H / 2;

    // Date — bottom left
    ctx.textAlign = "left";
    ctx.fillText(formatDate(photo.takenAt), imgX, footerMidY);

    // Watermark — bottom right
    ctx.textAlign = "right";
    ctx.fillText("polaroid.overly.cc", imgX + IMG_W, footerMidY);

    const url = canvas.toDataURL("image/png");
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `polaroid_${photo.takenAt.replace(/[:.]/g, "-")}.png`;
    a.click();
  };
  img.src = photo.dataUrl;
}


// ─── Gallery Modal ───────────────────────────────────────────────────────────

interface GalleryModalProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const SWIPE_THRESHOLD = 50;

export default function GalleryModal({ photos, initialIndex, onClose, onDelete }: GalleryModalProps) {
  const [index, setIndex] = useState(Math.min(initialIndex, photos.length - 1));
  // prev keeps track of the last index so we know slide direction
  const prevIndexRef = useRef(index);
  // slideDir: "left" = going forward (next), "right" = going back (prev), null = initial
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  // animKey increments to remount the animated card
  const [animKey, setAnimKey] = useState(0);

  const pointerStartX = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Clamp index when photos change (e.g. after delete)
  useEffect(() => {
    if (photos.length === 0) { onClose(); return; }
    setIndex((i) => Math.min(i, photos.length - 1));
  }, [photos.length, onClose]);

  const navigate = (next: number) => {
    if (next === index) return;
    const dir = next > index ? "left" : "right";
    prevIndexRef.current = index;
    setSlideDir(dir);
    setAnimKey((k) => k + 1);
    setIndex(next);
  };

  const goNext = () => navigate(Math.min(index + 1, photos.length - 1));
  const goPrev = () => navigate(Math.max(index - 1, 0));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft")  goPrev();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const start = pointerStartX.current;
    pointerStartX.current = null;
    if (start === null) return;
    const dx = e.clientX - start;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) goNext();
    else        goPrev();
  };

  const current = photos[index];

  // Slide-in class based on direction
  const slideClass = slideDir === "left"
    ? "polaroid-slide-from-right"
    : slideDir === "right"
      ? "polaroid-slide-from-left"
      : "";

  return (
    <div
      className="gallery-overlay"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
    >
      {/* Close button */}
      <button className="gallery-close-btn" aria-label="Close gallery" onClick={onClose}>
        <Icon icon="lucide:x" width={22} height={22} />
      </button>

      {/* Page indicator */}
      {photos.length > 1 && (
        <div className="gallery-indicator">
          {photos.map((_, i) => (
            <button
              key={i}
              className={`gallery-dot${i === index ? " active" : ""}`}
              aria-label={`Go to photo ${i + 1}`}
              onClick={() => navigate(i)}
            />
          ))}
        </div>
      )}

      {/* Carousel */}
      <div
        className="gallery-carousel"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartX.current = null; }}
      >
        <div className="gallery-carousel-track" ref={cardRef}>
          {current && (
            <div key={animKey} className={`polaroid-wrapper ${slideClass}`}>
              <PolaroidCard photo={current} />
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {current && (
        <div className="gallery-actions">
          <ControlButton
            icon="lucide:download"
            label="Download image"
            size={48}
            onClick={() => downloadPolaroid(current)}
          />
          <ControlButton
            icon="lucide:trash-2"
            label="Delete image"
            size={48}
            onClick={() => onDelete(current.id)}
          />
        </div>
      )}

      {/* Arrow navigation for wider screens */}
      {index > 0 && (
        <button className="gallery-arrow left" aria-label="Previous photo" onClick={goPrev}>
          <Icon icon="lucide:chevron-left" width={28} height={28} />
        </button>
      )}
      {index < photos.length - 1 && (
        <button className="gallery-arrow right" aria-label="Next photo" onClick={goNext}>
          <Icon icon="lucide:chevron-right" width={28} height={28} />
        </button>
      )}
    </div>
  );
}
