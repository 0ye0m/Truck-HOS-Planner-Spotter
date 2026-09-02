import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { searchCities, type CityOption } from "@/data/usCities";
import type { IconProps } from "@/components/icons";

/**
 * US city/state picker with free-text fallback.
 *
 * An accessible combobox (WAI-ARIA 1.2 pattern): typing filters a curated
 * dataset of US cities; keyboard navigation (↑/↓/Enter/Esc) is supported;
 * selecting an option fills the field with "City, ST" — the exact format
 * the backend geocodes reliably. Any custom street address can still be
 * typed and submitted: the picker is an accelerator, not a restriction.
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
  autoCompleteHint?: boolean;
}

const MIN_QUERY_LENGTH = 2;
const MAX_OPTIONS = 40;

export default function LocationInput({
  id,
  label,
  step,
  value,
  onChange,
  placeholder,
  leadingIcon: LeadingIcon,
  describedBy,
  autoCompleteHint = true,
}: Props) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const query = value.trim();
  const options = useMemo<CityOption[]>(
    () => (autoCompleteHint ? searchCities(query, MAX_OPTIONS) : []),
    [query, autoCompleteHint]
  );
  const showOptions = open && options.length > 0;
  const showEmpty = open && query.length >= MIN_QUERY_LENGTH && options.length === 0;

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

  function select(option: CityOption) {
    onChange(option.label);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showOptions && !showEmpty) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
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
        if (showOptions && activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          select(options[activeIndex]);
        }
        // Otherwise: default submit flow — free text is honored.
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function handleChange(v: string) {
    onChange(v);
    setActiveIndex(-1);
    if (v.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
    else setOpen(false);
  }

  const describedByFull = describedBy ? `${id}-hint ${describedBy}` : `${id}-hint`;

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-night-800">
        {step && (
          <span
            aria-hidden="true"
            className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700"
          >
            {step}
          </span>
        )}
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <LeadingIcon size={16} />
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
          onFocus={() => {
            if (value.trim().length >= MIN_QUERY_LENGTH) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={describedByFull}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-8 text-base text-night-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm"
        />
        {value && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear location"
            onClick={() => {
              onChange("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:text-slate-500"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>

      {showOptions && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="thin-scroll absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt, i) => (
            <li
              key={opt.label}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(opt)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                i === activeIndex ? "bg-brand-50" : ""
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 flex-none rounded-full ${opt.major ? "bg-brand-500" : "bg-slate-300"}`}
                />
                <Highlighted text={opt.city} query={query} className="truncate font-medium text-night-900" />
                <span className="flex-none font-semibold text-brand-700">{opt.state}</span>
              </span>
              <span className="flex-none text-[11px] text-slate-400">{opt.stateName}</span>
            </li>
          ))}
        </ul>
      )}

      {showEmpty && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-30 mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg"
        >
          <p className="text-xs font-medium text-night-800">No saved city matches “{query}”.</p>
          <p className="mt-0.5 text-xs text-slate-500">
            That's fine — press Enter to use this exact address; the server will geocode it.
          </p>
        </div>
      )}

      <p id={`${id}-hint`} className="sr-only">
        Type at least two characters to search US cities, or type any address. Use arrow keys to
        review suggestions and Enter to select.
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
      <strong className="font-bold text-brand-700">{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </span>
  );
}
