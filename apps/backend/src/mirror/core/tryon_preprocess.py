"""Resize reference (model) images to a fixed 3:4 frame for try-on providers."""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps

# Portrait 3:4 (width : height) — matches extension Try-on hero.
MODEL_CANVAS_W = 768
MODEL_CANVAS_H = 1024


def fit_reference_to_3x4_png(image_bytes: bytes) -> bytes:
    """Cover-crop / scale to MODEL_CANVAS_W x MODEL_CANVAS_H and return PNG bytes.

    Vertical crop uses top anchoring (centering y=0) so tall reference photos keep
    the head; excess height is removed from the bottom before try-on generation.
    """
    with Image.open(BytesIO(image_bytes)) as im:
        rgb = im.convert("RGB")
        fitted = ImageOps.fit(
            rgb,
            (MODEL_CANVAS_W, MODEL_CANVAS_H),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.0),
        )
    out = BytesIO()
    fitted.save(out, format="PNG", optimize=True)
    return out.getvalue()
