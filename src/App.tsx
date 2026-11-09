import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera as CameraIcon,
  Check,
  Download,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  SwitchCamera,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Camera, { type CameraHandle } from "./components/camera";
import CaptureButton from "./components/captureButton";
import FilterBrowser from "./components/FilterBrowser";
import TreatmentControls from "./components/TreatmentControls";
import LayoutSelector from "./components/LayoutSelector";
import CompositionEditor from "./components/CompositionEditor";
import PhotoPicker from "./components/PhotoPicker";
import Collection from "./components/Collection";
import Preview from "./components/Preview";
import Modal from "./components/Modal";
import ExportDialog from "./components/ExportDialog";
import { usePhotos } from "./lib/usePhotos";
import { createDraft, LAYOUT_MAP } from "./lib/layouts";
import { FILTERS } from "./lib/filters";
import { friendlyError } from "./lib/storage";
import {
  originalTreatment,
  type Draft,
  type LayoutId,
  type Photo,
  type Treatment,
} from "./lib/types";
import shutterSoundUrl from "./assets/sounds/camera_shutter.mp3";
import iconUrl from "./assets/images/icon.png";
import "./App.css";

type Page = "camera" | "layouts" | "collection";
type SlotTarget = { draftId: string; index: number };
function readSetting<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function writeSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Preferences are optional; photo storage errors are surfaced separately. */
  }
}
export default function App() {
  const store = usePhotos(),
    { photos, drafts, ready, error, setError, addPhoto, saveDraft } = store;
  const [page, setPage] = useState<Page>("camera"),
    [cameraActive, setCameraActive] = useState(true),
    [cameraReady, setCameraReady] = useState(false),
    [facing, setFacing] = useState<"user" | "environment">("user"),
    [treatment, setTreatment] = useState<Treatment>(originalTreatment),
    [favorites, setFavorites] = useState<string[]>(() =>
      readSetting("polaroid-favorites", []),
    ),
    [muted, setMuted] = useState(() => readSetting("polaroid-muted", false));
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [editing, setEditing] = useState(false),
    [saveState, setSaveState] = useState("Saved on this device"),
    [picker, setPicker] = useState<number | null>(null),
    [target, setTarget] = useState<SlotTarget | null>(null),
    [review, setReview] = useState<Photo | null>(null),
    [exporting, setExporting] = useState<{
      photo?: Photo;
      draft?: Draft;
      treatment?: Treatment;
    } | null>(null),
    [deleteTarget, setDeleteTarget] = useState<{
      photo?: Photo;
      draft?: Draft;
    } | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [flash, setFlash] = useState(false),
    [thumbnail, setThumbnail] = useState("/samples/lake.jpg");
  const cameraRef = useRef<CameraHandle>(null),
    inputRef = useRef<HTMLInputElement>(null),
    uploadTarget = useRef<SlotTarget | null>(null),
    draftRef = useRef(draft),
    saveQueue = useRef(Promise.resolve()),
    audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    writeSetting("polaroid-favorites", favorites);
  }, [favorites]);
  useEffect(() => {
    writeSetting("polaroid-muted", muted);
  }, [muted]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 350);
    return () => clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);
  // Writes are queued in edit order, so a slower earlier save cannot replace a newer one.
  useEffect(() => {
    if (!draft || !ready) return;
    const snapshot = structuredClone(draft);
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => {
        setSaveState("Saving…");
        return saveDraft(snapshot);
      })
      .then(() => {
        if (draftRef.current?.updatedAt === snapshot.updatedAt)
          setSaveState("Saved on this device");
      })
      .catch((e) => {
        setSaveState("Could not save");
        setError(friendlyError(e));
      });
    writeSetting("polaroid-active-draft", draft.id);
  }, [draft, ready, saveDraft, setError]);
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const id = readSetting<string>("polaroid-active-draft", "");
    const existing = drafts.find((d) => d.id === id);
    if (existing) queueMicrotask(() => setDraft(existing));
  }, [ready, drafts]);
  const toggleFavorite = (id: string) =>
    setFavorites((f) =>
      f.includes(id) ? f.filter((x) => x !== id) : [...f, id],
    );
  const updateDraft = (d: Draft) =>
    setDraft({ ...d, updatedAt: new Date().toISOString() });
  function changePage(next: Page) {
    if (next !== "camera") setCameraActive(false);
    setPage(next);
  }
  function chooseLayout(id: LayoutId) {
    const same =
      draft?.layoutId === id ? draft : drafts.find((d) => d.layoutId === id);
    setDraft(same ?? createDraft(id));
    setEditing(true);
    changePage("layouts");
  }
  function assign(photo: Photo, destination: SlotTarget) {
    const current = draftRef.current;
    if (!current || current.id !== destination.draftId)
      throw new Error(
        "The selected draft has changed. Please choose the photograph again.",
      );
    updateDraft({
      ...current,
      slots: current.slots.map((s, i) =>
        i === destination.index
          ? {
              ...s,
              photoId: photo.id,
              filterId: photo.treatment.filterId,
              intensity: photo.treatment.intensity,
              adjustments: { ...photo.treatment.adjustments },
            }
          : s,
      ),
    });
  }
  function requestUpload(destination: SlotTarget | null = null) {
    uploadTarget.current = destination;
    inputRef.current?.click();
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const destination = uploadTarget.current;
    setBusy(true);
    try {
      let first: Photo | null = null;
      for (const file of Array.from(files)) {
        const p = await addPhoto(
          file,
          "upload",
          file.name.replace(/\.[^.]+$/, ""),
        );
        first ??= p;
      }
      if (first && destination) {
        assign(first, destination);
        setPage("layouts");
        setEditing(true);
      } else if (first) {
        setSelectedPhoto(first);
        setTreatment(first.treatment);
        setCameraActive(false);
        setPage("camera");
      }
      setNotice(
        `${files.length === 1 ? "Photograph" : `${files.length} photographs`} added to your collection.`,
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      uploadTarget.current = null;
    }
  }
  async function capture() {
    if (busy || !cameraReady) return;
    setBusy(true);
    try {
      const blob = await cameraRef.current?.capture();
      if (!blob)
        throw new Error("Wait for the camera to be ready, then try again.");
      if (!muted) {
        audioRef.current ??= new Audio(shutterSoundUrl);
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.45;
        audioRef.current.play().catch(() => {});
      }
      setFlash(true);
      const url = URL.createObjectURL(blob);
      setReview({
        id: "review",
        blob,
        thumbnail: blob,
        url,
        thumbnailUrl: url,
        width: 0,
        height: 0,
        name: "A little moment",
        takenAt: new Date().toISOString(),
        kind: "capture",
        treatment: structuredClone(treatment),
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  function dismissReview() {
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
  }
  async function acceptCapture() {
    if (!review) return;
    setBusy(true);
    try {
      const p = await addPhoto(
        review.blob,
        "capture",
        `Moment ${photos.filter((p) => p.kind === "capture").length + 1}`,
        review.treatment,
      );
      if (target) {
        assign(p, target);
        setEditing(true);
        changePage("layouts");
        setTarget(null);
      } else {
        setSelectedPhoto(p);
        setTreatment(p.treatment);
        setCameraActive(false);
      }
      dismissReview();
      setNotice("Photograph saved");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const readyCallback = useCallback(
    (value: boolean) => setCameraReady(value),
    [],
  );
  const thumbnailCallback = useCallback((url: string) => setThumbnail(url), []);
  function swipe(direction: number) {
    const i = FILTERS.findIndex((f) => f.id === treatment.filterId);
    setTreatment((t) => ({
      ...t,
      filterId: FILTERS[(i + direction + FILTERS.length) % FILTERS.length].id,
    }));
  }
  async function confirmDelete() {
    try {
      await saveQueue.current;
      if (deleteTarget?.photo) {
        if (draft?.slots.some((s) => s.photoId === deleteTarget.photo?.id))
          throw new Error(
            "This photo is used in your current draft. Remove it from that draft first.",
          );
        await store.deletePhoto(deleteTarget.photo.id);
        if (selectedPhoto?.id === deleteTarget.photo.id) setSelectedPhoto(null);
      }
      if (deleteTarget?.draft) {
        await store.deleteDraft(deleteTarget.draft.id);
        if (draft?.id === deleteTarget.draft.id) {
          setDraft(null);
          setEditing(false);
        }
      }
      setDeleteTarget(null);
    } catch (e) {
      setError(friendlyError(e));
      setDeleteTarget(null);
    }
  }
  const inComposer = page === "layouts" && editing && draft;
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      <div className="app-shell">
        <header className="site-header">
          <button
            className="brand"
            onClick={() => changePage("camera")}
            aria-label="Polaroid home"
          >
            <img src={iconUrl} alt="" />
            <span>Polaroid</span>
          </button>
          <nav aria-label="Main navigation">
            <button
              className={page === "camera" ? "active" : ""}
              onClick={() => changePage("camera")}
            >
              <CameraIcon size={15} />
              Camera
            </button>
            <button
              className={page === "layouts" ? "active" : ""}
              onClick={() => changePage("layouts")}
            >
              <Layers size={15} />
              Layouts
            </button>
            <button
              className={page === "collection" ? "active" : ""}
              onClick={() => changePage("collection")}
            >
              <ImageIcon size={15} />
              Gallery<span className="nav-count">{photos.length}</span>
            </button>
          </nav>
        </header>
        <main id="main">
          {page === "camera" && (
            <>
              <div className="workspace camera-workspace">
                <section
                  className="camera-column"
                  aria-label="Camera workspace"
                >
                  <div className="camera-mat">
                    {selectedPhoto && !cameraActive ? (
                      <>
                        <div className="selected-photo">
                          <Preview
                            photo={selectedPhoto}
                            treatment={treatment}
                            width={1000}
                            label="Your filtered photograph"
                          />
                        </div>
                      </>
                    ) : (
                      <Camera
                        ref={cameraRef}
                        active={cameraActive}
                        facingMode={facing}
                        treatment={treatment}
                        onActivate={() => {
                          setSelectedPhoto(null);
                          setCameraActive(true);
                        }}
                        onImport={() => requestUpload()}
                        onReady={readyCallback}
                        onSwipe={swipe}
                        onThumbnail={thumbnailCallback}
                      />
                    )}
                    {flash && <div className="shutter-flash" />}
                  </div>
                  <div className="camera-control-bar">
                    <button
                      className="collection-thumbnail"
                      onClick={() => changePage("collection")}
                      aria-label="Open gallery"
                    >
                      {photos[0] ? (
                        <img src={photos[0].thumbnailUrl} alt="" />
                      ) : (
                        <ImageIcon size={21} />
                      )}
                      <span>
                        {photos.length
                          ? `${photos.length} kept`
                          : "Your gallery"}
                      </span>
                    </button>
                    <div className="shutter-wrap">
                      {selectedPhoto && !cameraActive ? (
                        <button
                          className="button"
                          onClick={() =>
                            setExporting({ photo: selectedPhoto, treatment })
                          }
                        >
                          <Download size={17} />
                          Download
                        </button>
                      ) : (
                        <CaptureButton
                          size={66}
                          onClick={capture}
                          aria-label="Take photo"
                          disabled={!cameraReady || busy || !ready}
                        />
                      )}
                      {target && (
                        <span>{`Photo ${target.index + 1} of ${draft?.slots.length}`}</span>
                      )}
                    </div>
                    <div className="camera-side-controls">
                      {selectedPhoto && !cameraActive ? (
                        <button
                          className="icon-button"
                          aria-label="Return to camera"
                          onClick={() => {
                            setSelectedPhoto(null);
                            setTarget(null);
                            setCameraActive(true);
                          }}
                        >
                          <CameraIcon size={21} />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          aria-label="Switch front and rear camera"
                          disabled={!cameraActive}
                          onClick={() =>
                            setFacing((f) =>
                              f === "user" ? "environment" : "user",
                            )
                          }
                        >
                          <SwitchCamera size={21} />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label={muted ? "Unmute shutter" : "Mute shutter"}
                        aria-pressed={muted}
                        onClick={() => setMuted((v) => !v)}
                      >
                        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                      </button>
                    </div>
                  </div>
                  {target && (
                    <div className="capture-target">
                      <span>
                        For {draft && LAYOUT_MAP.get(draft.layoutId)?.name} ·
                        Photo {target.index + 1} of {draft?.slots.length}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setTarget(null);
                          changePage("layouts");
                        }}
                      >
                        Back to draft
                      </button>
                    </div>
                  )}
                </section>
              </div>
              <div className="camera-tool-row">
                <button
                  className={`tool-button ${filtersOpen ? "active" : ""}`}
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((v) => !v)}
                >
                  <Layers size={16} />
                  Filters
                </button>
                <button
                  className="tool-button"
                  onClick={() => setControlsOpen(true)}
                >
                  <SlidersHorizontal size={16} />
                  Adjust
                </button>
                <button
                  className="tool-button"
                  onClick={() => requestUpload()}
                  disabled={busy || !ready}
                >
                  <Upload size={16} />
                  Upload
                </button>
              </div>
              {filtersOpen && (
                <FilterBrowser
                  selected={treatment.filterId}
                  source={
                    selectedPhoto && !cameraActive
                      ? selectedPhoto.url
                      : thumbnail
                  }
                  onSelect={(filterId) =>
                    setTreatment((t) => ({ ...t, filterId, intensity: 100 }))
                  }
                  favorites={favorites}
                  toggleFavorite={toggleFavorite}
                />
              )}
            </>
          )}
          {page === "layouts" && !inComposer && (
            <>
              <div className="page-heading">
                <h1>Layouts</h1>
                {draft && (
                  <button
                    className="button secondary"
                    onClick={() => setEditing(true)}
                  >
                    Continue draft
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <LayoutSelector onSelect={chooseLayout} />
            </>
          )}
          {inComposer && (
            <CompositionEditor
              key={draft.id}
              draft={draft}
              photos={photos}
              onChange={updateDraft}
              onPick={setPicker}
              onBack={() => setEditing(false)}
              onExport={() => setExporting({ draft })}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              saveState={saveState}
            />
          )}
          {page === "collection" && (
            <Collection
              photos={photos}
              drafts={drafts}
              onOpen={(p) => {
                setSelectedPhoto(p);
                setTreatment(structuredClone(p.treatment));
                setCameraActive(false);
                changePage("camera");
              }}
              onExport={(p) =>
                setExporting({ photo: p, treatment: p.treatment })
              }
              onDelete={(photo) => setDeleteTarget({ photo })}
              onDraft={(d) => {
                setDraft(d);
                setEditing(true);
                changePage("layouts");
              }}
              onDeleteDraft={(d) => setDeleteTarget({ draft: d })}
              onUpload={() => requestUpload()}
            />
          )}
        </main>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif"
        multiple
        hidden
        aria-label="Upload photographs"
        onChange={(e) => upload(e.target.files)}
      />
      {picker !== null && draft && (
        <PhotoPicker
          photos={photos}
          slot={picker}
          onChoose={(p) => {
            assign(p, { draftId: draft.id, index: picker });
            setPicker(null);
          }}
          onUpload={() => {
            requestUpload({ draftId: draft.id, index: picker });
            setPicker(null);
          }}
          onCamera={() => {
            setTarget({ draftId: draft.id, index: picker });
            setPicker(null);
            setSelectedPhoto(null);
            setCameraActive(true);
            setPage("camera");
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {review && (
        <Modal title="Capture review" onClose={dismissReview}>
          <div className="capture-review">
            <Preview
              photo={review}
              treatment={review.treatment}
              width={700}
              label="Capture review"
            />
          </div>
          <p className="description">
            {target
              ? `Photo ${target.index + 1} of ${draft?.slots.length}. Keep it or give it another try.`
              : "Keep this photograph or take another."}
          </p>
          <div className="modal-actions">
            <button className="button" disabled={busy} onClick={acceptCapture}>
              <Check size={16} />
              {busy ? "Saving…" : "Keep photograph"}
            </button>
            <button
              className="button secondary"
              onClick={dismissReview}
              disabled={busy}
            >
              <RotateCcw size={15} />
              Retake
            </button>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              dismissReview();
              if (target) {
                const index = target.index;
                setTarget(null);
                changePage("layouts");
                setPicker(index);
              } else requestUpload();
            }}
          >
            Choose a different image
          </button>
        </Modal>
      )}
      {controlsOpen && (
        <Modal title="Adjust photo" onClose={() => setControlsOpen(false)}>
          <TreatmentControls
            treatment={treatment}
            onChange={setTreatment}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
          />
        </Modal>
      )}
      {exporting && (
        <ExportDialog
          {...exporting}
          photos={photos}
          onClose={() => setExporting(null)}
          onSave={async (blob, name) => {
            await addPhoto(blob, "composition", name);
            setNotice("Finished composition saved to your collection.");
          }}
        />
      )}
      {deleteTarget && (
        <Modal
          title={
            deleteTarget.draft
              ? "Remove this draft?"
              : "Remove this photograph?"
          }
          onClose={() => setDeleteTarget(null)}
        >
          <p>
            This removes it from the collection on this device. Download a copy
            first if you want to keep it.
          </p>
          <div className="modal-actions">
            <button className="button danger-fill" onClick={confirmDelete}>
              Remove from this device
            </button>
            <button
              className="button secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Keep it
            </button>
          </div>
        </Modal>
      )}
      {error && (
        <div className="toast error" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {busy && !review && (
        <div className="working-indicator" role="status">
          Developing your photograph…
        </div>
      )}
    </>
  );
}
