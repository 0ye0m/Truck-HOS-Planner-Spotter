/**
 * API client — relative /api paths only (Vite proxies to Django :8000 in
 * the sandbox; in production VITE_API_BASE_URL points at the backend).
 */
import type {
  HosSummary,
  PlanPayload,
  PlanRequest,
  RouteInfo,
  Violation,
} from "@/types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiRequestError extends Error {
  code: string;
  constructor(message: string, code: string = "request-failed") {
    super(message);
    this.code = code;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = "Something went wrong while planning this trip. Please try again.";
  let code = "request-failed";
  try {
    const data = await response.json();
    if (data && typeof data.error === "string") {
      message = data.error;
      code = data.code ?? code;
    }
  } catch {
    /* non-JSON error body — keep the friendly default message */
  }
  throw new ApiRequestError(message, code);
}

/** Uniform, user-facing message for network/offline failures. */
export function friendlyError(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) {
    if (/fetch|network|load failed/i.test(error.message)) {
      return (
        "Cannot reach the trip planner server. Check your connection and " +
        "try again — the planner service may be restarting."
      );
    }
    return error.message;
  }
  return "Something went wrong while planning this trip. Please try again.";
}

export async function planTrip(request: PlanRequest): Promise<PlanPayload> {
  const response = await fetch(`${BASE}/api/trips/plan/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handle<PlanPayload>(response);
}

/** Dry-run estimate from POST /api/trips/validate/ (no persistence, no logs). */
export interface ValidateResponse {
  schedulable: boolean;
  violations: Violation[];
  message?: string;
  hos_summary: HosSummary;
  route: RouteInfo;
}

/**
 * Live route estimate for the preview strip. Aborts cleanly when the caller
 * cancels (query changed) — surfacing no error in that case.
 */
export async function validateTrip(
  request: PlanRequest,
  signal?: AbortSignal
): Promise<ValidateResponse> {
  const response = await fetch(`${BASE}/api/trips/validate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    // Structured 400s (e.g. unknown address) — surface the message, the
    // preview renders it as a soft hint instead of an alarming error.
    let message = "Could not estimate this route yet.";
    try {
      const data = await response.json();
      if (data && typeof data.error === "string") message = data.error;
    } catch {
      /* keep default */
    }
    throw new ApiRequestError(message, "validate-failed");
  }
  return (await response.json()) as ValidateResponse;
}

/** One live place suggestion from the backend geocoder (US-biased). */
export interface PlaceSuggestion {
  /** Canonical "City, ST" string the backend geocodes reliably. */
  label: string;
  /** Human-readable context, e.g. "Columbus, Franklin County, Ohio". */
  display_name: string;
  lat: number;
  lon: number;
  kind: string;
}

/**
 * Live place suggestions for the location picker (debounced + aborted by
 * the caller). Resolves to [] on any failure — autocomplete degrades to
 * the instant local dataset instead of surfacing an error.
 */
export async function suggestPlaces(
  query: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  try {
    const url = `${BASE}/api/geocode/suggest/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: PlaceSuggestion[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return []; // aborted or offline — never break the typing flow
  }
}

export function logImageUrl(payload: PlanPayload, day: number): string {
  const log = payload.logs.find((l) => l.day_number === day);
  return log ? `${BASE}${log.image_url}` : "";
}

export function allLogsPdfUrl(tripId: number): string {
  return `${BASE}/api/trips/${tripId}/logs/pdf/`;
}

export const LOADING_STAGES = [
  "Geocoding locations…",
  "Calculating route…",
  "Checking HOS availability…",
  "Generating ELD logs…",
];
