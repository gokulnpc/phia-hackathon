"use client";

import Link from "next/link";
import { MirrorPageHeader } from "./MirrorPageHeader";
import { Card, Eyebrow } from "./primitives";

const ROWS: [string, string][] = [
  ["Silhouette match", "—"],
  ["Color palette", "—"],
  ["Closet overlap", "—"],
  ["Occasion fit", "—"],
  ["Brand affinity", "—"],
];

export function WebFitScoreClient() {
  return (
    <div className="page-enter">
      <MirrorPageHeader
        eyebrow="STYLE"
        leadingTitle="Fit"
        accentWord="score."
        subtitle="Five signals vs your closet — run from a product page in the extension."
      />

      <div className="mx-auto max-w-lg space-y-8 px-6 pb-16 md:px-10">
        <Card>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="display-sm m-0 text-ink">Overall</h2>
            <Eyebrow>LIVE</Eyebrow>
          </div>
          <div className="score-ring">
            <span className="font-display text-[34px] font-normal text-ink3">—</span>
          </div>
          <Eyebrow dot className="text-center">
            CONFIDENCE
          </Eyebrow>
          <p className="meta mt-2 text-center">
            Open the extension on a PDP and tap Check fit to populate this score.
          </p>
        </Card>

        <div>
          <p className="eyebrow mb-3 text-ink3">Breakdown</p>
          <div className="flex flex-col gap-px overflow-hidden rounded-mirror border border-hair bg-hair">
            {ROWS.map(([label, val]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 bg-card px-4 py-3.5"
              >
                <span className="body-sm text-ink2">{label}</span>
                <span className="display-metric text-ink3">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/closet"
            className="inline-flex items-center gap-2 rounded-full border border-ink bg-transparent px-4 py-2.5 text-[13px] font-medium tracking-[0.01em] text-ink transition-colors duration-150 hover:bg-ink hover:text-white"
          >
            My closet
          </Link>
          <Link
            href="/try-on"
            className="inline-flex items-center gap-2 rounded-full border border-hair bg-transparent px-4 py-2.5 text-[13px] font-medium tracking-[0.01em] text-ink2 transition-colors duration-150 hover:border-ink hover:text-ink"
          >
            Try-on
          </Link>
        </div>
      </div>
    </div>
  );
}
