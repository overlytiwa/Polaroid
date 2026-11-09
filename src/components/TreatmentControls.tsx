import { RotateCcw, SlidersHorizontal, Star } from "lucide-react";
import { FILTER_MAP } from "../lib/filters";
import {
  DEFAULT_ADJUSTMENTS,
  originalTreatment,
  type Adjustments,
  type Treatment,
} from "../lib/types";
import Range from "./Range";
export default function TreatmentControls({
  treatment,
  onChange,
  favorites,
  toggleFavorite,
}: {
  treatment: Treatment;
  onChange: (t: Treatment) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
}) {
  const filter = FILTER_MAP.get(treatment.filterId) ?? FILTER_MAP.get("none")!;
  return (
    <div className="treatment-controls">
      <div className="look-title">
        <h2>{filter.name}</h2>
        <button
          className="icon-button"
          aria-label="Favorite selected look"
          aria-pressed={favorites.includes(filter.id)}
          onClick={() => toggleFavorite(filter.id)}
        >
          <Star
            size={18}
            fill={favorites.includes(filter.id) ? "currentColor" : "none"}
          />
        </button>
      </div>
      <p className="description">{filter.description}</p>
      <Range
        label="Intensity"
        value={treatment.intensity}
        suffix="%"
        onChange={(intensity) => onChange({ ...treatment, intensity })}
      />
      <div className="range-extents">
        <span>Original</span>
        <span>Full character</span>
      </div>
      <button
        className="text-button reset-original"
        onClick={() => onChange(originalTreatment())}
      >
        <RotateCcw size={13} />
        Back to original
      </button>
      <details className="advanced">
        <summary>
          <SlidersHorizontal size={15} />
          Fine-tune your photograph
        </summary>
        <div className="advanced-controls">
          {(Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]).map(
            (key) => (
              <Range
                key={key}
                label={
                  key === "lightLeaks"
                    ? "Light leaks"
                    : key[0].toUpperCase() + key.slice(1)
                }
                value={treatment.adjustments[key]}
                min={
                  [
                    "exposure",
                    "contrast",
                    "saturation",
                    "temperature",
                    "tint",
                    "highlights",
                    "shadows",
                  ].includes(key)
                    ? -100
                    : 0
                }
                onChange={(value) =>
                  onChange({
                    ...treatment,
                    adjustments: { ...treatment.adjustments, [key]: value },
                  })
                }
              />
            ),
          )}
          <button
            className="text-button"
            onClick={() =>
              onChange({
                ...treatment,
                adjustments: { ...DEFAULT_ADJUSTMENTS },
              })
            }
          >
            Reset fine-tuning
          </button>
        </div>
      </details>
    </div>
  );
}
