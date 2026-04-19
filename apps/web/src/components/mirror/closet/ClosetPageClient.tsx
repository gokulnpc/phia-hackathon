"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteClosetItem } from "@/app/(app)/closet/actions";
import { MirrorConfirmDialog } from "@/components/mirror/MirrorConfirmDialog";
import { MirrorPageHeader } from "@/components/mirror/MirrorPageHeader";
import {
  Chip,
  SearchPill,
  Tab,
  Tabs,
} from "@/components/mirror/primitives";

export type ClosetItemDTO = {
  id: string;
  source: "tried" | "wishlist" | "owned";
  name: string;
  brand: string;
  category: "top" | "bottom";
  thumbUrl: string | null;
  confidenceLabel: string;
  priceLabel: string | null;
  generatedAt: string;
};

type ClosetTab = "all" | "tried" | "owned" | "wishlist";
type CategoryChip = "all" | "top" | "bottom";

const CATEGORY_CHIPS: { id: CategoryChip; label: string }[] = [
  { id: "all", label: "All Categories" },
  { id: "top", label: "Tops" },
  { id: "bottom", label: "Bottoms" },
];

function matchesCategory(item: ClosetItemDTO, chip: CategoryChip): boolean {
  if (chip === "all") return true;
  return item.category === chip;
}

function matchesSearch(item: ClosetItemDTO, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    item.name.toLowerCase().includes(s) || item.brand.toLowerCase().includes(s)
  );
}

function sortByDateDesc(a: ClosetItemDTO, b: ClosetItemDTO): number {
  const ta = new Date(a.generatedAt).getTime();
  const tb = new Date(b.generatedAt).getTime();
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
}

function statusStripLabel(source: ClosetItemDTO["source"]): string {
  if (source === "tried") return "Tried";
  if (source === "wishlist") return "Saved";
  return "Owned";
}

function statusStripTextClass(source: ClosetItemDTO["source"]): string {
  if (source === "tried") return "text-peach";
  if (source === "wishlist") return "text-sage";
  return "text-ink2";
}

function categoryStripLabel(category: ClosetItemDTO["category"]): string {
  return category === "top" ? "Tops" : "Bottoms";
}

function placeholderClass(source: ClosetItemDTO["source"]): string {
  if (source === "wishlist") return "ph-lav";
  if (source === "owned") return "ph-sage";
  return "ph-peach";
}

/** Omit placeholder dashes when there is no real fit score. */
function displayScore(label: string): string | null {
  const s = label.trim();
  if (!s || s === "—" || s === "-") return null;
  return s;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </svg>
  );
}

export function ClosetPageClient({
  triedItems,
  wishlistItems,
  ownedItems,
}: {
  triedItems: ClosetItemDTO[];
  wishlistItems: ClosetItemDTO[];
  ownedItems: ClosetItemDTO[];
}) {
  const router = useRouter();
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [tab, setTab] = useState<ClosetTab>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryChip>("all");
  const [pendingDelete, setPendingDelete] = useState<ClosetItemDTO | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const allItems = useMemo(() => {
    const merged = [...triedItems, ...wishlistItems, ...ownedItems];
    merged.sort(sortByDateDesc);
    return merged;
  }, [triedItems, wishlistItems, ownedItems]);

  const allCount = allItems.length;

  const filterItems = (items: ClosetItemDTO[]) =>
    items.filter(
      (it) => matchesSearch(it, search) && matchesCategory(it, category),
    );

  const filteredAll = useMemo(() => filterItems(allItems), [allItems, search, category]);
  const filteredTried = useMemo(() => filterItems(triedItems), [triedItems, search, category]);
  const filteredWishlist = useMemo(() => filterItems(wishlistItems), [wishlistItems, search, category]);
  const filteredOwned = useMemo(() => filterItems(ownedItems), [ownedItems, search, category]);

  const gridItems =
    tab === "all"
      ? filteredAll
      : tab === "tried"
        ? filteredTried
        : tab === "wishlist"
          ? filteredWishlist
          : filteredOwned;

  const handleDeleteItem = (it: ClosetItemDTO, e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setPendingDelete(it);
  };

  const deleteDescription =
    pendingDelete?.source === "tried"
      ? "This removes the try-on from My Closet. You can run a new try-on from a product page anytime."
      : pendingDelete?.source === "owned"
        ? "This removes the owned item from My Closet. You can mark it again from the extension on the product page."
        : pendingDelete
          ? "This removes the saved item from My Closet. You can save it again from the extension."
          : "";

  const confirmDelete = (): void => {
    if (!pendingDelete) return;
    const it = pendingDelete;
    setDeleteSubmitting(true);
    void (async () => {
      try {
        const res = await deleteClosetItem(it.source, it.id);
        if (!res.ok) {
          setDeleteError(res.error);
          setPendingDelete(null);
          return;
        }
        setPendingDelete(null);
        router.refresh();
      } finally {
        setDeleteSubmitting(false);
      }
    })();
  };

  return (
    <div className="page-enter">
      <MirrorConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Remove from closet?"
        description={deleteDescription}
        pending={deleteSubmitting}
        onConfirm={confirmDelete}
      />

      <MirrorPageHeader
        eyebrow={`${allCount} ${allCount === 1 ? "PIECE" : "PIECES"}`}
        leadingTitle="My"
        accentWord="closet."
        subtitle="Everything you've tried, saved, or own."
        right={
          <Tabs>
            <Tab active={tab === "all"} count={allCount} onClick={() => setTab("all")}>
              All
            </Tab>
            <Tab
              active={tab === "tried"}
              count={triedItems.length}
              onClick={() => setTab("tried")}
            >
              Tried On
            </Tab>
            <Tab
              active={tab === "owned"}
              count={ownedItems.length}
              onClick={() => setTab("owned")}
            >
              Owned
            </Tab>
            <Tab
              active={tab === "wishlist"}
              count={wishlistItems.length}
              onClick={() => setTab("wishlist")}
            >
              Saved
            </Tab>
          </Tabs>
        }
      />

      <div className="px-6 pb-16 md:px-10">
        {deleteError ? (
          <div
            className="mb-4 flex items-start justify-between gap-3 rounded-mirror border border-danger/30 bg-rose-soft px-4 py-3"
            role="alert"
          >
            <p className="text-sm font-medium text-danger">{deleteError}</p>
            <button
              type="button"
              onClick={() => setDeleteError(null)}
              className="shrink-0 rounded-full border border-hair bg-card px-3 py-1 text-xs font-medium text-ink2 hover:border-ink hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* filter bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <SearchPill
            value={search}
            onChange={setSearch}
            placeholder="Search closet…"
            className="max-w-[360px] flex-1"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_CHIPS.map((c) => (
              <Chip
                key={c.id}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </Chip>
            ))}
          </div>
          <span className="meta ml-auto hidden sm:inline">
            {gridItems.length} item{gridItems.length === 1 ? "" : "s"}
          </span>
        </div>

        {gridItems.length === 0 ? (
          <div
            className="rounded-mirror border border-hair bg-card px-6 py-16 text-center"
            style={{ borderStyle: "dashed", borderWidth: "1.5px" }}
            role="status"
          >
            {allCount === 0 ? (
              <>
                <div className="display-md text-ink">
                  Nothing{" "}
                  <span className="ital" style={{ color: "var(--accent)" }}>
                    here yet.
                  </span>
                </div>
                <p className="meta mx-auto mt-2 max-w-md">
                  Save products from the Mirror extension or run a try-on on a
                  store page. Saved items and try-ons show up here.
                </p>
              </>
            ) : (
              <>
                <div className="display-md text-ink">
                  No{" "}
                  <span className="ital" style={{ color: "var(--accent)" }}>
                    matches.
                  </span>
                </div>
                <p className="meta mx-auto mt-2 max-w-md">
                  No items match your search or category filters. Try clearing
                  filters or adjusting your search.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {gridItems.map((it) => {
              const scoreText = displayScore(it.confidenceLabel);
              return (
              <li key={`${it.source}-${it.id}`} className="min-w-0">
                <article className="group relative flex h-full min-h-0 flex-col overflow-hidden rounded-mirror border border-hair bg-card transition-all hover:-translate-y-0.5 hover:border-ink">
                  <Link
                    href={`/closet/${it.source}/${it.id}`}
                    className="absolute inset-0 z-[1]"
                    aria-label={`View details for ${it.name}`}
                  >
                    <span className="sr-only">View details</span>
                  </Link>
                  <div className="pointer-events-none relative z-[2] flex h-full min-h-0 flex-col">
                    <div className="relative aspect-[4/5] w-full shrink-0 overflow-hidden border-b border-hair">
                      <div className="flex h-full w-full flex-col">
                        <div
                          className={`mono-tag flex shrink-0 items-center justify-center border-b border-hair bg-white/90 px-2.5 py-1.5 text-[9.5px] leading-none tracking-[0.12em] ${statusStripTextClass(
                            it.source,
                          )}`}
                        >
                          {statusStripLabel(it.source)}
                        </div>
                        <div className="group/image relative min-h-0 flex-1">
                          {it.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.thumbUrl}
                              alt=""
                              className="absolute inset-0 z-0 h-full w-full object-cover object-top"
                            />
                          ) : (
                            <div
                              className={`ph absolute inset-0 !rounded-none !border-0 ${placeholderClass(
                                it.source,
                              )}`}
                            />
                          )}
                          <button
                            type="button"
                            disabled={deleteSubmitting}
                            onClick={(e) => handleDeleteItem(it, e)}
                            className="pointer-events-auto absolute right-2 top-2 z-[20] grid h-8 w-8 place-items-center rounded-full border border-hair bg-card text-ink2 opacity-0 shadow-sm transition-opacity hover:border-ink hover:text-ink group-hover/image:opacity-100 disabled:pointer-events-none disabled:opacity-40"
                            aria-label={`Remove ${it.name} from closet`}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        <div className="mono-tag flex shrink-0 items-center justify-center border-t border-hair bg-white/90 px-2.5 py-1.5 text-[9.5px] leading-none tracking-[0.12em] text-ink2">
                          {categoryStripLabel(it.category)}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-3">
                      <div className="line-clamp-2 min-h-[2.6rem] text-[13px] font-medium leading-snug text-ink">
                        {it.name}
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <div className="min-w-0 truncate text-[11.5px] text-ink3">
                          {it.brand}
                        </div>
                        {scoreText ? (
                          <div className="shrink-0 text-[11.5px] tabular-nums text-ink3">
                            {scoreText}
                          </div>
                        ) : null}
                      </div>
                      {it.priceLabel?.trim() ? (
                        <div className="mt-auto pt-2.5 text-[11.5px] text-ink2">
                          {it.priceLabel}
                        </div>
                      ) : (
                        <div className="mt-auto shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                </article>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
