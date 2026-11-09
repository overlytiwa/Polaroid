import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { createDraft, LAYOUTS } from "../lib/layouts";
import { originalTreatment, type LayoutId, type Photo } from "../lib/types";
import Preview from "./Preview";
let samplePromise: Promise<Photo[]> | undefined;
function samplePhotos() {
  return (samplePromise ??= Promise.all(
    ["lake", "sea", "mountain", "forest", "summer"].map(async (name, i) => {
      const response = await fetch(`/samples/${name}.jpg`);
      if (!response.ok) throw new Error("Sample image unavailable.");
      const blob = await response.blob();
      return {
        id: `sample-${i}`,
        blob,
        thumbnail: blob,
        url: `/samples/${name}.jpg`,
        thumbnailUrl: `/samples/${name}.jpg`,
        name,
        width: 0,
        height: 0,
        takenAt: "2026-07-04T12:00:00Z",
        kind: "upload" as const,
        treatment: originalTreatment(),
      };
    }),
  ));
}
const DEMOS = LAYOUTS.map((l) => {
  const d = createDraft(l.id);
  d.slots.forEach((s, i) => {
    s.photoId = `sample-${i}`;
    s.filterId = "portra-400";
  });
  return d;
});
export default function LayoutSelector({
  onSelect,
  compact = false,
}: {
  onSelect: (id: LayoutId) => void;
  compact?: boolean;
}) {
  const [samples, setSamples] = useState<Photo[]>([]);
  useEffect(() => {
    samplePhotos()
      .then(setSamples)
      .catch(() => {});
  }, []);
  return (
    <div className={`layout-grid ${compact ? "compact" : ""}`}>
      {LAYOUTS.map((l, i) => (
        <button
          className="layout-card"
          key={l.id}
          onClick={() => onSelect(l.id)}
          aria-label={`Choose ${l.name}, ${l.slots.length} photos`}
        >
          <div className="layout-art">
            <Preview
              draft={DEMOS[i]}
              photos={samples}
              width={compact ? 240 : 480}
              label={`${l.name} sample layout`}
            />
          </div>
          <div className="layout-card-title">
            <h3>{l.name}</h3>
            <ArrowUpRight size={18} />
          </div>
          <p>
            {l.slots.length} {l.slots.length === 1 ? "photo" : "photos"}
          </p>
        </button>
      ))}
    </div>
  );
}
