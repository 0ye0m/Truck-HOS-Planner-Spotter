"""
Blank daily-log sheet template drawer (Pillow).

Draws the full paper log — header boxes, 24-hour graph grid with hour/half-
hour ticks, remarks area, shipping docs and the 70/8 recap section —
replicating the supplied blank log reference at high resolution.
"""

from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from . import coordinates as C

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONT_REGULAR = f"{FONT_DIR}/DejaVuSans.ttf"
FONT_BOLD = f"{FONT_DIR}/DejaVuSans-Bold.ttf"
FONT_MONO = f"{FONT_DIR}/DejaVuSansMono.ttf"

LINE_COLOR = (40, 40, 40)
GRID_COLOR = (110, 110, 110)
LIGHT_COLOR = (160, 160, 160)
TEXT_COLOR = (25, 25, 25)
DUTY_LINE_COLOR = (10, 10, 10)


def _font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_MONO if mono else (FONT_BOLD if bold else FONT_REGULAR)
    return ImageFont.truetype(path, size)


def create_blank_sheet(title: str = "Drivers Daily Log") -> tuple[Image.Image, ImageDraw.ImageDraw]:
    """Create the blank log canvas and draw all static template artwork."""
    image = Image.new("RGB", (C.LOG_TEMPLATE_WIDTH, C.LOG_TEMPLATE_HEIGHT), "white")
    draw = ImageDraw.Draw(image)

    _draw_header(draw, title)
    _draw_grid(draw)
    _draw_remarks_area(draw)
    _draw_shipping_and_recap(draw)
    return image, draw


# ----------------------------------------------------------------------
# Header
# ----------------------------------------------------------------------

def _text(draw, xy, text, size, bold=False, mono=False, color=TEXT_COLOR,
          anchor="la", max_width=None):
    font = _font(size, bold=bold, mono=mono)
    if max_width:
        text = _fit(draw, text, font, max_width)
    draw.text(xy, text, font=font, fill=color, anchor=anchor)
    return font


def _fit(draw, text, font, max_width):
    if not text:
        return text
    if draw.textlength(text, font=font) <= max_width:
        return text
    while text and draw.textlength(text + "…", font=font) > max_width:
        text = text[:-1]
    return text + "…"


def _draw_header(draw, title: str) -> None:
    W = C.LOG_TEMPLATE_WIDTH

    _text(draw, (C.MARGIN_X, C.MARGIN_TOP), title, C.TITLE_FONT_SIZE, bold=True)
    _text(
        draw,
        (C.MARGIN_X, C.MARGIN_TOP + 66),
        "(24 hours)",
        C.SUBTITLE_FONT_SIZE,
    )
    _text(
        draw,
        (W - 720, C.MARGIN_TOP + 4),
        "Original — File at home terminal",
        C.SMALL_FONT_SIZE,
    )
    _text(
        draw,
        (W - 720, C.MARGIN_TOP + 30),
        "Duplicate — Driver retains in his/her possession for 8 days.",
        C.SMALL_FONT_SIZE,
    )

    y = C.DATE_Y
    # Date fields
    _text(draw, (C.MARGIN_X, y - 26), "Date", C.LABEL_FONT_SIZE, bold=True)
    date_boxes = [("month", 190), ("day", 120), ("year", 140)]
    x = C.MARGIN_X + 70
    for label, width in date_boxes:
        draw.rectangle([x, y, x + width, y + 44], outline=LINE_COLOR, width=2)
        _text(draw, (x + width / 2, y + 48), label, C.SMALL_FONT_SIZE, anchor="ma",
              color=LIGHT_COLOR)
        x += width + 16

    # From / To
    fx = x + 60
    _text(draw, (fx, y + 4), "From:", C.FIELD_FONT_SIZE, bold=True)
    draw.line([fx + 110, y + 40, fx + 620, y + 40], fill=LINE_COLOR, width=2)
    _text(draw, (fx + 650, y + 4), "To:", C.FIELD_FONT_SIZE, bold=True)
    draw.line([fx + 730, y + 40, W - C.MARGIN_X, y + 40], fill=LINE_COLOR, width=2)

    # Row 1: miles + carrier
    y1 = C.INFO_ROW_1_Y
    draw.rectangle([C.MARGIN_X, y1, C.MARGIN_X + C.MILES_BOX_W, y1 + 58], outline=LINE_COLOR, width=2)
    _text(draw, (C.MARGIN_X + C.MILES_BOX_W / 2, y1 + 62), "Total Miles Driving Today",
          C.SMALL_FONT_SIZE, anchor="ma", color=LIGHT_COLOR)
    draw.rectangle([C.MILES_BOX_2_X, y1, C.MILES_BOX_2_X + C.MILES_BOX_W, y1 + 58],
                   outline=LINE_COLOR, width=2)
    _text(draw, (C.MILES_BOX_2_X + C.MILES_BOX_W / 2, y1 + 62), "Total Mileage Today",
          C.SMALL_FONT_SIZE, anchor="ma", color=LIGHT_COLOR)
    _text(draw, (C.CARRIER_X, y1 - 30), "Name of Carrier or Carriers", C.SMALL_FONT_SIZE,
          color=LIGHT_COLOR)
    draw.line([C.CARRIER_X, y1 + 40, W - C.MARGIN_X, y1 + 40], fill=LINE_COLOR, width=2)

    # Row 2: truck numbers + main office
    y2 = C.INFO_ROW_2_Y
    draw.rectangle([C.MARGIN_X, y2, C.MILES_BOX_2_X + C.MILES_BOX_W, y2 + 58],
                   outline=LINE_COLOR, width=2)
    truck_center_x = (C.MARGIN_X + C.MILES_BOX_2_X + C.MILES_BOX_W) / 2
    _text(draw, (truck_center_x, y2 + 62),
          "Truck/Tractor and Trailer Numbers or", C.SMALL_FONT_SIZE,
          anchor="ma", color=LIGHT_COLOR)
    _text(draw, (truck_center_x, y2 + 84),
          "License Plate(s)/State (show each unit)", C.SMALL_FONT_SIZE,
          anchor="ma", color=LIGHT_COLOR)
    _text(draw, (C.CARRIER_X, y2 - 30), "Main Office Address", C.SMALL_FONT_SIZE,
          color=LIGHT_COLOR)
    draw.line([C.CARRIER_X, y2 + 40, W - C.MARGIN_X, y2 + 40], fill=LINE_COLOR, width=2)

    # Row 3: home terminal + signature
    y3 = C.INFO_ROW_3_Y
    draw.rectangle([C.MARGIN_X, y3, C.MILES_BOX_2_X + C.MILES_BOX_W, y3 + 58],
                   outline=LINE_COLOR, width=2)
    _text(draw, (truck_center_x, y3 + 62), "Home Terminal Address", C.SMALL_FONT_SIZE,
          anchor="ma", color=LIGHT_COLOR)
    _text(draw, (C.CARRIER_X, y3 - 30), "Driver's Signature / Name of Co-Driver",
          C.SMALL_FONT_SIZE, color=LIGHT_COLOR)
    draw.line([C.CARRIER_X, y3 + 40, W - C.MARGIN_X, y3 + 40], fill=LINE_COLOR, width=2)


# ----------------------------------------------------------------------
# 24-hour graph grid
# ----------------------------------------------------------------------

def _draw_grid(draw) -> None:
    x0, y0 = C.GRID_X, C.GRID_Y
    width, height = C.GRID_WIDTH, C.GRID_HEIGHT

    # Hour labels along the top: Midnight 1 2 ... 11 Noon 1 ... 11 Midnight
    label_font = _font(C.SMALL_FONT_SIZE - 3)
    for hour in range(24):
        cx = C.time_to_x(hour) + C.HOUR_WIDTH / 2
        if hour == 0:
            draw.text((x0, y0 - 10), "Midnight", font=label_font,
                      fill=TEXT_COLOR, anchor="la")
        elif hour == 12:
            draw.text((cx, y0 - 10), "Noon", font=label_font,
                      fill=TEXT_COLOR, anchor="ma")
        elif hour == 23:
            draw.text((x0 + width, y0 - 10), "Midnight", font=label_font,
                      fill=TEXT_COLOR, anchor="ra")
        else:
            draw.text((cx, y0 - 10), str(hour % 12), font=label_font,
                      fill=TEXT_COLOR, anchor="ma")

    # Grid box
    draw.rectangle([x0, y0, x0 + width, y0 + height], outline=LINE_COLOR, width=3)

    # Hour verticals + half-hour minor ticks per row
    for hour in range(25):
        x = C.time_to_x(hour)
        draw.line([x, y0, x, y0 + height], fill=GRID_COLOR, width=1)
        if hour < 24:
            # half-hour tick between hour columns
            xm = C.time_to_x(hour + 0.5)
            draw.line([xm, y0, xm, y0 + 14], fill=GRID_COLOR, width=1)
            draw.line([xm, y0 + height - 14, xm, y0 + height], fill=GRID_COLOR, width=1)
        # quarter ticks (like the paper log's fine marks)
        if hour < 24:
            for quarter in (0.25, 0.75):
                xq = C.time_to_x(hour + quarter)
                draw.line([xq, y0, xq, y0 + 8], fill=LIGHT_COLOR, width=1)
                draw.line([xq, y0 + height - 8, xq, y0 + height], fill=LIGHT_COLOR, width=1)

    # Row separators
    for row in range(1, C.ROW_COUNT):
        y = y0 + row * C.ROW_HEIGHT
        draw.line([x0, y, x0 + width, y], fill=LINE_COLOR, width=2)

    # Row labels (left side)
    label_font = _font(C.SMALL_FONT_SIZE)
    bold_font = _font(C.SMALL_FONT_SIZE, bold=True)
    for status in C.STATUS_ROWS:
        label = C.STATUS_ROW_LABELS[status]
        cy = C.row_center_y(status)
        lines = label.split("\n")
        if len(lines) == 1:
            draw.text((x0 - 16, cy), label, font=bold_font, fill=TEXT_COLOR, anchor="rs")
        else:
            total_h = len(lines) * (C.SMALL_FONT_SIZE + 4)
            start_y = cy - total_h / 2
            for i, ln in enumerate(lines):
                draw.text((x0 - 16, start_y + i * (C.SMALL_FONT_SIZE + 4)), ln,
                          font=bold_font, fill=TEXT_COLOR, anchor="rm")

    # Right-hand totals column: "Rem." + "Total Hours" boxes per row
    tx = C.TOTALS_COLUMN_X
    _text(draw, (tx + 37, y0 - 14), "Rem.", C.SMALL_FONT_SIZE, color=LIGHT_COLOR,
          anchor="ms")
    _text(draw, (tx + 123, y0 - 14), "Total Hours", C.SMALL_FONT_SIZE, color=LIGHT_COLOR,
          anchor="ms")
    for status in C.STATUS_ROWS:
        top = C.row_top_y(status)
        draw.rectangle([tx, top, tx + 74, top + C.ROW_HEIGHT], outline=LINE_COLOR, width=2)
        draw.rectangle([tx + 86, top, tx + C.TOTALS_COLUMN_WIDTH, top + C.ROW_HEIGHT],
                       outline=LINE_COLOR, width=2)

    # Bottom hour scale (second ruler like the paper log)
    for hour in range(25):
        x = C.time_to_x(hour)
        draw.line([x, y0 + height, x, y0 + height + 12], fill=GRID_COLOR, width=1)
    draw.text((x0, y0 + height + 16), "Midnight", font=label_font, fill=TEXT_COLOR, anchor="la")
    draw.text((C.time_to_x(12), y0 + height + 16), "Noon", font=label_font,
              fill=TEXT_COLOR, anchor="ma")
    draw.text((x0 + width, y0 + height + 16), "Midnight", font=label_font,
              fill=TEXT_COLOR, anchor="ra")


# ----------------------------------------------------------------------
# Remarks / shipping / recap
# ----------------------------------------------------------------------

def _draw_remarks_area(draw) -> None:
    x0 = C.GRID_X
    y0 = C.REMARKS_Y
    width = C.GRID_WIDTH + 140
    height = C.REMARKS_HEIGHT
    _text(draw, (C.MARGIN_X + 60, y0 + 8), "Remarks", C.FIELD_FONT_SIZE, bold=True)
    draw.rectangle([x0, y0, x0 + width, y0 + height], outline=LINE_COLOR, width=3)


def _draw_shipping_and_recap(draw) -> None:
    x0 = C.GRID_X
    y0 = C.SHIPPING_Y
    W = C.LOG_TEMPLATE_WIDTH

    # Shipping docs block (left)
    _text(draw, (x0, y0), "Shipping:", C.LABEL_FONT_SIZE, bold=True)
    _text(draw, (x0, y0 + 30), "Docs:", C.LABEL_FONT_SIZE, bold=True)
    draw.line([x0 + 130, y0 + 36, x0 + 560, y0 + 36], fill=LINE_COLOR, width=2)
    _text(draw, (x0, y0 + 48), "Pro or Shipping No.", C.SMALL_FONT_SIZE, color=LIGHT_COLOR)
    _text(draw, (x0, y0 + 84), "or", C.LABEL_FONT_SIZE)
    _text(draw, (x0, y0 + 116), "Shipper & Commodity:", C.LABEL_FONT_SIZE, bold=True)
    draw.line([x0 + 260, y0 + 122, x0 + 560, y0 + 122], fill=LINE_COLOR, width=2)

    # Recap block (right)
    rx = x0 + 640
    _text(draw, (rx, y0 - 6), "Recaps: Complete at end of Day",
          C.LABEL_FONT_SIZE, bold=True)
    col_w = 250
    for i, header in enumerate(["70 Hour/8 Day", "60 Hour/7 Day"]):
        cx = rx + i * (col_w + 24)
        _text(draw, (cx + 8, y0 + 26), header, C.SMALL_FONT_SIZE, bold=True)
        for j, row in enumerate(["A. Hours today", "B. Prev. 7 days", "C. Total"]):
            ry = y0 + 56 + j * 52
            draw.rectangle([cx, ry, cx + col_w, ry + 44], outline=LINE_COLOR, width=2)
            _text(draw, (cx + 8, ry + 22), row, C.SMALL_FONT_SIZE, color=LIGHT_COLOR,
                  anchor="lm")

    # 34-hour restart note box (far right)
    nx = rx + 2 * (col_w + 24) + 10
    draw.rectangle([nx, y0 + 26, W - C.MARGIN_X, y0 + 200], outline=LINE_COLOR, width=2)
    note = [
        "If you took 34",
        "consecutive hours",
        "off duty you",
        "may restart your",
        "70/60 schedule.",
    ]
    for i, ln in enumerate(note):
        _text(draw, (nx + 14, y0 + 36 + i * 30), ln, C.SMALL_FONT_SIZE)


# ----------------------------------------------------------------------
# Duty-line drawing primitives (shared by the renderer)
# ----------------------------------------------------------------------

def draw_hour_marker(draw, hour: int, text: str = "✕") -> None:
    """Small marker in the 'Rem.' column at a given hour (like paper logs)."""
    x = C.time_to_x(hour)
    y = C.GRID_Y - 2
    draw.line([x, y, x + 2, y + 6], fill=DUTY_LINE_COLOR, width=2)
