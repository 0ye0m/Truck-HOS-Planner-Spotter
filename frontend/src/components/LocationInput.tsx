import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { searchCities, topHubs, type CityOption } from "@/data/usCities";
import { suggestPlaces, type PlaceSuggestion } from "@/services/api";
import type { IconProps } from "@/components/icons";

/**
 * Real-time US location picker (marketplace-style combobox).
 *
 * Two layers of suggestions:
 *  1. INSTANT — a curated local dataset of US cities filters as you type
 *     (zero latency, works offline).
 *  2. LIVE — 300 ms after the keystroke stops, the backend geocoder
 *     returns real-time matches from OpenStreetMap (small towns, POIs,
 *     road-level hits), replacing the local list. Requests are aborted
 *     when the query changes; failures degrade silently to layer 1.
 *
 * Free text is always honored — the picker is an accelerator, not a
 * restriction: any street address can be typed and submitted.
 */

interface Props {
  id: string;
  label: string;
  step?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  leadingIcon: (props: IconProps) => ReactElement;
  describedBy?: string;
  /** Enable the live server-backed layer (tests may disable it). */
  liveSuggestions?: boolean;
}

interface Option {
  label: string;
  city: string;
  state: string;
  subtitle: string;
  live: boolean;
  major: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const LOCAL_LIMIT = 6;
const HUB_LIMIT = 6;

function fromCityOption(c: CityOption): Option {
  return {
    label: c.label,
    city: c.city,
    state: c.state,
    subtitle: c.stateName,
    live: false,
    major: c.major,
  };
}

function fromSuggestion(s: PlaceSuggestion): Option {
  const city = s.label.split(",")[0]?.trim() ?? s.label;
  const state = s.label.split(",")[1]?.trim() ?? "";
  return {
    label: s.label,
    city,
    state,
    subtitle: s.display_name !== s.label ? s.display_name : "",
    live: true,
    major: false,
  };
}

export default function LocationInput({
  id,
  label,
  step,
  value,
  onChange,
  placeholder,
  leadingIcon: LeadingIcon,
  describedBy,
  liveSuggestions = true,
}: Props) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [liveOptions, setLiveOptions] = useState<Option[] | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const query = value.trim();

  // Layer 1 — instant local matches (also the offline fallback).
  const localOptions = useMemo<Option[]>(
    () => searchCities(query, LOCAL_LIMIT).map(fromCityOption),
    [query]
  );
  const hubs = useMemo<Option[]>(
    () => topHubs(HUB_LIMIT).map(fromCityOption),
    []
  );

  // Layer 2 — debounced live suggestions with stale-request abortion.
  useEffect(() => {
    if (!liveSuggestions || query.length < MIN_QUERY_LENGTH) {
      setLiveOptions(null);
      setDebouncedQuery("");
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setDebouncedQuery(query);
      suggestPlaces(query, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setLiveOptions(results.map(fromSuggestion));
          setSearching(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setLiveOptions(null);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, liveSuggestions]);

  useEffect(
    () => () => abortRef.current?.abort(),
    []
  );

  // Present local results immediately, then swap in live results.
  const usingLive = liveOptions !== null && liveOptions.length > 0;
  const options = usingLive ? liveOptions! : query.length >= MIN_QUERY_LENGTH ? localOptions : hubs;
  const showOptions = open && options.length > 0;
  const showNoMatch =
    open &&
    query.length >= MIN_QUERY_LENGTH &&
    !searching &&
    options.length === 0;

  // Close when clicking/tapping anywhere outside the field.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  function select(option: Option) {
    onChange(option.label);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showOptions) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        // Highlighted option wins; otherwise Enter submits the form with
        // the exact text — free text is always honored.
        if (activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          select(options[activeIndex]);
        }
        break;
      case "Tab":
        if (activeIndex >= 0 && options[activeIndex]) select(options[activeIndex]);
        else setOpen(false);
        break;
    }
  }

  function handleChange(v: string) {
    onChange(v);
    setActiveIndex(-1);
    setOpen(v.trim().length >= MIN_QUERY_LENGTH || v.trim() === "");
  }

  const describedByFull = describedBy ? `${id}-hint ${describedBy}` : `${id}-hint`;
  const exactLabel = query.length >= MIN_QUERY_LENGTH ? query : "";

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-night-900">
        {step && (
          <span
            aria-hidden="true"
            className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white"
          >
            {step}
          </span>
        )}
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-night-500">
          <LeadingIcon size={17} />
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          inputMode="text"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-expanded={open && (showOptions || showNoMatch || searching)}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={describedByFull}
          className="h-12 w-full rounded-lg border border-line bg-white pl-10 pr-9 text-[15px] text-night-900 outline-none transition placeholder:text-night-500/60 hover:border-night-500/50 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
        {searching ? (
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand-500"
          />
        ) : (
          value && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear location"
              onClick={() => {
                onChange("");
                setOpen(false);
                setLiveOptions(null);
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-night-500 transition hover:bg-canvas hover:text-night-900"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )
        )}
      </div>

      {(showOptions || showNoMatch) && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="suggestion-panel thin-scroll absolute z-30 mt-1.5 max-h-[19rem] w-full overflow-y-auto rounded-xl border border-line bg-white py-1.5 shadow-pop"
        >
          {showOptions && (
            <>
              <div className="flex items-center justify-between px-3.5 pb-1 pt-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-night-500">
                  {usingLive ? "Live results" : query.length >= MIN_QUERY_LENGTH ? "Quick matches" : "Popular freight hubs"}
                </p>
                {usingLive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ok-700">
                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ok-500" />
                    Live
                  </span>
                )}
              </div>
              {options.map((opt, i) => (
                <div
                  key={`${opt.label}-${i}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(opt)}
                  className={`flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors ${
                    i === activeIndex ? "bg-brand-50" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                      opt.live ? "bg-brand-50 text-brand-600" : "bg-canvas text-night-700"
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-0">
                      <Highlighted text={opt.city} query={query} className="truncate text-[14px] font-semibold text-night-900" />
                      {opt.state && (
                        <span className="flex-none text-[13px] font-semibold text-brand-600">,&nbsp;{opt.state}</span>
                      )}
                    </span>
                    {opt.subtitle && opt.subtitle !== opt.label && (
                      <span className="mt-0.5 block truncate text-[11px] text-night-500">
                        {opt.subtitle}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </>
          )}

          {showNoMatch && (
            <p className="px-3.5 py-2.5 text-xs text-night-500">
              No matches for “{query}”. You can still use it as typed below.
            </p>
          )}

          {exactLabel && (
            <div
              role="option"
              aria-selected={activeIndex === options.length}
              onMouseEnter={() => setActiveIndex(options.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                setActiveIndex(-1);
                inputRef.current?.blur();
              }}
              className={`mt-1 flex cursor-pointer items-center gap-2.5 border-t border-line px-3.5 py-2.5 transition-colors ${
                activeIndex === options.length ? "bg-brand-50" : ""
              }`}
            >
              <span aria-hidden="true" className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-canvas text-night-700">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 5 7 7-7 7" />
                  <path d="M5 12h14" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <span className="text-night-500">Use exact address </span>
                <span className="font-semibold text-night-900">“{exactLabel}”</span>
              </span>
              <kbd className="flex-none rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-night-500">
                Enter
              </kbd>
            </div>
          )}
        </div>
      )}

      <p id={`${id}-hint`} className="sr-only">
        Type at least two characters to search US cities with live results, or type any street
        address. Use arrow keys to review suggestions and Enter to select.
      </p>
    </div>
  );
}

function Highlighted({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, idx)}
      <strong className="font-bold text-brand-600">{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </span>
  );
}
