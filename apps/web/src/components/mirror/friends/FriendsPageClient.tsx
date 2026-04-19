"use client";

import { useMemo, useState } from "react";
import {
  Avatar,
  Card,
  Chip,
  Eyebrow,
  Tab,
  Tabs,
} from "@/components/mirror/primitives";
import type { AccentVariant } from "@/components/mirror/primitives";

type FriendsTab = "following" | "followers" | "close";

type FriendSeed = {
  id: string;
  name: string;
  handle: string;
  letter: string;
  variant: AccentVariant | "lavender";
  followers: number;
  posts: number;
  close: boolean;
};

type SuggestedSeed = {
  id: string;
  name: string;
  handle: string;
  tag: string;
  letter: string;
  variant: AccentVariant | "lavender";
};

/** Mirrors `FRIENDS_FOLLOWING` in apps/frontend_model/phia_web/src/data.jsx */
const MOCK_FRIENDS: FriendSeed[] = [
  {
    id: "jr",
    name: "Jordan Rivera",
    handle: "@jordanr",
    letter: "J",
    variant: "sage",
    followers: 1204,
    posts: 213,
    close: false,
  },
  {
    id: "rt",
    name: "Rachel Torres",
    handle: "@racheltorres",
    letter: "R",
    variant: "peach",
    followers: 567,
    posts: 42,
    close: true,
  },
  {
    id: "lp",
    name: "Lena Park",
    handle: "@lenapark",
    letter: "L",
    variant: "lavender",
    followers: 189,
    posts: 67,
    close: true,
  },
  {
    id: "am",
    name: "Ava Mitchell",
    handle: "@avamit",
    letter: "A",
    variant: "butter",
    followers: 2341,
    posts: 156,
    close: false,
  },
  {
    id: "sk",
    name: "Sarah Kim",
    handle: "@sarahk",
    letter: "S",
    variant: "sky",
    followers: 834,
    posts: 98,
    close: false,
  },
  {
    id: "ev",
    name: "Elena Vasquez",
    handle: "@elenav",
    letter: "E",
    variant: "rose",
    followers: 421,
    posts: 31,
    close: false,
  },
];

/** Mirrors `FRIENDS_SUGGESTED` in phia_web data.jsx */
const MOCK_SUGGESTED: SuggestedSeed[] = [
  {
    id: "no",
    name: "Nina Okafor",
    handle: "@ninao",
    tag: "Scandi Mini",
    letter: "N",
    variant: "lavender",
  },
  {
    id: "ev2",
    name: "Ella Voss",
    handle: "@ellavoss",
    tag: "Quiet Luxe",
    letter: "E",
    variant: "sky",
  },
  {
    id: "mz",
    name: "Mia Zhang",
    handle: "@miaz",
    tag: "Effortless Core",
    letter: "M",
    variant: "peach",
  },
];

const FOLLOWERS_TAB_COUNT = 124;
const CLOSE_MAX = 30;

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function matchesSearch(f: FriendSeed, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    f.name.toLowerCase().includes(s) ||
    f.handle.toLowerCase().includes(s) ||
    s.includes("@") && f.handle.toLowerCase().includes(s.replace("@", ""))
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FriendListRow({
  f,
  isClose,
  isFollowing,
  onToggleClose,
  onToggleFollow,
}: {
  f: FriendSeed;
  isClose: boolean;
  isFollowing: boolean;
  onToggleClose: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <div
      className="grid grid-cols-[56px_1fr_auto] items-center gap-3.5 border-t border-hair py-3.5 first:border-t-0 first:pt-0"
    >
      <Avatar letter={f.letter} variant={f.variant} size="lg" />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
          <span>{f.name}</span>
          {isClose ? (
            <span className="rounded-full bg-butter-soft px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-[#8a6f1b]">
              Close
            </span>
          ) : null}
        </div>
        <div className="text-[11.5px] text-ink3">{f.handle}</div>
        <div className="mt-[3px] text-[11px] text-ink3">
          {formatCount(f.followers)} followers · {f.posts} posts
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Chip type="button" active={false} onClick={onToggleClose}>
          {isClose ? "✓ Close Friend" : "+ Close Friend"}
        </Chip>
        <Chip type="button" active={isFollowing} onClick={onToggleFollow}>
          {isFollowing ? "Following" : "Follow"}
        </Chip>
      </div>
    </div>
  );
}

export function FriendsPageClient() {
  const [tab, setTab] = useState<FriendsTab>("following");
  const [query, setQuery] = useState("");
  const [closeById, setCloseById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MOCK_FRIENDS.map((f) => [f.id, f.close])),
  );
  const [followingById, setFollowingById] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MOCK_FRIENDS.map((f) => [f.id, true])),
  );
  const closeCount = useMemo(
    () => MOCK_FRIENDS.filter((f) => closeById[f.id]).length,
    [closeById],
  );

  const baseList = useMemo(() => {
    if (tab === "close") {
      return MOCK_FRIENDS.filter((f) => closeById[f.id]);
    }
    return MOCK_FRIENDS;
  }, [tab, closeById]);

  const filtered = useMemo(
    () => baseList.filter((f) => matchesSearch(f, query)),
    [baseList, query],
  );

  function toggleClose(id: string) {
    setCloseById((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleFollow(id: string) {
    setFollowingById((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="page-enter px-5 py-7 md:px-10 md:pb-[60px] md:pt-7">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-6 border-b border-hair pb-[22px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Eyebrow dot className="mb-0">
            YOUR CIRCLE
          </Eyebrow>
          <h1 className="display-lg m-0 max-w-[680px] pb-0.5 text-ink">
            People in your{" "}
            <span className="ital text-accent">orbit.</span>
          </h1>
          <p className="body-sm m-0 text-ink3">
            Close friends see your fits first.
          </p>
        </div>
        <Tabs>
          <Tab
            active={tab === "following"}
            count={MOCK_FRIENDS.length}
            onClick={() => setTab("following")}
          >
            Following
          </Tab>
          <Tab
            active={tab === "followers"}
            count={FOLLOWERS_TAB_COUNT}
            onClick={() => setTab("followers")}
          >
            Followers
          </Tab>
          <Tab
            active={tab === "close"}
            count={`${closeCount}/${CLOSE_MAX}`}
            onClick={() => setTab("close")}
          >
            Close Friends
          </Tab>
        </Tabs>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-[420px] flex-1 items-center gap-2.5 rounded-full border border-hair bg-card px-4 py-2.5 transition-colors focus-within:border-ink">
          <SearchGlyph className="shrink-0 text-ink2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or email…"
            className="w-full border-0 bg-transparent font-sans text-[13.5px] text-ink outline-none placeholder:text-ink3"
            aria-label="Search circle"
          />
        </div>
        <div className="meta shrink-0">{filtered.length} people</div>
      </div>

      <Card pad="lg" className="mb-7">
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <div className="display-md text-ink">
              No match <span className="ital text-accent">here.</span>
            </div>
            <p className="meta mt-1.5">Try a different search term.</p>
          </div>
        ) : (
          filtered.map((f) => (
            <FriendListRow
              key={f.id}
              f={f}
              isClose={closeById[f.id] ?? false}
              isFollowing={followingById[f.id] ?? false}
              onToggleClose={() => toggleClose(f.id)}
              onToggleFollow={() => toggleFollow(f.id)}
            />
          ))
        )}
      </Card>

      <section className="mt-7">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <Eyebrow dot className="mb-0">
              SUGGESTED
            </Eyebrow>
            <h2 className="display-md mt-1 text-ink">
              Style people to <span className="ital text-accent">follow.</span>
            </h2>
            <p className="meta mt-1">Based on your aesthetic preferences.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {MOCK_SUGGESTED.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-[12px] border border-hair bg-card p-4"
            >
              <Avatar letter={s.letter} variant={s.variant} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-ink">{s.name}</div>
                <div className="meta">
                  {s.handle} · <span className="text-ink3">{s.tag}</span>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-transparent bg-ink px-3 py-[7px] text-[12px] font-medium text-white transition-colors hover:bg-black"
              >
                Follow
              </button>
            </div>
          ))}
        </div>
      </section>

      <p className="footnote mt-6 border-t border-hair pt-5 text-[12px] italic text-ink3">
        Friend graph and invites sync for real accounts in a later release.
        Demo data shown for layout only.
      </p>
    </div>
  );
}
