"""
HOS configuration constants.

All rule values for this assessment live here so they can be changed in one
place. The values implement the FMCSA property-carrying driver rules under
the 70-hour/8-day cycle, per the supplied FMCSA guide:

- 11-hour driving limit ......... 395.3(a)(3)
- 14-hour driving window ........ 395.3(a)(2)
- 30-minute break after 8 cum. driving hours ... 395.3(a)(3)(ii)
- 10 consecutive hours off duty to reset the daily clocks
- 70-hour / 8-day on-duty cycle .. 395.3(b)
- 34-hour restart ................ 395.3(c)
"""

from __future__ import annotations

# --- Driver type ----------------------------------------------------------
DRIVER_TYPE = "property-carrying"

# --- Daily limits ---------------------------------------------------------
MAX_DRIVING_HOURS = 11.0          # §395.3(a)(3): driving within one window
MAX_WINDOW_HOURS = 14.0           # §395.3(a)(2): driving window since window start
MIN_RESET_HOURS = 10.0            # consecutive off-duty/sleeper resets daily clocks

# --- 30-minute break ------------------------------------------------------
BREAK_AFTER_DRIVING_HOURS = 8.0   # cumulative (not consecutive) driving hours
BREAK_DURATION_MINUTES = 30       # consecutive non-driving minutes required
# A break may be OFF_DUTY, SLEEPER_BERTH or ON_DUTY_NOT_DRIVING (any
# consecutive >= 30 minute non-driving interruption qualifies).

# --- Cycle ----------------------------------------------------------------
CYCLE_LIMIT_HOURS = 70.0          # 70 hours / 8 days
CYCLE_WINDOW_DAYS = 8
RESTART_HOURS = 34.0              # 34-hour restart resets the 70/8 cycle
ALLOW_34H_RESTART = True          # automatic restart recovery strategy (explicit)

# --- Trip assumptions (assessment specification) --------------------------
FUEL_INTERVAL_MILES = 1000.0      # fuel at least once every 1,000 miles
FUEL_DURATION_MINUTES = 30        # named constant, configurable on purpose
PICKUP_DURATION_MINUTES = 60      # 1 hour for pickup
DROPOFF_DURATION_MINUTES = 60     # 1 hour for dropoff

# A short documented on-duty period before the first driving segment
# (pre-trip inspection / dispatch paperwork), mirroring the timeline example
# in the assessment (06:00 On Duty -> 06:30 Driving).
PRE_TRIP_ON_DUTY_MINUTES = 30

# --- Defaults -------------------------------------------------------------
DEFAULT_START_TIME = "06:00"      # assumed departure when none provided
DEFAULT_TIMEZONE = "America/Chicago"  # fallback home-terminal time zone

# --- Rendering / precision ------------------------------------------------
MINUTES_PER_DAY = 24 * 60
EPSILON = 1e-9
