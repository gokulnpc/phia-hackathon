"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Card, Eyebrow } from "@/components/mirror/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * GENERATE VIDEO card on the closet detail page.
 *
 * Web client INSERTs a `tryon_video_jobs` row via the user's own
 * Supabase JWT (RLS gates ownership). The `mirror-tryon-video-worker`
 * claims it, calls Gemini Veo, uploads the MP4, and writes the path
 * back to both the job row and `tryon_results.video_storage_path`.
 *
 * The component subscribes to Realtime UPDATEs on the job row AND
 * polls every 4 s as a belt-and-suspenders fallback, so the UI flips to
 * the player within a tick of completion.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "running"; jobId: string }
  | { kind: "ready"; videoUrl: string }
  | { kind: "error"; message: string };

type Props = {
  tryonResultId: string;
  userId: string;
  initialVideoUrl: string | null;
  posterUrl: string | null;
};

const POLL_INTERVAL_MS = 4_000;

function SparkleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v6M12 22v-6M4 12H2M22 12h-2M19 19l-1.4-1.4M6.4 6.4 5 5M19 5l-1.4 1.4M6.4 17.6 5 19" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

export function GenerateVideoCard({
  tryonResultId,
  userId,
  initialVideoUrl,
  posterUrl,
}: Props) {
  const [phase, setPhase] = useState<Phase>(
    initialVideoUrl
      ? { kind: "ready", videoUrl: initialVideoUrl }
      : { kind: "idle" },
  );

  // Held in a ref so the polling effect's dependency array stays small.
  // Phase identity changes wouldn't otherwise trigger re-subscribe, but
  // we never want the poll to multi-fire on re-renders either.
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const finalize = useCallback(
    async (
      videoStoragePath: string,
    ): Promise<{ ok: true; url: string } | { ok: false; message: string }> => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb.storage
        .from("tryon-results")
        .createSignedUrl(videoStoragePath, 3600);
      if (error || !data?.signedUrl) {
        return { ok: false, message: error?.message ?? "Could not sign video URL." };
      }
      return { ok: true, url: data.signedUrl };
    },
    [],
  );

  const checkOnce = useCallback(
    async (jobId: string) => {
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .from("tryon_video_jobs")
        .select("status, video_storage_path, error_code, error_message")
        .eq("id", jobId)
        .maybeSingle();
      if (error) {
        // Transient — let the poll try again.
        return;
      }
      if (!data) return;
      const status = String(data.status ?? "");
      if (status === "completed") {
        const path = data.video_storage_path as string | null;
        if (!path) {
          setPhase({
            kind: "error",
            message: "Worker reported completed but no video path.",
          });
          return;
        }
        const signed = await finalize(path);
        if (signed.ok) setPhase({ kind: "ready", videoUrl: signed.url });
        else setPhase({ kind: "error", message: signed.message });
      } else if (status === "failed" || status === "cancelled") {
        const msg =
          (data.error_message as string | null) ??
          (data.error_code ? `Generation failed (${data.error_code}).` : "Generation failed.");
        setPhase({ kind: "error", message: msg });
      }
    },
    [finalize],
  );

  // Polling + Realtime when running.
  useEffect(() => {
    if (phase.kind !== "running") return;
    const jobId = phase.jobId;
    let cancelled = false;
    const sb = createSupabaseBrowserClient();

    const tick = async () => {
      if (cancelled) return;
      await checkOnce(jobId);
    };
    void tick();
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);

    const channel = sb
      .channel(`tryon-video:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tryon_video_jobs",
          filter: `id=eq.${jobId}`,
        },
        () => {
          // Realtime fires; let `checkOnce` resolve the new state.
          void checkOnce(jobId);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void sb.removeChannel(channel);
    };
  }, [phase, checkOnce]);

  const onGenerate = useCallback(async () => {
    setPhase({ kind: "submitting" });
    const sb = createSupabaseBrowserClient();

    // Reuse an active job if the user already has one in flight (rapid
    // double-click protection). The partial unique index on
    // (tryon_result_id) WHERE status IN ('queued','processing') would
    // otherwise reject the second INSERT.
    const { data: existing } = await sb
      .from("tryon_video_jobs")
      .select("id, status")
      .eq("tryon_result_id", tryonResultId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      setPhase({ kind: "running", jobId: String(existing.id) });
      return;
    }

    const { data, error } = await sb
      .from("tryon_video_jobs")
      .insert({ tryon_result_id: tryonResultId, user_id: userId })
      .select("id")
      .single();
    if (error || !data?.id) {
      setPhase({
        kind: "error",
        message: error?.message ?? "Could not enqueue video job.",
      });
      return;
    }
    setPhase({ kind: "running", jobId: String(data.id) });
  }, [tryonResultId, userId]);

  return (
    <Card>
      <Eyebrow className="mb-2">GENERATE VIDEO</Eyebrow>

      {phase.kind === "ready" ? (
        <>
          <video
            src={phase.videoUrl}
            controls
            playsInline
            preload="metadata"
            poster={posterUrl ?? undefined}
            className="block w-full overflow-hidden rounded-tile bg-ink"
            style={{ aspectRatio: "9/16", maxHeight: 540 }}
          >
            Your browser does not support video playback.
          </video>
          <p className="mt-3 body-sm text-ink2">
            Generated with Gemini Veo 3.1 from this try-on still.
          </p>
        </>
      ) : phase.kind === "running" ? (
        <>
          <p className="body-sm text-ink2">
            Generating short clip with Gemini Veo 3.1 — about a minute.
          </p>
          <div className="mt-3.5">
            <Btn variant="accent" size="sm" disabled>
              <Spinner /> Generating…
            </Btn>
          </div>
        </>
      ) : phase.kind === "submitting" ? (
        <>
          <p className="body-sm text-ink2">Queueing job…</p>
          <div className="mt-3.5">
            <Btn variant="accent" size="sm" disabled>
              <Spinner /> Submitting…
            </Btn>
          </div>
        </>
      ) : phase.kind === "error" ? (
        <>
          <p className="body-sm text-ink2">
            Couldn&rsquo;t generate this clip. {phase.message}
          </p>
          <div className="mt-3.5">
            <Btn variant="accent" size="sm" onClick={() => void onGenerate()}>
              <SparkleIcon /> Retry
            </Btn>
          </div>
        </>
      ) : (
        <>
          <p className="body-sm text-ink2">
            Turn this fit into a short clip — Gemini Veo 3.1, ~1 min.
          </p>
          <div className="mt-3.5">
            <Btn variant="accent" size="sm" onClick={() => void onGenerate()}>
              <SparkleIcon /> Generate video
            </Btn>
          </div>
        </>
      )}
    </Card>
  );
}
