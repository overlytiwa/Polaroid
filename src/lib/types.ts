export type Category =
  | "Original"
  | "Existing"
  | "Film"
  | "Instant"
  | "Digital"
  | "Disposable"
  | "Cinematic"
  | "Black & White"
  | "Experimental";
export type Adjustments = Record<
  | "exposure"
  | "contrast"
  | "saturation"
  | "temperature"
  | "tint"
  | "highlights"
  | "shadows"
  | "grain"
  | "fade"
  | "sharpness"
  | "vignette"
  | "bloom"
  | "halation"
  | "dust"
  | "lightLeaks",
  number
>;
export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  grain: 0,
  fade: 0,
  sharpness: 0,
  vignette: 0,
  bloom: 0,
  halation: 0,
  dust: 0,
  lightLeaks: 0,
};
export interface Treatment {
  filterId: string;
  intensity: number;
  adjustments: Adjustments;
}
export const originalTreatment = (): Treatment => ({
  filterId: "none",
  intensity: 100,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
});
export interface PhotoRecord {
  id: string;
  blob: Blob;
  thumbnail: Blob;
  name: string;
  width: number;
  height: number;
  takenAt: string;
  kind: "capture" | "upload" | "legacy" | "composition";
  treatment: Treatment;
}
export interface Photo extends PhotoRecord {
  url: string;
  thumbnailUrl: string;
}
export type LayoutId = "bali" | "mixtape" | "joyride" | "handwritten";
export interface Slot extends Treatment {
  photoId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
  x: number;
  y: number;
  scale: number;
}
export interface TextStyle {
  value: string;
  font: string;
  size: number;
  color: string;
  align: CanvasTextAlign;
  lineHeight: number;
  letterSpacing: number;
}
export interface Draft {
  id: string;
  layoutId: LayoutId;
  name: string;
  slots: Slot[];
  texts: Record<string, TextStyle>;
  updatedAt: string;
}
export interface SlotGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  border: number;
  bottom?: number;
}
export interface TextGeometry {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  default: TextStyle;
}
export interface Layout {
  id: LayoutId;
  name: string;
  description: string;
  width: number;
  height: number;
  slots: SlotGeometry[];
  order?: number[];
  texts: TextGeometry[];
}
