"use client";

import type { AccentVariant } from "@/components/mirror/primitives";

/** Inline notification tags — maps to `.tag-inline.{variant}` in globals.css */
export type DemoNotifInlineTag = "fire" | "price" | "heart" | "comment";

export type DemoNotifBodyPiece =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "tag"; tag: DemoNotifInlineTag; label: string };

export type DemoNotificationRow = {
  id: string;
  letter: string;
  avatarVariant: AccentVariant;
  body: DemoNotifBodyPiece[];
  time: string;
  initialUnread: boolean;
};

/** Mirrors `NOTIFICATIONS_UNREAD` + `NOTIFICATIONS_EARLIER` in phia_web `data.jsx`. */
export const DEMO_NOTIFICATIONS: DemoNotificationRow[] = [
  {
    id: "n1",
    letter: "S",
    avatarVariant: "sky",
    initialUnread: true,
    time: "12 MIN AGO",
    body: [
      { kind: "bold", text: "Sarah Kim" },
      { kind: "text", text: " reacted " },
      { kind: "tag", tag: "fire", label: "FIRE" },
      { kind: "text", text: " to your Everlane trousers try-on." },
    ],
  },
  {
    id: "n2",
    letter: "J",
    avatarVariant: "sage",
    initialUnread: true,
    time: "35 MIN AGO",
    body: [
      { kind: "bold", text: "Jordan Rivera" },
      { kind: "text", text: " commented " },
      { kind: "tag", tag: "comment", label: "“PERFECT ON YOU”" },
      { kind: "text", text: " on your fit." },
    ],
  },
  {
    id: "n3",
    letter: "E",
    avatarVariant: "butter",
    initialUnread: true,
    time: "2 H AGO",
    body: [
      { kind: "tag", tag: "price", label: "PRICE DROP" },
      { kind: "text", text: " Eileen Fisher Blazer is now " },
      { kind: "bold", text: "$38 cheaper" },
      { kind: "text", text: " on ThredUp." },
    ],
  },
  {
    id: "n4",
    letter: "L",
    avatarVariant: "lavender",
    initialUnread: false,
    time: "5 H AGO",
    body: [
      { kind: "bold", text: "Lena Park" },
      { kind: "text", text: " started following you." },
    ],
  },
  {
    id: "n5",
    letter: "R",
    avatarVariant: "peach",
    initialUnread: false,
    time: "1 D AGO",
    body: [
      { kind: "bold", text: "Rachel Torres" },
      { kind: "text", text: " tried on an item from your closet via " },
      { kind: "tag", tag: "heart", label: "REMIX" },
      { kind: "text", text: "." },
    ],
  },
  {
    id: "n6",
    letter: "W",
    avatarVariant: "rose",
    initialUnread: false,
    time: "2 D AGO",
    body: [
      {
        kind: "text",
        text: "Weekly digest — 4 friends posted 12 new fits this week. Your most-",
      },
      { kind: "tag", tag: "fire", label: "FIRED" },
      { kind: "text", text: ": COS Wool Coat (31 reactions)." },
    ],
  },
];

/** Static demo badge for sidebar — initial unread count. */
export const NOTIFICATIONS_NAV_BADGE = DEMO_NOTIFICATIONS.filter((r) => r.initialUnread).length;
