"use client";

import { useMemo, useState } from "react";
import { Avatar, Card, Chip, IconBtn } from "@/components/mirror/primitives";
import { MirrorPageHeader } from "@/components/mirror/MirrorPageHeader";
import {
  DEMO_NOTIFICATIONS,
  type DemoNotifBodyPiece,
  type DemoNotificationRow,
} from "./demoNotifications";

function renderBody(parts: DemoNotifBodyPiece[]) {
  return parts.map((p, i) => {
    if (p.kind === "text") {
      return <span key={i}>{p.text}</span>;
    }
    if (p.kind === "bold") {
      return <b key={i}>{p.text}</b>;
    }
    if (p.kind === "tag") {
      return (
        <span key={i} className={`tag-inline ${p.tag}`}>
          {p.label}
        </span>
      );
    }
    return null;
  });
}

function NotifRow({ n, unread }: { n: DemoNotificationRow; unread: boolean }) {
  return (
    <div className={`notif-row${unread ? " unread" : ""}`}>
      <Avatar letter={n.letter} variant={n.avatarVariant} size="md" />
      <div className="min-w-0">
        <div className="n-text">{renderBody(n.body)}</div>
        <div className="n-time">{n.time}</div>
      </div>
      <IconBtn aria-label="More options" className="shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <circle cx="3.5" cy="7" r="1.25" fill="currentColor" />
          <circle cx="7" cy="7" r="1.25" fill="currentColor" />
          <circle cx="10.5" cy="7" r="1.25" fill="currentColor" />
        </svg>
      </IconBtn>
    </div>
  );
}

export function NotificationsPageClient() {
  const initialUnread = useMemo(
    () => Object.fromEntries(DEMO_NOTIFICATIONS.map((r) => [r.id, r.initialUnread])),
    [],
  );
  const [unreadById, setUnreadById] = useState<Record<string, boolean>>(initialUnread);

  const unreadCount = useMemo(
    () => DEMO_NOTIFICATIONS.reduce((n, r) => n + (unreadById[r.id] ? 1 : 0), 0),
    [unreadById],
  );

  const todayRows = useMemo(
    () => DEMO_NOTIFICATIONS.filter((r) => unreadById[r.id]),
    [unreadById],
  );
  const earlierRows = useMemo(
    () => DEMO_NOTIFICATIONS.filter((r) => !unreadById[r.id]),
    [unreadById],
  );

  const markAllRead = () => {
    setUnreadById(Object.fromEntries(DEMO_NOTIFICATIONS.map((r) => [r.id, false])));
  };

  /** Slight inset from sidebar hairline; modest right inset. */
  const panelX = "pl-4 pr-5 md:pl-8 md:pr-10";

  return (
    <div className="page-enter">
      <header
        className={`sticky top-0 z-10 bg-bg/95 backdrop-blur-md ${panelX} pt-7 md:pt-8`}
      >
        <MirrorPageHeader
          flush
          eyebrow={`${unreadCount} unread`}
          leadingTitle="What's"
          accentWord="new."
          subtitle="Reactions, comments, price drops, and more."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Chip type="button">Filter</Chip>
              <Chip type="button" onClick={markAllRead}>
                Mark all read
              </Chip>
            </div>
          }
        />
      </header>

      <div className={`${panelX} pb-20 pt-6 md:pt-2`}>
        <div className="w-full max-w-[720px]">
          {todayRows.length > 0 ? (
            <>
              <div className="eyebrow mb-2.5">Today</div>
              <Card className="notif-group mb-6" pad="none">
                {todayRows.map((n) => (
                  <NotifRow n={n} key={n.id} unread />
                ))}
              </Card>
            </>
          ) : null}

          {earlierRows.length > 0 ? (
            <>
              <div className="eyebrow mb-2.5">Earlier</div>
              <Card className="notif-group" pad="none">
                {earlierRows.map((n) => (
                  <NotifRow n={n} key={n.id} unread={false} />
                ))}
              </Card>
            </>
          ) : null}

          <p className="footnote">
            Demo preview — sample notifications for layout only. Live in-app notifications connect once the delivery
            pipeline ships.
          </p>
        </div>
      </div>
    </div>
  );
}
