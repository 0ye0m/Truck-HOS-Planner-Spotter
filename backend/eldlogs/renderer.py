"""
Daily log renderer: fills the blank sheet with one day of the canonical
schedule — header fields, duty-status lines on the 24-hour grid (with
vertical transitions on every status change), per-row totals, miles,
remarks and the 70/8 recap.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from PIL import Image, ImageDraw

from hos import DailyLogData, Schedule
from hos.models import DutyStatus

from . import coordinates as C
from .template import (
    DUTY_LINE_COLOR,
    LINE_COLOR,
    LIGHT_COLOR,
    TEXT_COLOR,
    _font,
    _fit,
    _text,
    create_blank_sheet,
)


def _hours_decimal(minutes: float) -> str:
    """Render minutes as decimal hours like paper logs (e.g. 7.75, 5.0)."""
    text = f"{minutes / 60.0:.2f}".rstrip("0")
    return text + "0" if text.endswith(".") else text


def _hm(minutes: float) -> str:
    total = int(round(minutes))
    return f"{total // 60}h {total % 60:02d}m"


class DailyLogRenderer:
    """Renders one :class:`DailyLogData` onto the blank log template."""

    def __init__(self, trip_data: dict) -> None:
        """
        trip_data: dict with keys
            driver_name, carrier_name, truck_number, trailer_number,
            main_office, home_terminal, co_driver, trip_id
        Missing values are shown as "Not provided" (never fabricated).
        """
        self.trip = trip_data

    # ------------------------------------------------------------------

    def render(self, log: DailyLogData, schedule: Schedule) -> Image.Image:
        image, draw = create_blank_sheet()
        self._fill_header(draw, log)
        self._draw_duty_lines(draw, log)
        self._fill_totals(draw, log)
        self._fill_remarks(draw, log)
        self._fill_recap(draw, log, schedule)
        self._watermark(draw, log, schedule)
        return image

    # ------------------------------------------------------------------
    # Header
    # ------------------------------------------------------------------

    def _not_provided(self, value: Optional[str]) -> str:
        value = (value or "").strip()
        return value if value else "Not provided"

    def _fill_header(self, draw: ImageDraw.ImageDraw, log: DailyLogData) -> None:
        trip = self.trip

        # Date boxes
        x = C.MARGIN_X + 70
        boxes = [
            (f"{log.date.month:02d}", 190),
            (f"{log.date.day:02d}", 120),
            (f"{log.date.year}", 140),
        ]
        for value, width in boxes:
            _text(draw, (x + 190 / 2 if width == 190 else x + width / 2, 8),
                  "", C.SMALL_FONT_SIZE)
            x_box = x
            font = _font(30)
            draw.text(
                (x_box + width / 2, C.DATE_Y + 20),
                value,
                font=font,
                fill=TEXT_COLOR,
                anchor="mm",
            )
            x += width + 16

        # From / To — first and last known places of the day
        places = [
            seg.activity.location.name
            for seg in log.segments
            if seg.activity is not None and seg.activity.location.name
        ]
        first_place = places[0] if places else None
        last_place = places[-1] if places else None
        fx = x + 60
        font = _font(28)
        draw.text((fx + 110, C.DATE_Y + 36), _fit(draw, self._not_provided(first_place), font, 500),
                  font=font, fill=TEXT_COLOR, anchor="lm")
        draw.text((fx + 730, C.DATE_Y + 36), _fit(draw, self._not_provided(last_place), font, 460),
                  font=font, fill=TEXT_COLOR, anchor="lm")

        # Miles
        miles_text = str(int(round(log.miles)))
        mileage_text = str(int(round(self.trip.get("cumulative_miles", {}).get(log.date.isoformat(), 0))))
        font = _font(34, bold=True)
        draw.text((C.MARGIN_X + C.MILES_BOX_W / 2, C.INFO_ROW_1_Y + 27), miles_text,
                  font=font, fill=TEXT_COLOR, anchor="mm")
        draw.text((C.MILES_BOX_2_X + C.MILES_BOX_W / 2, C.INFO_ROW_1_Y + 27),
                  mileage_text, font=font, fill=TEXT_COLOR, anchor="mm")

        # Carrier / office / vehicle / signature
        carrier = self._not_provided(trip.get("carrier_name"))
        office = self._not_provided(trip.get("main_office"))
        home_terminal = self._not_provided(trip.get("home_terminal"))
        truck = ", ".join(
            part for part in [
                self._not_provided(trip.get("truck_number")) if trip.get("truck_number") else "",
                self._not_provided(trip.get("trailer_number")) if trip.get("trailer_number") else "",
            ] if part
        )
        driver = self._not_provided(trip.get("driver_name"))

        font = _font(28)
        draw.text((C.CARRIER_X, C.INFO_ROW_1_Y + 18), _fit(draw, carrier, font, 900),
                  font=font, fill=TEXT_COLOR, anchor="lm")
        draw.text((C.CARRIER_X, C.INFO_ROW_2_Y + 18), _fit(draw, office, font, 900),
                  font=font, fill=TEXT_COLOR, anchor="lm")

        truck_display = truck if truck.strip() and "Not provided" not in truck else "Not provided"
        draw.text(
            ((C.MILES_BOX_2_X + C.MILES_BOX_W + C.MARGIN_X) / 2, C.INFO_ROW_2_Y + 27),
            _fit(draw, truck_display, font, 560),
            font=font, fill=TEXT_COLOR, anchor="mm",
        )
        draw.text(
            ((C.MILES_BOX_2_X + C.MILES_BOX_W + C.MARGIN_X) / 2, C.INFO_ROW_3_Y + 27),
            _fit(draw, home_terminal, font, 560),
            font=font, fill=TEXT_COLOR, anchor="mm",
        )
        draw.text((C.CARRIER_X, C.INFO_ROW_3_Y + 14), _fit(draw, driver, font, 520),
                  font=font, fill=TEXT_COLOR, anchor="lm")
        co_driver = trip.get("co_driver") or "—"
        draw.text((C.CARRIER_X + 540, C.INFO_ROW_3_Y + 14), co_driver,
                  font=font, fill=TEXT_COLOR, anchor="lm")

    # ------------------------------------------------------------------
    # Duty lines on the grid
    # ------------------------------------------------------------------

    def _draw_duty_lines(self, draw: ImageDraw.ImageDraw, log: DailyLogData) -> None:
        """
        Draw horizontal duty lines and vertical transitions, exactly like a
        hand-completed paper log:

        * horizontal segment per activity at its status row,
        * vertical connector at every duty-status change,
        * the day is drawn from midnight to midnight (segments are complete).
        """
        previous_y: Optional[float] = None
        line_width = 5

        for seg in log.segments:
            start_h = seg.start.hour + seg.start.minute / 60.0 + seg.start.second / 3600.0
            end_h = seg.end.hour + seg.end.minute / 60.0 + seg.end.second / 3600.0
            if seg.end.time().hour == 0 and seg.end.time().minute == 0 and seg.end.time().second == 0:
                end_h = 24.0  # segment ends exactly at midnight
            x0 = C.time_to_x(start_h)
            x1 = C.time_to_x(end_h)
            y = C.row_center_y(seg.status.value)

            if previous_y is not None and abs(x0 - C.time_to_x(0)) < 1e-6:
                # Day opens continuing the previous line: no connector needed.
                pass
            elif previous_y is not None and abs(previous_y - y) > 1e-6:
                draw.line([x0, previous_y, x0, y], fill=DUTY_LINE_COLOR, width=line_width)
            previous_y = y
            draw.line([x0, y, x1, y], fill=DUTY_LINE_COLOR, width=line_width)

        # Final connector already handled per segment; extend to right edge
        # is unnecessary because segments cover the full 24h by construction.

    # ------------------------------------------------------------------
    # Totals + remarks + recap
    # ------------------------------------------------------------------

    def _fill_totals(self, draw: ImageDraw.ImageDraw, log: DailyLogData) -> None:
        totals = {
            "OFF_DUTY": log.off_duty_minutes,
            "SLEEPER_BERTH": log.sleeper_minutes,
            "DRIVING": log.driving_minutes,
            "ON_DUTY_NOT_DRIVING": log.on_duty_minutes,
        }
        font = _font(26, bold=True)
        for status, minutes in totals.items():
            top = C.row_top_y(status)
            draw.text(
                (C.TOTALS_COLUMN_X + 86 + (C.TOTALS_COLUMN_WIDTH - 86) / 2, top + C.ROW_HEIGHT / 2),
                _hours_decimal(minutes),
                font=font,
                fill=TEXT_COLOR,
                anchor="mm",
            )

    def _fill_remarks(self, draw: ImageDraw.ImageDraw, log: DailyLogData) -> None:
        x = C.GRID_X + 20
        y = C.REMARKS_Y + 16
        line_height = 34
        font = _font(C.REMARK_FONT_SIZE)
        max_width = C.GRID_WIDTH + 100
        count = 0
        for time_, remark in log.remarks:
            if count >= 8:
                break
            text = f"{time_.strftime('%H:%M')} — {remark}"
            draw.text((x, y + count * line_height), _fit(draw, text, font, max_width),
                      font=font, fill=TEXT_COLOR)
            count += 1
        if not log.remarks:
            draw.text((x, y), "No duty status changes recorded on this day.",
                      font=font, fill=LIGHT_COLOR)

    def _fill_recap(self, draw: ImageDraw.ImageDraw, log: DailyLogData, schedule: Schedule) -> None:
        """
        70 Hour/8 Day recap:
          A = on-duty hours today
          B = cycle hours accumulated before today (seed + prior trip days,
              restart-aware; the assessment provides a single cycle value,
              not day-by-day history — documented approximation)
          C = A + B
        """
        today_onduty = log.driving_minutes + log.on_duty_minutes
        before_today = self.trip.get("cycle_at_day_start", {}).get(
            log.date.isoformat(), 0.0
        ) * 60.0

        values = [
            _hours_decimal(today_onduty),
            _hours_decimal(before_today),
            _hours_decimal(today_onduty + before_today),
        ]
        font = _font(26, bold=True)
        rx = C.GRID_X + 640
        col_w = 250
        for i in range(2):  # 70/8 and 60/7 columns show the same values
            cx = rx + i * (col_w + 24)
            for j, value in enumerate(values):
                ry = C.SHIPPING_Y + 56 + j * 52
                draw.text((cx + col_w - 12, ry + 22), value, font=font,
                          fill=TEXT_COLOR, anchor="rm")

        # 34-hour restart note when one occurred on this day
        restart_today = any(
            seg.activity is not None and seg.activity.type.value == "RESTART_34H"
            for seg in log.segments
        )
        if restart_today:
            nx = rx + 2 * (col_w + 24) + 10
            font_note = _font(20, bold=True)
            draw.text((nx + 14, C.SHIPPING_Y + 208),
                      "34-hour restart taken on this day.",
                      font=font_note, fill=TEXT_COLOR)

    def _watermark(self, draw: ImageDraw.ImageDraw, log: DailyLogData, schedule: Schedule) -> None:
        info = f"Day {log.day_number} — {log.date.strftime('%B %d, %Y')}"
        font = _font(22)
        draw.text((C.LOG_TEMPLATE_WIDTH - C.MARGIN_X, C.LOG_TEMPLATE_HEIGHT - 22),
                  _fit(draw, info, font, 500), font=font, fill=LIGHT_COLOR,
                  anchor="rs")


def render_daily_log(log: DailyLogData, schedule: Schedule, trip_data: dict) -> Image.Image:
    """Convenience wrapper (assessment section 18 API shape)."""
    return DailyLogRenderer(trip_data).render(log, schedule)
