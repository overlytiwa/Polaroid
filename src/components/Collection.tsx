import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Image as ImageIcon,
  Plus,
  Trash2,
  Pencil,
  Upload,
} from "lucide-react";
import type { Draft, Photo } from "../lib/types";
import Preview from "./Preview";
import Modal from "./Modal";
export default function Collection({
  photos,
  drafts,
  onOpen,
  onExport,
  onDelete,
  onDraft,
  onDeleteDraft,
  onUpload,
}: {
  photos: Photo[];
  drafts: Draft[];
  onOpen: (p: Photo) => void;
  onExport: (p: Photo) => void;
  onDelete: (p: Photo) => void;
  onDraft: (d: Draft) => void;
  onDeleteDraft: (d: Draft) => void;
  onUpload: () => void;
}) {
  const [tab, setTab] = useState<"photos" | "drafts" | "finished">("photos"),
    [viewing, setViewing] = useState<string | null>(null);
  const shown = photos.filter((p) =>
      tab === "finished" ? p.kind === "composition" : p.kind !== "composition",
    ),
    current = shown.find((p) => p.id === viewing),
    index = shown.findIndex((p) => p.id === viewing);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);
  const navigate = (step: number) =>
    setViewing(shown[(index + step + shown.length) % shown.length]?.id ?? null);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Collection</h1>
        </div>
        <button className="button secondary" onClick={onUpload}>
          <Upload size={16} />
          Add photographs
        </button>
      </div>
      <div className="collection-tabs">
        <button
          className={tab === "photos" ? "active" : ""}
          onClick={() => setTab("photos")}
        >
          Photographs{" "}
          <span>{photos.filter((p) => p.kind !== "composition").length}</span>
        </button>
        <button
          className={tab === "drafts" ? "active" : ""}
          onClick={() => setTab("drafts")}
        >
          Saved drafts <span>{drafts.length}</span>
        </button>
        <button
          className={tab === "finished" ? "active" : ""}
          onClick={() => setTab("finished")}
        >
          Finished compositions{" "}
          <span>{photos.filter((p) => p.kind === "composition").length}</span>
        </button>
      </div>
      {tab === "drafts" ? (
        drafts.length ? (
          <div className="collection-grid">
            {drafts.map((d) => (
              <article className="collection-card" key={d.id}>
                <button
                  onClick={() => onDraft(d)}
                  aria-label={`Edit ${d.name}`}
                >
                  <Preview draft={d} photos={photos} width={480} />
                  <h3>{d.name}</h3>
                  <p>
                    {d.slots.filter((s) => s.photoId).length} of{" "}
                    {d.slots.length} photographs
                  </p>
                </button>
                <button
                  className="icon-button delete-draft"
                  onClick={() => onDeleteDraft(d)}
                  aria-label={`Delete draft ${d.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Pencil size={36} strokeWidth={1} />
            <h2>No drafts yet</h2>
            <p>Choose a layout to begin. Your drafts save as you go.</p>
          </div>
        )
      ) : shown.length ? (
        <div className="collection-grid">
          {shown.map((p) => (
            <article className="collection-card" key={p.id}>
              <button
                aria-label={`View ${p.name}`}
                onClick={() => setViewing(p.id)}
              >
                <div className="collection-image">
                  <img src={p.thumbnailUrl} alt={p.name} loading="lazy" />
                </div>
                <div className="collection-meta">
                  <h3>{p.name}</h3>
                  <span>
                    {new Date(p.takenAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p>
                  {p.kind === "legacy"
                    ? "Original gallery"
                    : p.kind === "capture"
                      ? "Captured here"
                      : p.kind === "composition"
                        ? "Finished composition"
                        : "Imported photograph"}
                </p>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ImageIcon size={40} strokeWidth={1} />
          <h2>
            {tab === "finished"
              ? "No finished compositions"
              : "No photographs yet"}
          </h2>
          <p>
            {tab === "finished"
              ? "Save a finished layout to keep it here."
              : "Your captures and uploaded photographs will appear here."}
          </p>
          {tab === "photos" && (
            <button className="button secondary" onClick={onUpload}>
              <Plus size={15} />
              Add your first photograph
            </button>
          )}
        </div>
      )}
      {current && (
        <Modal title="Photo" onClose={() => setViewing(null)} wide>
          <div
            className="gallery-view"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") navigate(1);
              if (e.key === "ArrowLeft") navigate(-1);
            }}
            onPointerDown={(e) => setSwipeStart(e.clientX)}
            onPointerUp={(e) => {
              if (swipeStart !== null && Math.abs(e.clientX - swipeStart) > 50)
                navigate(e.clientX < swipeStart ? 1 : -1);
              setSwipeStart(null);
            }}
          >
            <Preview
              photo={current}
              treatment={current.treatment}
              frame={current.kind !== "composition"}
              width={800}
              label="Saved photograph"
            />
          </div>
          <div className="gallery-navigation">
            <button
              className="icon-button"
              aria-label="Previous photo"
              disabled={shown.length < 2}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={19} />
            </button>
            <span className="quiet">
              {index + 1} of {shown.length}
            </span>
            <button
              className="icon-button"
              aria-label="Next photo"
              disabled={shown.length < 2}
              onClick={() => navigate(1)}
            >
              <ArrowRight size={19} />
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                onExport(current);
                setViewing(null);
              }}
            >
              <Download size={15} />
              Download
            </button>
            <button
              className="button secondary"
              onClick={() => {
                onOpen(current);
                setViewing(null);
              }}
            >
              <Pencil size={15} />
              Edit photo
            </button>
            <button
              className="icon-button danger"
              aria-label="Delete photograph"
              onClick={() => {
                onDelete(current);
                setViewing(null);
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
