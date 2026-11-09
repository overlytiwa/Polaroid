import { useEffect, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { CATEGORIES, FILTERS, type Filter } from "../lib/filters";
import { canvasOf, contextOf, cover, processCanvas } from "../lib/processing";
import { originalTreatment } from "../lib/types";
function Thumbnail({ source, filter }: { source: string; filter: Filter }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      image = new Image();
    let cancelled = false,
      visible = false;
    const draw = () => {
      if (cancelled || !visible || !image.naturalWidth) return;
      const c = canvasOf(128, 96);
      cover(
        contextOf(c),
        image,
        image.naturalWidth,
        image.naturalHeight,
        128,
        96,
      );
      processCanvas(c, { ...originalTreatment(), filterId: filter.id });
      canvas.getContext("2d")!.drawImage(c, 0, 0);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) draw();
      },
      { rootMargin: "100px" },
    );
    observer.observe(canvas);
    image.onload = draw;
    image.src = source;
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [source, filter]);
  return <canvas ref={ref} width={128} height={96} aria-hidden="true" />;
}
export default function FilterBrowser({
  selected,
  onSelect,
  source = "/samples/lake.jpg",
  favorites,
  toggleFavorite,
}: {
  selected: string;
  onSelect: (id: string) => void;
  source?: string;
  favorites: string[];
  toggleFavorite: (id: string) => void;
}) {
  const [category, setCategory] = useState("All"),
    [search, setSearch] = useState("");
  const shown = FILTERS.filter(
    (f) =>
      (category === "All" ||
        (category === "Favorites" && favorites.includes(f.id)) ||
        category === f.category) &&
      `${f.name} ${f.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="filter-browser" aria-label="Filter library">
      <div className="filter-library-heading">
        <div>
          <span className="filter-count">{FILTERS.length} filters</span>
        </div>
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Search filters"
            placeholder="Find a look…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="icon-button"
              aria-label="Clear filter search"
              onClick={() => setSearch("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
      </div>
      <div className="category-tabs" aria-label="Filter categories">
        {["All", "Favorites", ...CATEGORIES].map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            className={category === c ? "active" : ""}
            onClick={() => setCategory(c)}
          >
            {c === "Favorites" && <Star size={12} />}
            {c}
          </button>
        ))}
      </div>
      <div className="filter-strip">
        {shown.map((f) => (
          <div
            className={`filter-item ${selected === f.id ? "selected" : ""}`}
            key={f.id}
          >
            <button
              className="filter-select"
              aria-label={`Apply ${f.name}`}
              aria-pressed={selected === f.id}
              onClick={() => onSelect(f.id)}
            >
              <Thumbnail source={source} filter={f} />
              <span>{f.name}</span>
            </button>
            <button
              className={`favorite-small ${favorites.includes(f.id) ? "is-favorite" : ""}`}
              aria-label={`${favorites.includes(f.id) ? "Unfavorite" : "Favorite"} ${f.name}`}
              aria-pressed={favorites.includes(f.id)}
              onClick={() => toggleFavorite(f.id)}
            >
              <Star
                size={12}
                fill={favorites.includes(f.id) ? "currentColor" : "none"}
              />
            </button>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="empty-inline">
            {category === "Favorites"
              ? "Star a look to keep it here."
              : "No looks found. Try a different name."}
          </p>
        )}
      </div>
    </section>
  );
}
