import { useState, useCallback } from "react";

export interface Photo {
  id: string;
  dataUrl: string;
  /** ISO timestamp when the photo was taken */
  takenAt: string;
}

const STORAGE_KEY = "digicam_photos";

function loadPhotos(): Photo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Photo[]) : [];
  } catch {
    return [];
  }
}

function savePhotos(photos: Photo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

export function usePhotos() {
  const [photos, setPhotos] = useState<Photo[]>(loadPhotos);

  const addPhoto = useCallback((dataUrl: string) => {
    const photo: Photo = {
      id: crypto.randomUUID(),
      dataUrl,
      takenAt: new Date().toISOString(),
    };
    setPhotos((prev) => {
      const next = [...prev, photo];
      savePhotos(next);
      return next;
    });
  }, []);

  const deletePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePhotos(next);
      return next;
    });
  }, []);

  return { photos, addPhoto, deletePhoto };
}
