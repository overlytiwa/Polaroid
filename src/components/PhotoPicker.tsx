import { Camera, Upload, Image as ImageIcon } from "lucide-react";
import type { Photo } from "../lib/types";
import Modal from "./Modal";
export default function PhotoPicker({
  photos,
  slot,
  onChoose,
  onUpload,
  onCamera,
  onClose,
}: {
  photos: Photo[];
  slot: number;
  onChoose: (p: Photo) => void;
  onUpload: () => void;
  onCamera: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`Choose photo ${slot + 1}`} onClose={onClose} wide>
      <p className="description">
        Upload, capture, or choose a saved photo. Photos can be reused in
        multiple slots.
      </p>
      <div className="picker-options">
        <button className="button" onClick={onUpload}>
          <Upload size={16} />
          Upload a photo
        </button>
        <button className="button secondary" onClick={onCamera}>
          <Camera size={16} />
          Take a new photo
        </button>
      </div>
      {photos.length ? (
        <div className="picker-grid">
          {photos
            .filter((p) => p.kind !== "composition")
            .map((p) => (
              <button
                key={p.id}
                aria-label={`Use ${p.name}`}
                onClick={() => onChoose(p)}
              >
                <img src={p.thumbnailUrl} alt={p.name} loading="lazy" />
                <span>{p.name}</span>
              </button>
            ))}
        </div>
      ) : (
        <div className="empty-state small">
          <ImageIcon size={30} />
          <p>No saved photographs</p>
        </div>
      )}
    </Modal>
  );
}
