import { useState } from "react";
import { Download } from "lucide-react";
import { downloadCanvas, renderComposition, renderPhoto } from "../lib/render";
import { friendlyError } from "../lib/storage";
import type { Draft, Photo, Treatment } from "../lib/types";
import Modal from "./Modal";
import Preview from "./Preview";
export default function ExportDialog({
  draft,
  photos,
  photo,
  treatment,
  onClose,
  onSave,
}: {
  draft?: Draft;
  photos: Photo[];
  photo?: Photo;
  treatment?: Treatment;
  onClose: () => void;
  onSave: (blob: Blob, name: string) => Promise<void>;
}) {
  const [format, setFormat] = useState<"png" | "jpeg">("png"),
    [size, setSize] = useState("3000"),
    [frame, setFrame] = useState(!draft && photo?.kind !== "composition"),
    [name, setName] = useState(
      draft?.name.toLowerCase().replaceAll(" ", "-") ?? "polaroid-memory",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function exportImage(save = false) {
    setBusy(true);
    setError("");
    try {
      const canvas = draft
        ? await renderComposition(draft, photos, Number(size), false)
        : await renderPhoto(
            photo!,
            treatment ?? photo!.treatment,
            size === "original" ? "original" : Number(size),
            frame,
          );
      if (save) {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Could not create the image.")),
            "image/png",
          ),
        );
        await onSave(blob, name);
        setSaved(true);
      } else await downloadCanvas(canvas, name, format);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Download"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="export-preview">
        <Preview
          draft={draft}
          photos={photos}
          photo={photo}
          treatment={treatment}
          frame={frame}
          width={500}
          label="Download preview"
        />
      </div>
      <div className="form-grid">
        <label>
          File name
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}
          >
            <option value="png">PNG — lossless</option>
            <option value="jpeg">JPEG — high quality</option>
          </select>
        </label>
        <label>
          Image size
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="1600">Web friendly · 1600px wide</option>
            <option value="3000">Print friendly · 3000px wide</option>
            <option value="4000">Large · 4000px wide</option>
            {!draft && (
              <option value="original">Original size · up to 6000px</option>
            )}
          </select>
        </label>
      </div>
      {!draft && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={frame}
            onChange={(e) => setFrame(e.target.checked)}
          />
          Polaroid frame
        </label>
      )}
      <p className="quiet">
        {draft
          ? "The complete composition, including text, paper and shadows."
          : "Rendered from your source photograph. The original stays untouched."}
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button"
          disabled={busy}
          onClick={() => exportImage()}
        >
          <Download size={16} />
          {busy ? "Developing your image…" : "Download image"}
        </button>
        {draft && (
          <button
            className="button secondary"
            disabled={busy || saved}
            onClick={() => exportImage(true)}
          >
            {saved ? "Saved to collection" : "Save finished composition"}
          </button>
        )}
      </div>
    </Modal>
  );
}
