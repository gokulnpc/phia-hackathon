/**
 * Labeled demo-only content for hackathon previews. Never mixed with real DB counts.
 */

export const DEMO_SOCIAL_BANNER =
  "Simulated responses — not from your friends yet";

export const DEMO_PREVIEW_SECTION_TITLE = "Demo preview — how friends might respond";

export type DemoFriend = {
  id: string;
  name: string;
  initial: string;
  avatarClass: string;
};

/** Static personas (no real PII). */
export const DEMO_FRIENDS: DemoFriend[] = [
  {
    id: "maya",
    name: "Maya K.",
    initial: "M",
    avatarClass: "bg-mirror-text text-white",
  },
  {
    id: "jordan",
    name: "Jordan L.",
    initial: "J",
    avatarClass: "bg-mirror-soft text-mirror-text",
  },
  {
    id: "sam",
    name: "Sam R.",
    initial: "S",
    avatarClass: "bg-mirror-bg2 text-mirror-text",
  },
];

export type DemoReaction = { label: string; count: number };

export const DEMO_REACTIONS: DemoReaction[] = [
  { label: "Love it", count: 4 },
  { label: "Looks good", count: 2 },
  { label: "Great fit", count: 2 },
];

export type DemoComment = {
  friendId: string;
  body: string;
};

/** Mix of enthusiasm + practical note (honest demo, not pure hype). */
export const DEMO_COMMENTS: DemoComment[] = [
  {
    friendId: "maya",
    body: "This color is so good on you — I'd wear it.",
  },
  {
    friendId: "jordan",
    body: "If you want it baggier, try one size up; otherwise the cut looks spot on.",
  },
  {
    friendId: "sam",
    body: "Solid pick for everyday — I'd say go for it if the price feels right.",
  },
];

export function friendById(id: string): DemoFriend | undefined {
  return DEMO_FRIENDS.find((f) => f.id === id);
}

/** Show simulated thread when user shared but there are no real comments yet. */
export function shouldShowDemoFriendThread(
  posted: boolean,
  hasRealComments: boolean,
): boolean {
  return posted && !hasRealComments;
}

export const DEMO_FIT_OVERALL = 82;

export type DemoFitRow = { label: string; pct: number };

export const DEMO_FIT_ROWS: DemoFitRow[] = [
  { label: "Silhouette match", pct: 88 },
  { label: "Color harmony", pct: 84 },
  { label: "Occasion fit", pct: 76 },
];
