"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCircle,
  IconCloset,
  IconFeed,
  IconFit,
  IconNotifications,
  IconSettings,
  IconTryOn,
} from "./nav-icons";
import { Avatar, pickAvatarVariant } from "./primitives";
import { NOTIFICATIONS_NAV_BADGE } from "./notifications/demoNotifications";

function NavLink({
  href,
  icon,
  children,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: number;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/feed" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`relative flex w-full items-center gap-3 rounded-mirror-sm px-2.5 py-2.5 text-[13.5px] transition-colors ${
        active
          ? "bg-ink text-white"
          : "text-ink2 hover:bg-[color-mix(in_oklch,var(--bg)_92%,var(--ink))] hover:text-ink"
      }`}
    >
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
        {icon}
      </span>
      <span className="hidden md:inline">{children}</span>
      {badge != null && badge > 0 ? (
        <span
          className={`ml-auto hidden min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-center text-[11px] font-medium md:inline-flex ${
            active
              ? "bg-white/[0.18] text-white"
              : "bg-peach-soft text-peach"
          }`}
        >
          {badge}
        </span>
      ) : null}
      {badge != null && badge > 0 ? (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full md:hidden"
          style={{ background: "var(--accent)" }}
        />
      ) : null}
    </Link>
  );
}

function profileInitial(email: string): string {
  const local = email.split("@")[0] ?? "?";
  return local.slice(0, 1).toUpperCase() || "?";
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3">
      <div className="hidden px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink3 md:block">
        {label}
      </div>
      <div className="md:hidden h-2" aria-hidden />
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function MirrorSidebar({ userEmail }: { userEmail: string }) {
  const handle = userEmail.includes("@")
    ? `@${userEmail.split("@")[0]}`
    : "@you";
  const display = userEmail.includes("@")
    ? userEmail.split("@")[0]
    : "Account";
  const variant = pickAvatarVariant(userEmail || "you");

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-16 flex-col border-r border-hair bg-bg px-2.5 py-5 md:w-[260px] md:px-[18px] md:py-[22px]">
      {/* wordmark */}
      <Link
        href="/feed"
        className="flex items-baseline gap-1.5 px-2 pb-4 pt-1.5 italic"
        style={{
          fontFamily: "var(--font-instrument), ui-serif, Georgia, serif",
          fontSize: "28px",
          letterSpacing: "-0.01em",
        }}
      >
        <span className="hidden md:inline">mirror</span>
        <span className="md:hidden">m</span>
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--accent)", transform: "translateY(-4px)" }}
          aria-hidden
        />
      </Link>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        <NavGroup label="Main">
          <NavLink href="/feed" icon={<IconFeed />}>
            Feed
          </NavLink>
          <NavLink href="/closet" icon={<IconCloset />}>
            Closet
          </NavLink>
          <NavLink href="/circle" icon={<IconCircle />}>
            Circle
          </NavLink>
          <NavLink href="/fit" icon={<IconFit />}>
            Fit score
          </NavLink>
          <NavLink href="/try-on" icon={<IconTryOn />}>
            Try-on
          </NavLink>
        </NavGroup>

        <NavGroup label="Activity">
          <NavLink
            href="/notifications"
            icon={<IconNotifications />}
            badge={NOTIFICATIONS_NAV_BADGE}
          >
            Notifications
          </NavLink>
        </NavGroup>

        <NavGroup label="Account">
          <NavLink href="/settings" icon={<IconSettings />}>
            Settings
          </NavLink>
        </NavGroup>
      </nav>

      <Link
        href="/settings"
        className="mt-auto flex items-center gap-3 border-t border-hair px-2.5 py-3 transition-colors hover:bg-[color-mix(in_oklch,var(--bg)_92%,var(--ink))]"
      >
        <Avatar letter={profileInitial(userEmail)} variant={variant} size="md" />
        <div className="hidden min-w-0 flex-1 leading-tight md:block">
          <div className="truncate text-[13px] font-medium text-ink">
            {display}
          </div>
          <div className="truncate text-[11px] text-ink3">{handle}</div>
        </div>
      </Link>
    </aside>
  );
}
