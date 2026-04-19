"use client";

import Link from "next/link";
import { MirrorPageHeader } from "./MirrorPageHeader";
import { Card, Placeholder } from "./primitives";

export function WebTryOnClient() {
  return (
    <div className="page-enter">
      <MirrorPageHeader
        eyebrow="TRY-ON"
        leadingTitle="Virtual"
        accentWord="try-on."
        subtitle="Runs on product pages with the Mirror Chrome extension."
      />

      <div className="mx-auto max-w-5xl px-6 pb-16 md:px-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-mirror border border-hair lg:mx-0 lg:max-w-none">
            <Placeholder
              variant="lav"
              capTop="EXTENSION · PDP"
              caption="YOUR BODY · GARMENT"
              badge="TRY-ON"
              badgeVariant="accent"
              className="absolute inset-0 !rounded-none !border-0"
            />
          </div>

          <Card className="lg:min-w-0">
            <p className="eyebrow text-ink3">How it works</p>
            <ol className="body-sm mt-4 list-decimal space-y-2 pl-5 text-ink2">
              <li>Install Mirror and open any supported product page.</li>
              <li>Confirm reference photos in Settings if you have not already.</li>
              <li>Pick top or bottom, run try-on, then save or share to Feed.</li>
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-transparent bg-ink px-4 py-2.5 text-[13px] font-medium tracking-[0.01em] text-white shadow-mirror-md transition-colors duration-150 hover:bg-black"
              >
                Chrome Web Store
              </a>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-full border border-hair bg-transparent px-4 py-2.5 text-[13px] font-medium tracking-[0.01em] text-ink2 transition-colors duration-150 hover:border-ink hover:text-ink"
              >
                Reference photos
              </Link>
            </div>
          </Card>
        </div>

        <p className="body-sm mt-8 italic text-ink3">
          The web app is a companion: live try-on and PDP detection stay in the extension for v1.
        </p>
      </div>
    </div>
  );
}
