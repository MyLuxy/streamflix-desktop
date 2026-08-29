"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { languageLabel, languageFlagUrl } from "@/lib/content-languages";

interface LanguageFilterDropdownProps {
  value: string | null; // null = tutte le lingue
  onChange: (code: string | null) => void;
  availableLanguages: string[];
  allLabel?: string;
  className?: string;
}

// dropdown custom (non un <select> nativo) perché un <option> non può contenere un'immagine -
// serve per mostrare la bandiera reale invece dell'emoji, che su Windows non esiste come glifo
export function LanguageFilterDropdown({
  value,
  onChange,
  availableLanguages,
  allLabel = "All languages",
  className = "",
}: LanguageFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const select = (code: string | null) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div className={`relative flex-shrink-0 ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-3 pr-3.5 py-2.5 text-sm border-2 border-border bg-card text-foreground hover:border-primary transition-colors rounded-md"
      >
        {value && languageFlagUrl(value) ? (
          <img src={languageFlagUrl(value)} alt="" className="w-5 h-3.5 object-cover flex-shrink-0" />
        ) : (
          <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="whitespace-nowrap">{value ? languageLabel(value) : allLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-20 min-w-[180px] border-2 border-border bg-card shadow-lg py-1 rounded-md overflow-hidden">
          <button
            onClick={() => select(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary transition-colors ${
              !value ? "bg-secondary/60 font-semibold" : ""
            }`}
          >
            <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {allLabel}
          </button>
          {availableLanguages.map((code) => (
            <button
              key={code}
              onClick={() => select(code)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary transition-colors ${
                value === code ? "bg-secondary/60 font-semibold" : ""
              }`}
            >
              {languageFlagUrl(code) ? (
                <img src={languageFlagUrl(code)} alt="" className="w-5 h-3.5 object-cover flex-shrink-0" />
              ) : (
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              {languageLabel(code)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
