import { useCallback, useEffect, useRef, useState } from "react";
import {
  decode,
  release,
  canvasOf,
  contextOf,
  processCanvas,
  toBlob,
} from "./processing";
import { friendlyError, migrateLegacy, put, records, remove } from "./storage";
import {
  originalTreatment,
  type Draft,
  type Photo,
  type PhotoRecord,
  type Treatment,
} from "./types";
export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const urls = useRef(new Map<string, Photo>());
  const hydrate = useCallback((record: PhotoRecord): Photo => {
    const p = {
      ...record,
      url: URL.createObjectURL(record.blob),
      thumbnailUrl: URL.createObjectURL(record.thumbnail),
    };
    urls.current.set(p.id, p);
    return p;
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await migrateLegacy();
      } catch (e) {
        if (active) setError(friendlyError(e));
      }
      try {
        const [p, d] = await Promise.all([
          records<PhotoRecord>("photos"),
          records<Draft>("drafts"),
        ]);
        if (active) {
          setPhotos(
            p.sort((a, b) => b.takenAt.localeCompare(a.takenAt)).map(hydrate),
          );
          setDrafts(d.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          setReady(true);
        }
      } catch (e) {
        if (active) setError(friendlyError(e));
      }
    })();
    const owned = urls.current;
    return () => {
      active = false;
      for (const p of owned.values()) {
        URL.revokeObjectURL(p.url);
        URL.revokeObjectURL(p.thumbnailUrl);
      }
      owned.clear();
    };
  }, [hydrate]);
  const addPhoto = useCallback(
    async (
      blob: Blob,
      kind: PhotoRecord["kind"],
      name: string,
      treatment: Treatment = originalTreatment(),
    ) => {
      if (blob.size > 80 * 1024 * 1024)
        throw new Error("Choose an image smaller than 80 MB.");
      const image = await decode(blob);
      try {
        const { width, height } = image;
        if (width * height > 100_000_000)
          throw new Error(
            "This image is too large to edit here. Choose a smaller version.",
          );
        const thumb = canvasOf(320, (320 * height) / width);
        contextOf(thumb).drawImage(image, 0, 0, thumb.width, thumb.height);
        processCanvas(thumb, treatment, new Date().toISOString());
        const record: PhotoRecord = {
          id: crypto.randomUUID(),
          blob,
          thumbnail: await toBlob(thumb, "image/jpeg", 0.86),
          name,
          width,
          height,
          takenAt: new Date().toISOString(),
          kind,
          treatment: structuredClone(treatment),
        };
        await put("photos", record);
        const photo = hydrate(record);
        setPhotos((prev) => [photo, ...prev]);
        return photo;
      } finally {
        release(image);
      }
    },
    [hydrate],
  );
  const deletePhoto = useCallback(async (id: string) => {
    const allDrafts = await records<Draft>("drafts");
    if (allDrafts.some((d) => d.slots.some((s) => s.photoId === id)))
      throw new Error(
        "This photograph is used in a saved draft. Remove it from that draft before deleting it.",
      );
    await remove("photos", id);
    const p = urls.current.get(id);
    if (p) {
      URL.revokeObjectURL(p.url);
      URL.revokeObjectURL(p.thumbnailUrl);
      urls.current.delete(id);
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const saveDraft = useCallback(async (draft: Draft) => {
    await put("drafts", draft);
    setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
  }, []);
  const deleteDraft = useCallback(async (id: string) => {
    await remove("drafts", id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);
  return {
    photos,
    drafts,
    ready,
    error,
    setError,
    addPhoto,
    deletePhoto,
    saveDraft,
    deleteDraft,
  };
}
