"""
Centralized log-sheet layout configuration.

All positions on the rendered daily log are computed mathematically from
these constants — no scattered pixel values.  The layout replicates the
supplied blank Driver's Daily Log reference (landscape letter, 200 dpi).
"""

from __future__ import annotations

# --- Canvas (landscape US Letter at 200 dpi) ------------------------------
LOG_TEMPLATE_WIDTH = 2200
LOG_TEMPLATE_HEIGHT = 1700
DPI = 200

# --- Page margins ---------------------------------------------------------
MARGIN_X = 90
MARGIN_TOP = 70

# --- Header ----------------------------------------------------------------
TITLE_FONT_SIZE = 54
SUBTITLE_FONT_SIZE = 22
FIELD_FONT_SIZE = 30
LABEL_FONT_SIZE = 21
SMALL_FONT_SIZE = 19
REMARK_FONT_SIZE = 23

DATE_Y = MARGIN_TOP + 150              # month/day/year + from/to row
INFO_ROW_1_Y = DATE_Y + 110            # miles boxes + carrier
INFO_ROW_2_Y = INFO_ROW_1_Y + 104      # truck numbers + office address
INFO_ROW_3_Y = INFO_ROW_2_Y + 104      # (home terminal row)

MILES_BOX_W = 340
MILES_BOX_2_X = MARGIN_X + MILES_BOX_W + 40
CARRIER_X = MILES_BOX_2_X + MILES_BOX_W + 40

# --- 24-hour graph grid ----------------------------------------------------
GRID_X = 330                          # left edge of the hour columns
GRID_Y = INFO_ROW_3_Y + 110           # top edge of the grid (hour scale above)
GRID_WIDTH = LOG_TEMPLATE_WIDTH - GRID_X - 200   # leave room for totals column
ROW_COUNT = 4                         # off duty / sleeper / driving / on duty
GRID_HEIGHT = 430
ROW_HEIGHT = GRID_HEIGHT // ROW_COUNT
HOUR_WIDTH = GRID_WIDTH / 24.0

#: Duty-status rows in official order (top to bottom).
STATUS_ROWS = ["OFF_DUTY", "SLEEPER_BERTH", "DRIVING", "ON_DUTY_NOT_DRIVING"]

#: Printed labels beside each row (matching the paper log).
STATUS_ROW_LABELS = {
    "OFF_DUTY": "1. Off Duty",
    "SLEEPER_BERTH": "2. Sleeper Berth",
    "DRIVING": "3. Driving",
    "ON_DUTY_NOT_DRIVING": "4. On Duty\n(not driving)",
}

TOTALS_COLUMN_X = GRID_X + GRID_WIDTH + 18
TOTALS_COLUMN_WIDTH = 160

# --- Remarks ----------------------------------------------------------------
REMARKS_Y = GRID_Y + GRID_HEIGHT + 70
REMARKS_HEIGHT = 240

# --- Shipping / recap -------------------------------------------------------
SHIPPING_Y = REMARKS_Y + REMARKS_HEIGHT + 26
RECAP_HEIGHT = 300


def time_to_x(hour_fraction: float) -> float:
    """Map a fractional hour of day (0..24) to the grid x coordinate."""
    return GRID_X + hour_fraction * HOUR_WIDTH


def row_center_y(status: str) -> float:
    """Y coordinate of the horizontal duty line for a status row."""
    index = STATUS_ROWS.index(status)
    return GRID_Y + index * ROW_HEIGHT + ROW_HEIGHT / 2.0


def row_top_y(status: str) -> float:
    index = STATUS_ROWS.index(status)
    return GRID_Y + index * ROW_HEIGHT


def hour_label_x(hour: int) -> float:
    return time_to_x(hour)
