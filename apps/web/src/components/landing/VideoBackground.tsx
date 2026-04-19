"use client";

import { useEffect, useRef, useState } from "react";

const FADE_DURATION = 0.5;
/** Blend length at each loop seam — hides first/last frame mismatch. */
const LOOP_CROSSFADE_SEC = 0.55;
const VIDEO_SRC = "/Ethereal_Godly_Motion_Video_Generated.mp4";

export function VideoBackground() {
  const fadeWrapRef = useRef<HTMLDivElement>(null);
  const layer0Ref = useRef<HTMLDivElement>(null);
  const layer1Ref = useRef<HTMLDivElement>(null);
  const video0Ref = useRef<HTMLVideoElement>(null);
  const video1Ref = useRef<HTMLVideoElement>(null);
  const leadRef = useRef<0 | 1>(0);
  const mountTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    const wrap = fadeWrapRef.current;
    const l0 = layer0Ref.current;
    const l1 = layer1Ref.current;
    const v0 = video0Ref.current;
    const v1 = video1Ref.current;
    if (!wrap || !l0 || !l1 || !v0 || !v1) return;

    const tryPlayLead = () => {
      const lead = leadRef.current;
      void (lead === 0 ? v0 : v1).play().catch(() => {});
    };

    v0.addEventListener("loadeddata", tryPlayLead);
    v0.addEventListener("canplay", tryPlayLead);
    v1.addEventListener("loadeddata", tryPlayLead);
    v1.addEventListener("canplay", tryPlayLead);
    tryPlayLead();

    const tick = () => {
      if (mountTimeRef.current === null) mountTimeRef.current = performance.now();
      const elapsed = (performance.now() - mountTimeRef.current) / 1000;
      const wrapO = elapsed < FADE_DURATION ? elapsed / FADE_DURATION : 1;
      wrap.style.opacity = String(wrapO);

      const lead = leadRef.current;
      const vLead = lead === 0 ? v0 : v1;
      const vLag = lead === 0 ? v1 : v0;
      const layerLead = lead === 0 ? l0 : l1;
      const layerLag = lead === 0 ? l1 : l0;

      const d = vLead.duration;
      if (!Number.isFinite(d) || d <= 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const t = vLead.currentTime;
      const rem = d - t;
      const atLoopEnd = vLead.ended || rem <= 0.002;

      if (!atLoopEnd && rem <= LOOP_CROSSFADE_SEC) {
        if (vLag.paused) {
          vLag.currentTime = 0;
          void vLag.play().catch(() => {});
        }
        const p = 1 - rem / LOOP_CROSSFADE_SEC;
        layerLead.style.opacity = String(1 - p);
        layerLag.style.opacity = String(p);
      } else if (atLoopEnd) {
        vLead.pause();
        vLead.currentTime = 0;
        leadRef.current = (1 - lead) as 0 | 1;
        const nl = leadRef.current;
        const nlLead = nl === 0 ? l0 : l1;
        const nlLag = nl === 0 ? l1 : l0;
        nlLead.style.opacity = "1";
        nlLag.style.opacity = "0";
      } else {
        layerLead.style.opacity = "1";
        layerLag.style.opacity = "0";
        if (!vLag.paused) {
          vLag.pause();
          vLag.currentTime = 0;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    wrap.style.opacity = "0";
    l0.style.opacity = "1";
    l1.style.opacity = "0";
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      v0.removeEventListener("loadeddata", tryPlayLead);
      v0.removeEventListener("canplay", tryPlayLead);
      v1.removeEventListener("loadeddata", tryPlayLead);
      v1.removeEventListener("canplay", tryPlayLead);
      cancelAnimationFrame(rafRef.current);
      v0.pause();
      v1.pause();
      v0.muted = true;
      v1.muted = true;
    };
  }, []);

  const videoProps = {
    className:
      "absolute inset-0 h-full w-full origin-center scale-125 object-cover",
    src: VIDEO_SRC,
    autoPlay: false,
    muted: !soundOn,
    playsInline: true,
    preload: "auto" as const,
  };

  return (
    <div className="absolute inset-0 z-0 min-h-screen">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          ref={fadeWrapRef}
          className="absolute inset-0 will-change-[opacity]"
        >
          <div ref={layer0Ref} className="absolute inset-0">
            <video ref={video0Ref} {...videoProps} />
          </div>
          <div ref={layer1Ref} className="absolute inset-0">
            <video ref={video1Ref} {...videoProps} />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-transparent to-bg" />
      </div>
      <button
        type="button"
        onClick={() => setSoundOn((s) => !s)}
        className="absolute bottom-6 right-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-hair bg-card/90 text-ink shadow-sm backdrop-blur-sm transition hover:bg-card"
        aria-label={soundOn ? "Mute video" : "Unmute video"}
      >
        {soundOn ? <VolumeIcon /> : <VolumeMutedIcon />}
      </button>
    </div>
  );
}

function VolumeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5L6 9H3v6h3l5 4V5zM16 9a4 4 0 010 6M19.07 5.93a8 8 0 010 12.14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VolumeMutedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5L6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
