import type { Draft, PhotoRecord } from "./types";
import { originalTreatment } from "./types";
let opening: Promise<IDBDatabase> | undefined;
let blobStorage = true;
type PackedPhoto = Omit<PhotoRecord, "blob" | "thumbnail"> & {
  blobBytes: ArrayBuffer;
  blobMime: string;
  thumbnailBytes: ArrayBuffer;
  thumbnailMime: string;
};
async function packPhoto(photo: PhotoRecord): Promise<PackedPhoto> {
  const { blob, thumbnail, ...metadata } = photo;
  return {
    ...metadata,
    blobBytes: await blob.arrayBuffer(),
    blobMime: blob.type,
    thumbnailBytes: await thumbnail.arrayBuffer(),
    thumbnailMime: thumbnail.type,
  };
}
function unpackPhoto(photo: PhotoRecord | PackedPhoto): PhotoRecord {
  if (!("blobBytes" in photo)) return photo;
  const { blobBytes, blobMime, thumbnailBytes, thumbnailMime, ...metadata } =
    photo;
  return {
    ...metadata,
    blob: new Blob([blobBytes], { type: blobMime }),
    thumbnail: new Blob([thumbnailBytes], { type: thumbnailMime }),
  };
}
function db() {
  if (!opening)
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!("indexedDB" in globalThis)) {
        reject(
          new Error("Local photo storage is unavailable in this browser."),
        );
        return;
      }
      const r = indexedDB.open("polaroid-darkroom", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("photos", { keyPath: "id" });
        d.createObjectStore("drafts", { keyPath: "id" });
        d.createObjectStore("meta");
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          opening = undefined;
        };
        resolve(r.result);
      };
      r.onerror = () => {
        opening = undefined;
        reject(r.error);
      };
      r.onblocked = () => {
        opening = undefined;
        reject(
          new Error("Close other Polaroid tabs to finish updating storage."),
        );
      };
    });
  return opening;
}
function result<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function records<T>(store: "photos" | "drafts") {
  const d = await db();
  const values = await result(d.transaction(store).objectStore(store).getAll());
  return (store === "photos" ? values.map(unpackPhoto) : values) as T[];
}
async function write(
  store: "photos" | "drafts",
  value: PhotoRecord | PackedPhoto | Draft,
) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    let failure: DOMException | null = null;
    const request = tx.objectStore(store).put(value);
    request.onerror = () => {
      failure = request.error;
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        failure ??
          tx.error ??
          new Error(
            "This browser could not save the photograph. Try another browser or check available storage.",
          ),
      );
  });
}
export async function put(
  store: "photos" | "drafts",
  value: PhotoRecord | Draft,
) {
  if (store === "drafts") return write(store, value);
  const photo = value as PhotoRecord;
  if (!blobStorage) return write(store, await packPhoto(photo));
  try {
    await write(store, photo);
  } catch (error) {
    if (
      !(error instanceof DOMException) ||
      !["UnknownError", "DataCloneError"].includes(error.name)
    )
      throw error;
    // Some WebKit storage implementations cannot persist native Blob/File objects.
    // Store identical binary bytes in IndexedDB and reconstruct Blobs when reading.
    await write(store, await packPhoto(photo));
    blobStorage = false;
  }
}
export async function remove(store: "photos" | "drafts", id: string) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
/** Atomic, idempotent migration. Retain the legacy data as a recovery backup. */
export async function migrateLegacy() {
  const d = await db();
  if (
    await result(
      d.transaction("meta").objectStore("meta").get("legacy-migrated"),
    )
  )
    return;
  let raw: string | null;
  try {
    raw = localStorage.getItem("digicam_photos");
  } catch {
    throw new Error(
      "Your previous gallery could not be read. Allow local storage and reload.",
    );
  }
  const previous: { id: string; dataUrl: string; takenAt: string }[] = raw
    ? JSON.parse(raw)
    : [];
  if (!Array.isArray(previous))
    throw new Error(
      "Your previous gallery needs recovery. The original data has been preserved.",
    );
  const migrated: PhotoRecord[] = [];
  for (const p of previous) {
    if (!p.id || !p.dataUrl?.startsWith("data:image/"))
      throw new Error(
        "A previous photograph could not be migrated. Your original gallery is still preserved.",
      );
    const blob = await (await fetch(p.dataUrl)).blob();
    migrated.push({
      id: p.id,
      blob,
      thumbnail: blob,
      name: "From your original gallery",
      width: 0,
      height: 0,
      takenAt: p.takenAt,
      kind: "legacy",
      treatment: originalTreatment(),
    });
  }
  const binaryPhotos = await Promise.all(migrated.map(packPhoto));
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(["photos", "meta"], "readwrite");
    for (const p of binaryPhotos) tx.objectStore("photos").put(p);
    tx.objectStore("meta").put(true, "legacy-migrated");
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "Your device is out of photo storage. Download some photos, then remove them from the collection.";
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
