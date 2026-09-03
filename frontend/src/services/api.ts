/**
 * API client — relative /api paths only (Vite proxies to Django :8000 in
 * the sandbox; in production VITE_API_BASE_URL points at the backend).
 */
import type { PlanPayload, PlanRequest } from "@/types";

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
