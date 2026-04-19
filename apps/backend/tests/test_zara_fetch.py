"""HTML parsing for server-side Zara PDP refresh."""

from __future__ import annotations

from mirror.core.visual_search.zara_fetch import parse_zara_html, looks_like_zara_noise_title


def test_looks_like_noise_title() -> None:
    assert looks_like_zara_noise_title("Men's fashion 2026 | ZARA United States")
    assert looks_like_zara_noise_title("")
    assert not looks_like_zara_noise_title("Linen Blend Safari Jacket")


def test_parse_zara_html_extracts_name_and_image() -> None:
    html = """<!DOCTYPE html><html><body>
    <h1 data-qa-qualifier="product-detail-info-header">Linen Blend Safari Jacket</h1>
    <picture class="media-image"><img src="https://cdn.example.com/a.jpg"
      srcset="https://cdn.example.com/small.jpg 360w, https://cdn.example.com/big.jpg 720w"/></picture>
    </body></html>"""
    url = "https://www.zara.com/us/en/linen-blend-safari-jacket-p05520403.html"
    parsed = parse_zara_html(html, url)
    assert parsed is not None
    assert parsed.name == "Linen Blend Safari Jacket"
    assert "big.jpg" in parsed.image_url
