/**
 * TypeScript types mirroring the backend API contract.
 */

export type ActivityType =
  | "OFF_DUTY"
  | "SLEEPER_BERTH"
  | "DRIVING"
  | "ON_DUTY_NOT_DRIVING"
  | "FUEL"
  | "PICKUP"
  | "DROPOFF"
  | "REST_BREAK"
  | "RESTART_34H";

export type DutyStatus =
  | "OFF_DUTY"
  | "SLEEPER_BERTH"
  | "DRIVING"
  | "ON_DUTY_NOT_DRIVING";

export interface RouteStep {
  instruction: string;
  name: string;
  distance_miles: number;
}

export interface RouteLeg {
  leg_index: number;
  distance_miles: number;
  duration_hours: number;
  steps: RouteStep[];
}

export interface Activity {
  seq: number;
  type: ActivityType;
  duty_status: DutyStatus;
  label: string;
  start: string;
  end: string;
  duration_minutes: number;
  distance_miles: number;
  location: string;
  lat: number | null;
  lon: number | null;
  note: string;
  leg_index: number;
}

export interface Violation {
  rule: string;
  severity: "error" | "warning";
  message: string;
  timestamp: string | null;
  activity_seq: number | null;
}

export interface HosSummary {
  schedulable: boolean;
  cycle_used_before: number;
  cycle_planned: number;
  cycle_remaining_after: number;
  driving_used_in_period: number;
  driving_remaining_in_period: number;
  window_used_hours: number;
  window_remaining_hours: number;
  next_break_in_hours: number | null;
  next_rest_hours: number;
  restart_used: boolean;
  total_driving_hours: number;
  total_on_duty_hours: number;
  violations: Violation[];
}

export interface Marker {
  type: ActivityType;
  label: string;
  location: string;
  lat: number;
  lon: number;
  arrival: string;
  departure: string;
  duration_minutes: number;
  note: string;
}

export interface LogRemark {
  time: string;
  text: string;
}

export interface DailyLog {
  day_number: number;
  date: string;
  off_duty_hours: number;
  sleeper_hours: number;
  driving_hours: number;
  on_duty_hours: number;
  total_hours: number;
  miles: number;
  remarks: LogRemark[];
  image_url: string;
}

export interface TripInfo {
  id: number;
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used: number;
  start_datetime: string | null;
  assumed_start_time: boolean;
  home_terminal_timezone: string;
  driver_name: string;
  carrier_name: string;
  truck_number: string;
  trailer_number: string;
  main_office: string;
  co_driver: string;
  created_at: string;
}

export interface RouteInfo {
  distance_miles: number;
  duration_hours: number;
  geometry: [number, number][];
  legs: RouteLeg[];
  provider: string;
}

export interface PlanPayload {
  trip: TripInfo;
  route: RouteInfo;
  schedule: {
    start?: string | null;
    end?: string | null;
    activities: Activity[];
    restart_used: boolean;
  };
  hos_summary: HosSummary;
  markers: Marker[];
  logs: DailyLog[];
}

export interface PlanRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used: number;
  start_date?: string;
  start_time?: string;
  driver_name?: string;
  carrier_name?: string;
  truck_number?: string;
  trailer_number?: string;
  main_office?: string;
  co_driver?: string;
  timezone?: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
