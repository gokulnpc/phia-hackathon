"""Benchmark Fash AI Virtual Try-On v1.6 (direct API) wall-clock latency.

Run from ``apps/backend``::

    cd apps/backend
    export FASHN_API_KEY=...
    uv run python scripts/benchmark_tryon_providers.py \\
      --person ../../docs/person.png \\
      --garment ../../docs/garment.webp

Optional ``--preprocess-person`` matches production 3:4 crop. Successful runs save
``fashn_direct.png`` under ``--output-dir`` (default: ``scripts/benchmark_tryon_outputs``).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import os
import statistics
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_SRC = _BACKEND_ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

_POLL_INTERVAL_SEC = 1.0
_POLL_MAX_ITERATIONS = 300
_HTTP_TIMEOUT_SEC = 180.0
FASHN_BASE = "https://api.fashn.ai/v1"


def _mime_for_path(path: Path) -> str:
    suf = path.suffix.lower()
    if suf == ".png":
        return "image/png"
    if suf in (".jpg", ".jpeg"):
        return "image/jpeg"
    if suf == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _file_to_data_uri(path: Path) -> str:
    raw = path.read_bytes()
    mime = _mime_for_path(path)
    b64 = base64.standard_b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _file_to_data_uri_garment(path: Path) -> str:
    if _mime_for_path(path) != "image/webp":
        return _file_to_data_uri(path)
    from PIL import Image

    raw = path.read_bytes()
    with Image.open(BytesIO(raw)) as im:
        rgb = im.convert("RGB")
        out = BytesIO()
        rgb.save(out, format="PNG", optimize=True)
    b64 = base64.standard_b64encode(out.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _fashn_inputs(model_image: str, garment_image: str) -> dict[str, Any]:
    return {
        "model_image": model_image,
        "garment_image": garment_image,
        "category": "auto",
        "segmentation_free": True,
        "moderation_level": "permissive",
        "garment_photo_type": "auto",
        "mode": "balanced",
        "seed": 42,
        "num_samples": 1,
        "output_format": "png",
        "return_base64": False,
    }


async def _save_image_from_url(client: httpx.AsyncClient, url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    resp = await client.get(url, follow_redirects=True)
    resp.raise_for_status()
    dest.write_bytes(resp.content)


async def run_fashn_benchmark(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    model_image: str,
    garment_image: str,
) -> tuple[float, str | None, str | None]:
    """Returns (elapsed_s, first_output_url, error_message)."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = {"model_name": "tryon-v1.6", "inputs": _fashn_inputs(model_image, garment_image)}
    t0 = time.perf_counter()
    resp = await client.post(f"{FASHN_BASE}/run", headers=headers, json=body)
    if resp.status_code >= 400:
        elapsed = time.perf_counter() - t0
        return elapsed, None, f"HTTP {resp.status_code}: {resp.text[:500]}"
    data = resp.json()
    pred_id = data.get("id")
    if not isinstance(pred_id, str):
        elapsed = time.perf_counter() - t0
        return elapsed, None, f"Missing id in response: {data!r}"

    for _ in range(_POLL_MAX_ITERATIONS):
        st = await client.get(
            f"{FASHN_BASE}/status/{pred_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if st.status_code >= 400:
            elapsed = time.perf_counter() - t0
            return elapsed, None, f"status HTTP {st.status_code}: {st.text[:500]}"
        sd = st.json()
        status = sd.get("status")
        if status == "completed":
            elapsed = time.perf_counter() - t0
            out = sd.get("output")
            url: str | None = None
            if isinstance(out, list) and len(out) > 0 and isinstance(out[0], str):
                url = out[0]
            return elapsed, url, None
        if status == "failed":
            elapsed = time.perf_counter() - t0
            err = sd.get("error")
            return elapsed, None, f"failed: {err!r}"
        await asyncio.sleep(_POLL_INTERVAL_SEC)

    elapsed = time.perf_counter() - t0
    return elapsed, None, "timeout waiting for Fash AI status"


def _prepare_images(
    person: Path,
    garment: Path,
    *,
    preprocess_person: bool,
) -> tuple[str, str]:
    person_bytes = person.read_bytes()
    if preprocess_person:
        from mirror.core.tryon_preprocess import fit_reference_to_3x4_png

        person_bytes = fit_reference_to_3x4_png(person_bytes)
        person_b64 = base64.standard_b64encode(person_bytes).decode("ascii")
        model_image = f"data:image/png;base64,{person_b64}"
    else:
        model_image = _file_to_data_uri(person)

    garment_uri = _file_to_data_uri_garment(garment)
    return model_image, garment_uri


async def _run_once(
    *,
    api_key: str,
    model_image: str,
    garment_image: str,
    output_dir: Path | None,
    run_index: int,
    repeat: int,
) -> tuple[float, str | None, str | None]:
    timeout = httpx.Timeout(_HTTP_TIMEOUT_SEC)
    async with httpx.AsyncClient(timeout=timeout) as client:
        elapsed, url, err = await run_fashn_benchmark(
            client,
            api_key=api_key,
            model_image=model_image,
            garment_image=garment_image,
        )
        if output_dir and url:
            name = f"fashn_direct_run{run_index + 1}.png" if repeat > 1 else "fashn_direct.png"
            dest = output_dir / name
            await _save_image_from_url(client, url, dest)
            print(f"  saved: {dest}")
        return elapsed, url, err


def main() -> None:
    repo_root = _BACKEND_ROOT.parent.parent
    default_person = repo_root / "docs" / "person.png"
    default_garment = repo_root / "docs" / "garment.webp"
    default_out = _BACKEND_ROOT / "scripts" / "benchmark_tryon_outputs"

    p = argparse.ArgumentParser(description="Benchmark Fash AI try-on v1.6 (direct API) latency.")
    p.add_argument("--person", type=Path, default=default_person, help="Model/person image")
    p.add_argument("--garment", type=Path, default=default_garment, help="Garment image")
    p.add_argument(
        "--preprocess-person",
        action="store_true",
        help="Apply production 3:4 top-anchored crop to person.",
    )
    p.add_argument("--repeat", type=int, default=1, metavar="N", help="Run N times (default: 1)")
    p.add_argument(
        "--output-dir",
        type=Path,
        default=default_out,
        metavar="DIR",
        help=f"Directory for result PNG (default: {default_out})",
    )
    p.add_argument("--no-save", action="store_true", help="Do not write output image")
    args = p.parse_args()

    api_key = os.environ.get("FASHN_API_KEY", "").strip()
    if not api_key:
        sys.exit("Set FASHN_API_KEY in the environment.")

    if not args.person.is_file():
        sys.exit(f"Person image not found: {args.person}")
    if not args.garment.is_file():
        sys.exit(f"Garment image not found: {args.garment}")

    model_image, garment_image = _prepare_images(
        args.person,
        args.garment,
        preprocess_person=args.preprocess_person,
    )

    output_dir: Path | None = None if args.no_save else args.output_dir.resolve()

    times: list[float] = []
    for i in range(args.repeat):
        if args.repeat > 1:
            print(f"--- Run {i + 1}/{args.repeat} ---")
        elapsed, url, err = asyncio.run(
            _run_once(
                api_key=api_key,
                model_image=model_image,
                garment_image=garment_image,
                output_dir=output_dir,
                run_index=i,
                repeat=args.repeat,
            )
        )
        times.append(elapsed)
        print(f"fashn_direct_s={elapsed:.3f}")
        if err:
            print(f"  error: {err}")
        elif url:
            print(f"  output_url={url[:80]}...")

    if args.repeat > 1:
        print("--- Summary ---")
        print(
            f"fashn_direct: min={min(times):.3f}s max={max(times):.3f}s "
            f"mean={statistics.mean(times):.3f}s"
        )


if __name__ == "__main__":
    main()
