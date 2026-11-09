import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  Image as ImageIcon,
} from "lucide-react";
import { createDraft, FONTS, LAYOUT_MAP, PHRASES } from "../lib/layouts";
import {
  originalTreatment,
  type Draft,
  type Photo,
  type Slot,
} from "../lib/types";
import Preview from "./Preview";
import Range from "./Range";
import FilterBrowser from "./FilterBrowser";
import TreatmentControls from "./TreatmentControls";
export default function CompositionEditor({
  draft,
  photos,
  onChange,
  onPick,
  onBack,
  onExport,
  favorites,
  toggleFavorite,
  saveState,
}: {
  draft: Draft;
  photos: Photo[];
  onChange: (d: Draft) => void;
  onPick: (slot: number) => void;
  onBack: () => void;
  onExport: () => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  saveState: string;
}) {
  const layout = LAYOUT_MAP.get(draft.layoutId)!,
    [selected, setSelected] = useState(0),
    [tab, setTab] = useState<"photos" | "text">("photos"),
    [all, setAll] = useState(false),
    [textId, setTextId] = useState(layout.texts[0].id),
    [phraseCategory, setPhraseCategory] = useState("Memories");
  const slot = draft.slots[selected],
    photo = photos.find((p) => p.id === slot.photoId),
    complete = draft.slots.every((s) => photos.some((p) => p.id === s.photoId)),
    filled = draft.slots.filter((s) =>
      photos.some((p) => p.id === s.photoId),
    ).length;
  const editSlot = (patch: Partial<Slot>) =>
    onChange({
      ...draft,
      slots: draft.slots.map((s, i) =>
        i === selected ? { ...s, ...patch } : s,
      ),
    });
  const text = draft.texts[textId] ?? layout.texts[0].default;
  const editText = (patch: Partial<typeof text>) =>
    onChange({
      ...draft,
      texts: { ...draft.texts, [textId]: { ...text, ...patch } },
    });
  function reorder(direction: number) {
    const slots = [...draft.slots],
      other = selected + direction;
    if (other < 0 || other >= slots.length) return;
    [slots[selected], slots[other]] = [slots[other], slots[selected]];
    onChange({ ...draft, slots });
    setSelected(other);
  }
  return (
    <>
      <div className="editor-heading">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} />
          All layouts
        </button>
        <span className="save-status">
          <Check size={12} />
          {saveState}
        </span>
      </div>
      <div className="workspace composition-workspace">
        <div className="composition-main">
          <div className="composition-title">
            <div>
              <h1>{layout.name}</h1>
            </div>
            <span className="photo-progress">
              {filled} / {layout.slots.length} photos
            </span>
          </div>
          <div className="composition-stage">
            <Preview draft={draft} photos={photos} width={1000} />
          </div>
          <div className="slot-strip" aria-label="Photo slots">
            {draft.slots.map((s, i) => {
              const p = photos.find((p) => p.id === s.photoId);
              return (
                <button
                  key={i}
                  className={`slot-button ${selected === i ? "active" : ""}`}
                  aria-label={`Select photo slot ${i + 1}`}
                  aria-pressed={selected === i}
                  onClick={() => {
                    setSelected(i);
                    setTab("photos");
                  }}
                >
                  {p ? <img src={p.thumbnailUrl} alt="" /> : <Plus size={19} />}
                  <span>Photo {i + 1}</span>
                </button>
              );
            })}
          </div>
          <p className="draft-note">
            {complete
              ? "All photographs added"
              : `This layout needs ${layout.slots.length} ${layout.slots.length === 1 ? "photo" : "photos"}. Add ${layout.slots.length - filled} more to finish your composition.`}
          </p>
        </div>
        <aside className="editor-panel">
          <div className="panel-tabs">
            <button
              className={tab === "photos" ? "active" : ""}
              onClick={() => setTab("photos")}
            >
              <ImageIcon size={15} />
              Photographs
            </button>
            <button
              className={tab === "text" ? "active" : ""}
              onClick={() => setTab("text")}
            >
              <Type size={15} />
              Words
            </button>
          </div>
          {tab === "photos" ? (
            <>
              <div className="slot-edit-header">
                <h3>
                  Photo {selected + 1} of {layout.slots.length}
                </h3>
                <button
                  className="text-button"
                  onClick={() => onPick(selected)}
                >
                  {photo ? "Replace" : "Choose photo"}
                </button>
              </div>
              {!photo ? (
                <button
                  className="choose-photo"
                  onClick={() => onPick(selected)}
                >
                  <Camera size={24} />
                  <span>Add a little memory</span>
                  <small>Upload, take a photo, or use your collection</small>
                </button>
              ) : (
                <>
                  <Range
                    label="Crop zoom"
                    value={slot.zoom}
                    min={1}
                    max={3}
                    step={0.01}
                    suffix="×"
                    onChange={(zoom) => editSlot({ zoom })}
                  />
                  <Range
                    label="Crop horizontal"
                    value={slot.panX}
                    min={-100}
                    onChange={(panX) => editSlot({ panX })}
                  />
                  <Range
                    label="Crop vertical"
                    value={slot.panY}
                    min={-100}
                    onChange={(panY) => editSlot({ panY })}
                  />
                  <div className="slot-actions">
                    <button
                      className="icon-button"
                      disabled={selected === 0}
                      aria-label="Move photo earlier"
                      onClick={() => reorder(-1)}
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={selected === draft.slots.length - 1}
                      aria-label="Move photo later"
                      onClick={() => reorder(1)}
                    >
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => editSlot({ photoId: null })}
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                </>
              )}
              {["bali", "mixtape"].includes(layout.id) && (
                <details className="advanced">
                  <summary>Print arrangement</summary>
                  <Range
                    label="Print rotation"
                    value={slot.rotation}
                    min={-12}
                    max={12}
                    suffix="°"
                    onChange={(rotation) => editSlot({ rotation })}
                  />
                  <Range
                    label="Print horizontal"
                    value={slot.x}
                    min={-60}
                    max={60}
                    onChange={(x) => editSlot({ x })}
                  />
                  <Range
                    label="Print vertical"
                    value={slot.y}
                    min={-60}
                    max={60}
                    onChange={(y) => editSlot({ y })}
                  />
                  <Range
                    label="Print scale"
                    value={slot.scale}
                    min={0.85}
                    max={1.12}
                    step={0.01}
                    onChange={(scale) => editSlot({ scale })}
                  />
                </details>
              )}
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={(e) => {
                    setAll(e.target.checked);
                    if (e.target.checked)
                      onChange({
                        ...draft,
                        slots: draft.slots.map((s) => ({
                          ...s,
                          filterId: slot.filterId,
                          intensity: slot.intensity,
                          adjustments: { ...slot.adjustments },
                        })),
                      });
                  }}
                />
                Use the same look on every photo
              </label>
              <TreatmentControls
                treatment={slot}
                onChange={(t) =>
                  onChange({
                    ...draft,
                    slots: draft.slots.map((s, i) =>
                      all || i === selected
                        ? {
                            ...s,
                            filterId: t.filterId,
                            intensity: t.intensity,
                            adjustments: { ...t.adjustments },
                          }
                        : s,
                    ),
                  })
                }
                favorites={favorites}
                toggleFavorite={toggleFavorite}
              />
              <button
                className="text-button"
                onClick={() => {
                  const base = createDraft(layout.id);
                  onChange({
                    ...draft,
                    slots: draft.slots.map((s, i) => ({
                      ...base.slots[i],
                      photoId: s.photoId,
                      ...{
                        filterId: s.filterId,
                        intensity: s.intensity,
                        adjustments: s.adjustments,
                      },
                    })),
                  });
                }}
              >
                <RotateCcw size={13} />
                Reset print arrangement
              </button>
            </>
          ) : (
            <div className="text-editor">
              <label>
                Text area
                <select
                  value={textId}
                  onChange={(e) => setTextId(e.target.value)}
                >
                  {layout.texts.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Your words
                <textarea
                  maxLength={1000}
                  rows={5}
                  value={text.value}
                  onChange={(e) => editText({ value: e.target.value })}
                />
              </label>
              <p className="quiet">
                Line breaks are kept. Long messages fit automatically.
              </p>
              <label>
                Handwriting & type
                <select
                  value={text.font}
                  onChange={(e) => editText({ font: e.target.value })}
                >
                  {FONTS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <Range
                label="Text size"
                min={10}
                max={100}
                value={text.size}
                onChange={(size) => editText({ size })}
              />
              <div className="form-grid">
                <label>
                  Ink color
                  <input
                    type="color"
                    value={text.color}
                    onChange={(e) => editText({ color: e.target.value })}
                  />
                </label>
                <label>
                  Alignment
                  <select
                    value={text.align}
                    onChange={(e) =>
                      editText({ align: e.target.value as CanvasTextAlign })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </div>
              <details className="advanced">
                <summary>Text spacing</summary>
                <Range
                  label="Line spacing"
                  value={text.lineHeight}
                  min={0.9}
                  max={2}
                  step={0.05}
                  onChange={(lineHeight) => editText({ lineHeight })}
                />
                <Range
                  label="Letter spacing"
                  value={text.letterSpacing}
                  min={0}
                  max={8}
                  step={0.25}
                  onChange={(letterSpacing) => editText({ letterSpacing })}
                />
              </details>
              <label>
                A few words to borrow
                <select
                  value={phraseCategory}
                  onChange={(e) => setPhraseCategory(e.target.value)}
                >
                  {Object.keys(PHRASES).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className="phrase-list">
                {PHRASES[phraseCategory].map((value) => (
                  <button key={value} onClick={() => editText({ value })}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="editor-export">
            <button className="button" disabled={!complete} onClick={onExport}>
              <Download size={16} />
              Download composition
            </button>
            {!complete && (
              <small>
                Add all {layout.slots.length} photographs to download.
              </small>
            )}
          </div>
        </aside>
      </div>
      {tab === "photos" && (
        <FilterBrowser
          selected={slot.filterId}
          source={photo?.url}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          onSelect={(filterId) =>
            onChange({
              ...draft,
              slots: draft.slots.map((s, i) =>
                all || selected === i
                  ? { ...s, ...originalTreatment(), filterId }
                  : s,
              ),
            })
          }
        />
      )}
    </>
  );
}
