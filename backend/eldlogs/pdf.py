"""PDF export for daily logs (visual layout preserved — image-based pages)."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image


def images_to_pdf(images: list[Image.Image], output_path: str | Path) -> Path:
    """
    Save rendered log images as a multi-page PDF preserving each page's
    visual layout (not a text-only PDF).
    """
    if not images:
        raise ValueError("No log images to export.")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    first, *rest = images
    rgb = [img.convert("RGB") for img in images]
    rgb[0].save(
        output,
        "PDF",
        save_all=True,
        append_images=rgb[1:],
        resolution=200.0,
    )
    return output


def image_to_png_bytes(image: Image.Image) -> bytes:
    """Serialize one rendered log to PNG bytes (for HTTP responses)."""
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()
