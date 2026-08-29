"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X, SlidersHorizontal, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  HENTAI_GENRES,
  HENTAI_STUDIOS,
  HENTAI_YEARS,
  genreLabel,
} from "@/lib/hentai";

export interface HentaiFilters {
  search: string;
  genres: string[]; // slug generi
  studios: string[]; // slug studi
  years: string[]; // anni (stringa)
}

export const DEFAULT_FILTERS: HentaiFilters = {
  search: "",
  genres: [],
  studios: [],
  years: [],
};

export function filtersActive(f: HentaiFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.genres.length > 0 ||
    f.studios.length > 0 ||
    f.years.length > 0
  );
}

export function activeCount(f: HentaiFilters): number {
  return (
    f.genres.length +
    f.studios.length +
    f.years.length +
    (f.search.trim() ? 1 : 0)
  );
}

interface Option {
  value: string;
  label: string;
}

interface Props {
  filters: HentaiFilters;
  onChange: (f: HentaiFilters) => void;
  resultCount: number | null;
  /** True se ci sono altre pagine da caricare: mostra il conteggio come "N+". */
  hasMore?: boolean;
  loading: boolean;
}

const fieldLabel =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block";

// ─────────────────────────────────────────────────────────────
// Dropdown custom multi-selezione
// ─────────────────────────────────────────────────────────────
function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [q, options]);

  const triggerText =
    selected.length === 0
      ? t("hentai.all")
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label || t("hentai.selected", { count: 1 })
        : t("hentai.selected", { count: selected.length });

  const hasSel = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <span className={fieldLabel}>{label}</span>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-11 w-full flex items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-colors ${
          hasSel
            ? "border-pink-500/60 bg-pink-500/5 text-foreground"
            : "border-border bg-background text-muted-foreground hover:border-pink-500/50"
        }`}
      >
        <span className={`truncate ${hasSel ? "font-medium text-foreground" : ""}`}>
          {triggerText}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {hasSel && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-pink-600 text-white text-[11px] font-bold leading-none tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute z-40 left-0 right-0 mt-2 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("hentai.genreSearchPlaceholder")}
                  className="h-9 w-full rounded-lg bg-background border border-border pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pink-500/60"
                />
                {q && (
                  <button
                    onClick={() => setQ("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1.5 hentai-chip-scroll">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("hentai.noResults")}
              </p>
            ) : (
              filtered.map((o) => {
                const sel = selected.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => onToggle(o.value)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 h-9 rounded-lg text-sm text-left transition-colors ${
                      sel
                        ? "bg-pink-600/15 text-pink-500 font-semibold"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {sel && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {hasSel && (
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                onClick={onClear}
                className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-sm font-medium text-muted-foreground hover:text-pink-500 hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
                {t("hentai.clear")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pannello filtro
// ─────────────────────────────────────────────────────────────
export function HentaiFilterPanel({ filters, onChange, resultCount, hasMore, loading }: Props) {
  const { t } = useTranslation();
  const count = activeCount(filters);

  const toggleIn = (key: "genres" | "studios" | "years", v: string) => {
    const set = new Set(filters[key]);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange({ ...filters, [key]: [...set] });
  };

  const genreOptions = useMemo<Option[]>(
    () => HENTAI_GENRES.map((g) => ({ value: g, label: genreLabel(g) })),
    []
  );
  const studioOptions = useMemo<Option[]>(
    () => HENTAI_STUDIOS.map((s) => ({ value: s.slug, label: s.name })),
    []
  );
  const yearOptions = useMemo<Option[]>(
    () => HENTAI_YEARS.map((y) => ({ value: String(y), label: String(y) })),
    []
  );

  return (
    <div className="px-4 md:px-10">
      <div className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur-sm p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="flex items-center gap-2 text-lg md:text-xl font-bold text-foreground">
            <SlidersHorizontal className="w-5 h-5 text-pink-500" />
            {t("hentai.filterTitle")}
          </h2>
          <div className="flex items-center gap-3 shrink-0">
            {resultCount != null && (
              <span className="text-sm text-muted-foreground">
                <b className="text-pink-500 tabular-nums">
                  {resultCount.toLocaleString()}{hasMore ? "+" : ""}
                </b>{" "}
                <span className="hidden sm:inline">{t("hentai.resultsLabel")}</span>
              </span>
            )}
            {loading && (
              <span className="w-4 h-4 rounded-full border-2 border-pink-500/30 border-t-pink-500 animate-spin" />
            )}
          </div>
        </div>

        {/* Campi: ricerca + 3 dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Cerca titolo */}
          <div>
            <span className={fieldLabel}>{t("hentai.search")}</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => onChange({ ...filters, search: e.target.value })}
                placeholder={t("hentai.searchPlaceholder")}
                className="h-11 w-full rounded-xl bg-background border border-border pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pink-500/60 hover:border-pink-500/50 transition-colors"
              />
              {filters.search && (
                <button
                  onClick={() => onChange({ ...filters, search: "" })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Generi */}
          <MultiSelectDropdown
            label={t("hentai.genres")}
            options={genreOptions}
            selected={filters.genres}
            onToggle={(v) => toggleIn("genres", v)}
            onClear={() => onChange({ ...filters, genres: [] })}
            searchable
          />

          {/* Studio */}
          <MultiSelectDropdown
            label={t("hentai.studio")}
            options={studioOptions}
            selected={filters.studios}
            onToggle={(v) => toggleIn("studios", v)}
            onClear={() => onChange({ ...filters, studios: [] })}
            searchable
          />

          {/* Anno */}
          <MultiSelectDropdown
            label={t("hentai.year")}
            options={yearOptions}
            selected={filters.years}
            onToggle={(v) => toggleIn("years", v)}
            onClear={() => onChange({ ...filters, years: [] })}
          />
        </div>

        {/* Reset globale */}
        {count > 0 && (
          <div className="mt-4">
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-pink-500 transition-colors"
            >
              <X className="w-4 h-4" />
              {t("hentai.resetAll")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
