"""
Blank daily-log sheet template drawer (Pillow).

Draws the full paper log — header boxes, 24-hour graph grid with hour/half-
hour ticks, remarks area, shipping docs and the 70/8 recap section —
replicating the supplied blank log reference at high resolution.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from . import coordinates as C


# ----------------------------------------------------------------------
# Cross-platform font configuration
# ----------------------------------------------------------------------

# Candidate font locations.
#
# The application may run on:
#   - Windows locally
#   - Linux on Render
#   - another Linux/container environment
#
# We try several common locations instead of assuming one operating system.

FONT_CANDIDATES = {
    "regular": [
        # Linux / Render
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",

        # Windows
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
    ],
    "bold": [
        # Linux / Render
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",

        # Windows
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
    ],
    "mono": [
        # Linux / Render
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",

        # Windows
        "C:/Windows/Fonts/consola.ttf",
    ],
}

LINE_COLOR = (40, 40, 40)
GRID_COLOR = (110, 110, 110)
LIGHT_COLOR = (160, 160, 160)
TEXT_COLOR = (25, 25, 25)
DUTY_LINE_COLOR = (10, 10, 10)

# Cache resolved fonts so we don't repeatedly search the filesystem.
_FONT_PATH_CACHE: dict[str, str | None] = {}

# Cache loaded Pillow font objects.
_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont | ImageFont.ImageFont] = {}


# ----------------------------------------------------------------------
# Font helpers
# ----------------------------------------------------------------------

def _find_font_path(font_type: str) -> str | None:
    """
    Find an available font path for the requested font type.

    Returns:
        Absolute/usable font path, or None if no external font is available.
    """
    if font_type in _FONT_PATH_CACHE:
        return _FONT_PATH_CACHE[font_type]

    candidates = FONT_CANDIDATES.get(font_type, [])

    for candidate in candidates:
        path = Path(candidate)

        if path.is_file():
            resolved = str(path)
            _FONT_PATH_CACHE[font_type] = resolved
            return resolved

    _FONT_PATH_CACHE[font_type] = None
    return None


def _font(
    size: int,
    bold: bool = False,
    mono: bool = False,
):
    """
    Load a cross-platform Pillow font.

    Preference:
        mono  -> DejaVuSansMono / Consolas
        bold  -> DejaVuSans-Bold / Arial Bold
        normal -> DejaVuSans / Arial

    If no external font is available, Pillow's built-in default font
    is returned instead of crashing the entire ELD renderer.
    """
    if mono:
        font_type = "mono"
    elif bold:
        font_type = "bold"
    else:
        font_type = "regular"

    cache_key = (font_type, int(size))

    if cache_key in _FONT_CACHE:
        return _FONT_CACHE[cache_key]

    path = _find_font_path(font_type)

    if path:
        try:
            font = ImageFont.truetype(path, int(size))
            _FONT_CACHE[cache_key] = font
            return font
        except (OSError, IOError):
            # If a discovered font somehow cannot be loaded,
            # continue to Pillow's fallback font.
            pass

    # Final fallback.
    #
    # This prevents an unavailable OS font from causing:
    # OSError: cannot open resource
    font = ImageFont.load_default()

    _FONT_CACHE[cache_key] = font
    return font


# ----------------------------------------------------------------------
# Basic canvas creation
# ----------------------------------------------------------------------

def create_blank_sheet(
    title: str = "Drivers Daily Log",
) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    """Create the blank log canvas and draw all static template artwork."""

    image = Image.new(
        "RGB",
        (
            C.LOG_TEMPLATE_WIDTH,
            C.LOG_TEMPLATE_HEIGHT,
        ),
        "white",
    )

    draw = ImageDraw.Draw(image)

    _draw_header(draw, title)
    _draw_grid(draw)
    _draw_remarks_area(draw)
    _draw_shipping_and_recap(draw)

    return image, draw


# ----------------------------------------------------------------------
# Text helpers
# ----------------------------------------------------------------------

def _text(
    draw,
    xy,
    text,
    size,
    bold=False,
    mono=False,
    color=(25, 25, 25),
    anchor="la",
    max_width=None,
):
    """Draw text using the cross-platform font loader."""

    font = _font(
        size,
        bold=bold,
        mono=mono,
    )

    if max_width:
        text = _fit(
            draw,
            text,
            font,
            max_width,
        )

    draw.text(
        xy,
        text,
        font=font,
        fill=color,
        anchor=anchor,
    )

    return font


def _fit(
    draw,
    text,
    font,
    max_width,
):
    """Fit text into a maximum width by truncating with an ellipsis."""

    if not text:
        return text

    if draw.textlength(text, font=font) <= max_width:
        return text

    while text and draw.textlength(text + "…", font=font) > max_width:
        text = text[:-1]

    return text + "…"


# ----------------------------------------------------------------------
# Header
# ----------------------------------------------------------------------

def _draw_header(draw, title: str) -> None:
    W = C.LOG_TEMPLATE_WIDTH

    _text(
        draw,
        (C.MARGIN_X, C.MARGIN_TOP),
        title,
        C.TITLE_FONT_SIZE,
        bold=True,
    )

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
    _text(
        draw,
        (C.MARGIN_X, y - 26),
        "Date",
        C.LABEL_FONT_SIZE,
        bold=True,
    )

    date_boxes = [
        ("month", 190),
        ("day", 120),
        ("year", 140),
    ]

    x = C.MARGIN_X + 70

    for label, width in date_boxes:
        draw.rectangle(
            [
                x,
                y,
                x + width,
                y + 44,
            ],
            outline=(40, 40, 40),
            width=2,
        )

        _text(
            draw,
            (x + width / 2, y + 48),
            label,
            C.SMALL_FONT_SIZE,
            anchor="ma",
            color=(160, 160, 160),
        )

        x += width + 16

    # From / To
    fx = x + 60

    _text(
        draw,
        (fx, y + 4),
        "From:",
        C.FIELD_FONT_SIZE,
        bold=True,
    )

    draw.line(
        [
            fx + 110,
            y + 40,
            fx + 620,
            y + 40,
        ],
        fill=(40, 40, 40),
        width=2,
    )

    _text(
        draw,
        (fx + 650, y + 4),
        "To:",
        C.FIELD_FONT_SIZE,
        bold=True,
    )

    draw.line(
        [
            fx + 730,
            y + 40,
            W - C.MARGIN_X,
            y + 40,
        ],
        fill=(40, 40, 40),
        width=2,
    )

    # Row 1: miles + carrier
    y1 = C.INFO_ROW_1_Y

    draw.rectangle(
        [
            C.MARGIN_X,
            y1,
            C.MARGIN_X + C.MILES_BOX_W,
            y1 + 58,
        ],
        outline=(40, 40, 40),
        width=2,
    )

    _text(
        draw,
        (
            C.MARGIN_X + C.MILES_BOX_W / 2,
            y1 + 62,
        ),
        "Total Miles Driving Today",
        C.SMALL_FONT_SIZE,
        anchor="ma",
        color=(160, 160, 160),
    )

    draw.rectangle(
        [
            C.MILES_BOX_2_X,
            y1,
            C.MILES_BOX_2_X + C.MILES_BOX_W,
            y1 + 58,
        ],
        outline=(40, 40, 40),
        width=2,
    )

    _text(
        draw,
        (
            C.MILES_BOX_2_X + C.MILES_BOX_W / 2,
            y1 + 62,
        ),
        "Total Mileage Today",
        C.SMALL_FONT_SIZE,
        anchor="ma",
        color=(160, 160, 160),
    )

    _text(
        draw,
        (C.CARRIER_X, y1 - 30),
        "Name of Carrier or Carriers",
        C.SMALL_FONT_SIZE,
        color=(160, 160, 160),
    )

    draw.line(
        [
            C.CARRIER_X,
            y1 + 40,
            W - C.MARGIN_X,
            y1 + 40,
        ],
        fill=(40, 40, 40),
        width=2,
    )

    # Row 2: truck numbers + main office
    y2 = C.INFO_ROW_2_Y

    draw.rectangle(
        [
            C.MARGIN_X,
            y2,
            C.MILES_BOX_2_X + C.MILES_BOX_W,
            y2 + 58,
        ],
        outline=(40, 40, 40),
        width=2,
    )

    truck_center_x = (
        C.MARGIN_X
        + C.MILES_BOX_2_X
        + C.MILES_BOX_W
    ) / 2

    _text(
        draw,
        (truck_center_x, y2 + 62),
        "Truck/Tractor and Trailer Numbers or",
        C.SMALL_FONT_SIZE,
        anchor="ma",
        color=(160, 160, 160),
    )

    _text(
        draw,
        (truck_center_x, y2 + 84),
        "License Plate(s)/State (show each unit)",
        C.SMALL_FONT_SIZE,
        anchor="ma",
        color=(160, 160, 160),
    )

    _text(
        draw,
        (C.CARRIER_X, y2 - 30),
        "Main Office Address",
        C.SMALL_FONT_SIZE,
        color=(160, 160, 160),
    )

    draw.line(
        [
            C.CARRIER_X,
            y2 + 40,
            W - C.MARGIN_X,
            y2 + 40,
        ],
        fill=(40, 40, 40),
        width=2,
    )

    # Row 3: home terminal + signature
    y3 = C.INFO_ROW_3_Y

    draw.rectangle(
        [
            C.MARGIN_X,
            y3,
            C.MILES_BOX_2_X + C.MILES_BOX_W,
            y3 + 58,
        ],
        outline=(40, 40, 40),
        width=2,
    )

    _text(
        draw,
        (truck_center_x, y3 + 62),
        "Home Terminal Address",
        C.SMALL_FONT_SIZE,
        anchor="ma",
        color=(160, 160, 160),
    )

    _text(
        draw,
        (C.CARRIER_X, y3 - 30),
        "Driver's Signature / Name of Co-Driver",
        C.SMALL_FONT_SIZE,
        color=(160, 160, 160),
    )

    draw.line(
        [
            C.CARRIER_X,
            y3 + 40,
            W - C.MARGIN_X,
            y3 + 40,
        ],
        fill=(40, 40, 40),
        width=2,
    )


# ----------------------------------------------------------------------
# 24-hour graph grid
# ----------------------------------------------------------------------

def _draw_grid(draw) -> None:
    x0 = C.GRID_X
    y0 = C.GRID_Y
    width = C.GRID_WIDTH
    height = C.GRID_HEIGHT

    # Hour labels along the top:
    # Midnight 1 2 ... 11 Noon 1 ... 11 Midnight
    label_font = _font(
        C.SMALL_FONT_SIZE - 3
    )

    for hour in range(24):
        cx = C.time_to_x(hour) + C.HOUR_WIDTH / 2

        if hour == 0:
            draw.text(
                (x0, y0 - 10),
                "Midnight",
                font=label_font,
                fill=(25, 25, 25),
                anchor="la",
            )

        elif hour == 12:
            draw.text(
                (cx, y0 - 10),
                "Noon",
                font=label_font,
                fill=(25, 25, 25),
                anchor="ma",
            )

        elif hour == 23:
            draw.text(
                (x0 + width, y0 - 10),
                "Midnight",
                font=label_font,
                fill=(25, 25, 25),
                anchor="ra",
            )

        else:
            draw.text(
                (cx, y0 - 10),
                str(hour % 12),
                font=label_font,
                fill=(25, 25, 25),
                anchor="ma",
            )

    # Grid box
    draw.rectangle(
        [
            x0,
            y0,
            x0 + width,
            y0 + height,
        ],
        outline=(40, 40, 40),
        width=3,
    )

    # Hour verticals + half-hour minor ticks per row
    for hour in range(25):
        x = C.time_to_x(hour)

        draw.line(
            [
                x,
                y0,
                x,
                y0 + height,
            ],
            fill=(110, 110, 110),
            width=1,
        )

        if hour < 24:
            # Half-hour tick
            xm = C.time_to_x(hour + 0.5)

            draw.line(
                [
                    xm,
                    y0,
                    xm,
                    y0 + 14,
                ],
                fill=(110, 110, 110),
                width=1,
            )

            draw.line(
                [
                    xm,
                    y0 + height - 14,
                    xm,
                    y0 + height,
                ],
                fill=(110, 110, 110),
                width=1,
            )

            # Quarter-hour ticks
            for quarter in (0.25, 0.75):
                xq = C.time_to_x(hour + quarter)

                draw.line(
                    [
                        xq,
                        y0,
                        xq,
                        y0 + 8,
                    ],
                    fill=(160, 160, 160),
                    width=1,
                )

                draw.line(
                    [
                        xq,
                        y0 + height - 8,
                        xq,
                        y0 + height,
                    ],
                    fill=(160, 160, 160),
                    width=1,
                )

    # Row separators
    for row in range(1, C.ROW_COUNT):
        y = y0 + row * C.ROW_HEIGHT

        draw.line(
            [
                x0,
                y,
                x0 + width,
                y,
            ],
            fill=(40, 40, 40),
            width=2,
        )

    # Row labels
    label_font = _font(C.SMALL_FONT_SIZE)
    bold_font = _font(
        C.SMALL_FONT_SIZE,
        bold=True,
    )

    for status in C.STATUS_ROWS:
        label = C.STATUS_ROW_LABELS[status]
        cy = C.row_center_y(status)
        lines = label.split("\n")

        if len(lines) == 1:
            draw.text(
                (x0 - 16, cy),
                label,
                font=bold_font,
                fill=(25, 25, 25),
                anchor="rs",
            )

        else:
            total_h = len(lines) * (
                C.SMALL_FONT_SIZE + 4
            )

            start_y = cy - total_h / 2

            for i, ln in enumerate(lines):
                draw.text(
                    (
                        x0 - 16,
                        start_y
                        + i * (C.SMALL_FONT_SIZE + 4),
                    ),
                    ln,
                    font=bold_font,
                    fill=(25, 25, 25),
                    anchor="rm",
                )

    # Right-hand totals column
    tx = C.TOTALS_COLUMN_X

    _text(
        draw,
        (tx + 37, y0 - 14),
        "Rem.",
        C.SMALL_FONT_SIZE,
        color=(160, 160, 160),
        anchor="ms",
    )

    _text(
        draw,
        (tx + 123, y0 - 14),
        "Total Hours",
        C.SMALL_FONT_SIZE,
        color=(160, 160, 160),
        anchor="ms",
    )

    for status in C.STATUS_ROWS:
        top = C.row_top_y(status)

        draw.rectangle(
            [
                tx,
                top,
                tx + 74,
                top + C.ROW_HEIGHT,
            ],
            outline=(40, 40, 40),
            width=2,
        )

        draw.rectangle(
            [
                tx + 86,
                top,
                tx + C.TOTALS_COLUMN_WIDTH,
                top + C.ROW_HEIGHT,
            ],
            outline=(40, 40, 40),
            width=2,
        )

    # Bottom hour scale
    for hour in range(25):
        x = C.time_to_x(hour)

        draw.line(
            [
                x,
                y0 + height,
                x,
                y0 + height + 12,
            ],
            fill=(110, 110, 110),
            width=1,
        )

    draw.text(
        (x0, y0 + height + 16),
        "Midnight",
        font=label_font,
        fill=(25, 25, 25),
        anchor="la",
    )

    draw.text(
        (C.time_to_x(12), y0 + height + 16),
        "Noon",
        font=label_font,
        fill=(25, 25, 25),
        anchor="ma",
    )

    draw.text(
        (x0 + width, y0 + height + 16),
        "Midnight",
        font=label_font,
        fill=(25, 25, 25),
        anchor="ra",
    )


# ----------------------------------------------------------------------
# Remarks / shipping / recap
# ----------------------------------------------------------------------

def _draw_remarks_area(draw) -> None:
    x0 = C.GRID_X
    y0 = C.REMARKS_Y
    width = C.GRID_WIDTH + 140
    height = C.REMARKS_HEIGHT

    _text(
        draw,
        (C.MARGIN_X + 60, y0 + 8),
        "Remarks",
        C.FIELD_FONT_SIZE,
        bold=True,
    )

    draw.rectangle(
        [
            x0,
            y0,
            x0 + width,
            y0 + height,
        ],
        outline=(40, 40, 40),
        width=3,
    )


def _draw_shipping_and_recap(draw) -> None:
    x0 = C.GRID_X
    y0 = C.SHIPPING_Y
    W = C.LOG_TEMPLATE_WIDTH

    # Shipping docs block
    _text(
        draw,
        (x0, y0),
        "Shipping:",
        C.LABEL_FONT_SIZE,
        bold=True,
    )

    _text(
        draw,
        (x0, y0 + 30),
        "Docs:",
        C.LABEL_FONT_SIZE,
        bold=True,
    )

    draw.line(
        [
            x0 + 130,
            y0 + 36,
            x0 + 560,
            y0 + 36,
        ],
        fill=(40, 40, 40),
        width=2,
    )

    _text(
        draw,
        (x0, y0 + 48),
        "Pro or Shipping No.",
        C.SMALL_FONT_SIZE,
        color=(160, 160, 160),
    )

    _text(
        draw,
        (x0, y0 + 84),
        "or",
        C.LABEL_FONT_SIZE,
    )

    _text(
        draw,
        (x0, y0 + 116),
        "Shipper & Commodity:",
        C.LABEL_FONT_SIZE,
        bold=True,
    )

    draw.line(
        [
            x0 + 260,
            y0 + 122,
            x0 + 560,
            y0 + 122,
        ],
        fill=(40, 40, 40),
        width=2,
    )

    # Recap block
    rx = x0 + 640

    _text(
        draw,
        (rx, y0 - 6),
        "Recaps: Complete at end of Day",
        C.LABEL_FONT_SIZE,
        bold=True,
    )

    col_w = 250

    for i, header in enumerate(
        [
            "70 Hour/8 Day",
            "60 Hour/7 Day",
        ]
    ):
        cx = rx + i * (col_w + 24)

        _text(
            draw,
            (cx + 8, y0 + 26),
            header,
            C.SMALL_FONT_SIZE,
            bold=True,
        )

        for j, row in enumerate(
            [
                "A. Hours today",
                "B. Prev. 7 days",
                "C. Total",
            ]
        ):
            ry = y0 + 56 + j * 52

            draw.rectangle(
                [
                    cx,
                    ry,
                    cx + col_w,
                    ry + 44,
                ],
                outline=(40, 40, 40),
                width=2,
            )

            _text(
                draw,
                (cx + 8, ry + 22),
                row,
                C.SMALL_FONT_SIZE,
                color=(160, 160, 160),
                anchor="lm",
            )

    # 34-hour restart note box
    nx = rx + 2 * (col_w + 24) + 10

    draw.rectangle(
        [
            nx,
            y0 + 26,
            W - C.MARGIN_X,
            y0 + 200,
        ],
        outline=(40, 40, 40),
        width=2,
    )

    note = [
        "If you took 34",
        "consecutive hours",
        "off duty you",
        "may restart your",
        "70/60 schedule.",
    ]

    for i, ln in enumerate(note):
        _text(
            draw,
            (
                nx + 14,
                y0 + 36 + i * 30,
            ),
            ln,
            C.SMALL_FONT_SIZE,
        )


# ----------------------------------------------------------------------
# Duty-line drawing primitives
# ----------------------------------------------------------------------

def draw_hour_marker(
    draw,
    hour: int,
    text: str = "✕",
) -> None:
    """Small marker in the 'Rem.' column at a given hour."""

    x = C.time_to_x(hour)
    y = C.GRID_Y - 2

    draw.line(
        [
            x,
            y,
            x + 2,
            y + 6,
        ],
        fill=(10, 10, 10),
        width=2,
    )