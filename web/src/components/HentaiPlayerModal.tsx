"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Loader2, List, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWatchlist } from "@/hooks/useWatchlist";
import { type HentaiItem } from "@/lib/hentai";

// ─────────────────────────────────────────────────────────────
// HentaiPlayerModal
//   • Click card hub → apre questo modale
//   • URL sincronizzato (?watch=slug&ep=N) — condivisibile
//   • Se più episodi: prima mostra un picker con miniatura
//   • Nel player: titolo + ep + pulsante cambio episodio
//   • Iframe/video grande, responsive su mobile
// ─────────────────────────────────────────────────────────────

interface HentaiEpisode {
  url: string;
  n: number;
  thumb?: string | null;
}

interface Props {
  item: HentaiItem | null;
  onClose: () => void;
}

export function HentaiPlayerModal({ item, onClose }: Props) {
  const { t } = useTranslation();
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const saved = item ? isInWatchlist(item.id, "hentai") : false;
  const toggleSave = () => {
    if (!item) return;
    toggleWatchlist({
      id: item.id,
      mediaType: "hentai",
      title: item.name,
      posterPath: item.poster,
      slug: item.slug,
    });
  };

  // Fasi: "detail" (caricamento dettaglio) → "picker" | "playing" | "error"
  const [phase, setPhase] = useState<"detail" | "picker" | "playing" | "error">("detail");
  const [episodes, setEpisodes] = useState<HentaiEpisode[]>([]);
  const [poster, setPoster] = useState<string | null>(null);
  const [activeEp, setActiveEp] = useState<HentaiEpisode | null>(null);
  const [mp4, setMp4] = useState("");
  const [resolving, setResolving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Sincronizza URL (replaceState, non naviga) ──────────
  const setWatchParam = useCallback((slug: string, ep?: number) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("watch", slug);
    if (ep && ep > 1) url.searchParams.set("ep", String(ep));
    else url.searchParams.delete("ep");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  // ── Risolve lo streaming per un episodio ────────────────
  const resolveAndPlay = useCallback(
    async (ep: HentaiEpisode) => {
      setResolving(true);
      setMp4("");
      setActiveEp(ep);
      // Passa subito alla vista player: mostra all'istante lo spinner/shimmer
      // di caricamento (evita la sensazione di lag mentre risolve lo stream).
      setPhase("playing");
      try {
        const r = await fetch(`/api/hentai/resolve?epUrl=${encodeURIComponent(ep.url)}`);
        const d = await r.json();
        if (d?.ok && d.mp4) {
          setMp4(d.mp4);
          setPhase("playing");
          if (item) setWatchParam(item.slug, ep.n);
        } else {
          setPhase("error");
        }
      } catch {
        setPhase("error");
      } finally {
        setResolving(false);
      }
    },
    [item, setWatchParam]
  );

  // ── All'apertura: carica episodi dalla scheda ───────────
  useEffect(() => {
    if (!item) return;
    setWatchParam(item.slug);
    setPhase("detail");

    fetch(`/api/hentai/detail?slug=${encodeURIComponent(item.slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.detail) {
          const eps = d.detail.episodes;
          setEpisodes(eps);
          setPoster(d.detail.poster || item.poster);
          if (eps.length === 0) {
            setPhase("error");
          } else if (eps.length === 1) {
            resolveAndPlay(eps[0]);
          } else {
            setPhase("picker");
          }
        } else {
          setPhase("error");
        }
      })
      .catch(() => setPhase("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.slug]);

  // ESC + blocca scroll
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  // La gestione della cronologia/URL è delegata al parent (HentaiHubView):
  // qui chiudiamo soltanto.
  const handleClose = () => {
    onClose();
  };

  if (!item) return null;

  // ──────────────────────────────────────────────────────────
  // PICKER iniziale — stesso componente del picker in riproduzione
  // ──────────────────────────────────────────────────────────
  const renderPicker = () => (
    <EpisodePicker
      title={item.name}
      episodes={episodes}
      poster={poster}
      activeEp={null}
      onSelect={(ep) => resolveAndPlay(ep)}
      onClose={handleClose}
    />
  );

  // ──────────────────────────────────────────────────────────
  // PLAYER — titolo centrato, X in alto a sinistra, episodi sotto
  // ──────────────────────────────────────────────────────────
  const renderPlayer = () => (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/70 backdrop-blur-2xl"
      onClick={handleClose}
    >
      {/* Area video + header + episodi dentro flex-1 */}
      <div
        className="flex-1 flex flex-col items-center px-0 sm:px-6 md:px-12"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spazio elastico sopra */}
        <div className="flex-1" />

        {/* Header: titolo centrato + X allineata al bordo video */}
        <div className="w-full max-w-6xl relative flex items-center justify-center py-1.5 px-3 sm:px-0 shrink-0">
          <button
            onClick={toggleSave}
            className={`absolute left-0 grid place-items-center transition-colors ${
              saved ? "text-white" : "text-white/70 hover:text-white"
            }`}
            aria-label={saved ? t("watchlistPage.remove") : t("watchlistPage.add")}
            title={saved ? t("watchlistPage.remove") : t("watchlistPage.add")}
          >
            <Heart className={`w-6 h-6 sm:w-7 sm:h-7 ${saved ? "fill-white" : ""}`} />
          </button>
          <div className="text-center min-w-0 max-w-[60%]">
            <h3 className="text-base sm:text-xl md:text-2xl font-bold text-white truncate leading-tight">
              {item.name}
            </h3>
            {activeEp && (
              <p className="text-sm sm:text-base text-white/50">Ep. {activeEp.n}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="absolute right-0 p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>
        </div>

        <div className="w-full max-w-6xl">
          {resolving && (
            <div className="relative aspect-video rounded-xl overflow-hidden bg-muted animate-pulse border-y sm:border border-white/10 max-h-[88vh] sm:max-h-[75vh] mx-auto">
              {/* Sweep luminoso di caricamento */}
              <div className="absolute inset-0 hentai-shimmer" />
              {/* Spinner + testo al centro */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
                <Loader2 className="w-9 h-9 animate-spin text-pink-500" />
                <span className="text-sm font-medium">{t("hentai.resolving")}</span>
              </div>
            </div>
          )}

          {!resolving && mp4 && (
            <div className="overflow-hidden shadow-2xl border-y sm:border border-white/10 bg-black sm:rounded-xl">
              <video
                key={activeEp?.url || "v"}
                src={mp4}
                controls
                autoPlay
                playsInline
                controlsList="nodownload noremoteplayback noplaybackrate"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                className="w-full aspect-video bg-black max-h-[88vh] sm:max-h-[75vh]"
              />
            </div>
          )}

          {!resolving && phase === "error" && (
            <div className="aspect-video flex items-center justify-center bg-black/50 rounded-xl">
              <p className="text-white/60 text-sm">Stream not available</p>
            </div>
          )}
        </div>

        {/* Bottone episodi sotto il player — attaccato (solo multi-ep) */}
        {!resolving && mp4 && episodes.length > 1 && (
          <div className="shrink-0 pt-1 pb-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all text-sm sm:text-base font-semibold border border-white/10"
            >
              <List className="w-5 h-5 sm:w-6 sm:h-6" />
              {t("content.episodes")}
            </button>
          </div>
        )}

        {/* Spazio elastico sotto */}
        <div className="flex-1" />
      </div>

      {/* Picker overlay durante la riproduzione */}
      {pickerOpen && episodes.length > 1 && (
        <EpisodePicker
          title={item.name}
          episodes={episodes}
          poster={poster}
          activeEp={activeEp}
          onSelect={(ep) => {
            setPickerOpen(false);
            if (ep.url !== activeEp?.url) resolveAndPlay(ep);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );

  // ──────────────────────────────────────────────────────────
  // FASE INIZIALE (caricamento dettaglio)
  // ──────────────────────────────────────────────────────────
  if (phase === "detail") {
    return (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={handleClose}
      >
        <Loader2
          className="w-12 h-12 animate-spin text-pink-500"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        onClick={handleClose}
      >
        <div
          className="bg-card rounded-2xl p-8 text-center max-w-sm border border-border/60 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-muted-foreground mb-4">Stream not available</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-pink-600 text-white text-sm font-medium hover:bg-pink-700 transition-colors"
          >
            {t("content.goBack")}
          </button>
        </div>
      </div>
    );
  }

  return phase === "picker" ? renderPicker() : renderPlayer();
}

// ─────────────────────────────────────────────────────────────
// EpisodePicker — modale selezione episodi (usato sia all'apertura
// che durante la riproduzione). Mostra le thumbnail reali degli
// episodi (snapshot da hentaimama), con fallback alla locandina.
// ─────────────────────────────────────────────────────────────
function EpisodePicker({
  title,
  episodes,
  poster,
  activeEp,
  onSelect,
  onClose,
}: {
  title: string;
  episodes: HentaiEpisode[];
  poster: string | null;
  activeEp: HentaiEpisode | null;
  onSelect: (ep: HentaiEpisode) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="w-full max-w-5xl bg-card rounded-2xl overflow-hidden shadow-2xl border border-border/60 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-border/60 shrink-0">
          <h4 className="font-bold text-foreground truncate">{title}</h4>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenitore scrollabile separato dal grid: così le box mantengono
            altezza naturale (aspect 16:9) e si scrolla quando sono tante. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {episodes.map((ep) => {
              const isActive = ep.url === activeEp?.url;
              const img = ep.thumb || poster;
              return (
                <button
                  key={ep.url}
                  onClick={() => onSelect(ep)}
                  className={`group relative block rounded-lg overflow-hidden border-2 bg-muted transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${
                    isActive
                      ? "border-pink-500 ring-1 ring-pink-500"
                      : "border-transparent hover:border-pink-500/60 hover:shadow-lg hover:shadow-pink-500/20"
                  }`}
                >
                  {/* L'immagine in flusso normale definisce l'altezza della cella */}
                  {img ? (
                    <img
                      src={img}
                      alt={`Ep ${ep.n}`}
                      loading="lazy"
                      className="block w-full aspect-video object-cover transition-opacity group-hover:opacity-90"
                    />
                  ) : (
                    <div className="block w-full aspect-video bg-gradient-to-br from-pink-900/40 to-muted" />
                  )}
                  {/* Velo + numero episodio in basso a sinistra */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <span className={`absolute bottom-1.5 left-2 text-sm font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] ${isActive ? "text-pink-400" : "text-white"}`}>
                    Ep. {ep.n}
                  </span>
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-pink-500 shadow" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
