"""Reference 3:4 fit for try-on model_image."""

from io import BytesIO

from PIL import Image

from mirror.core.tryon_preprocess import MODEL_CANVAS_H, MODEL_CANVAS_W, fit_reference_to_3x4_png


def test_fit_reference_to_3x4_png_output_dimensions() -> None:
    tall = Image.new("RGB", (400, 1600), color=(10, 20, 30))
    buf = BytesIO()
    tall.save(buf, format="PNG")
    out = fit_reference_to_3x4_png(buf.getvalue())
    with Image.open(BytesIO(out)) as im:
        assert im.size == (MODEL_CANVAS_W, MODEL_CANVAS_H)
