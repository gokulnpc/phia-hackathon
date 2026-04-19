import { IconCircle, IconGrid, IconHome, IconTryOn, IconWornBy } from "../icons";
import type { SidePanelTab } from "../types";

const navItems: { id: Exclude<SidePanelTab, "fit">; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "tryon", label: "Try-on" },
  { id: "circle", label: "Circle" },
  { id: "wornby", label: "Worn by" },
  { id: "feed", label: "Feed" },
];

type BottomNavProps = {
  active: SidePanelTab;
  onChange: (tab: Exclude<SidePanelTab, "fit">) => void;
};

export function BottomNav({ active, onChange }: BottomNavProps) {
  const current = active === "fit" ? "home" : active;

  return (
    <nav
      className="sticky bottom-0 mt-4 flex shrink-0 justify-between rounded-full border border-mirror-border bg-mirror-card p-1.5 shadow-tabbar"
      aria-label="Primary"
    >
      {navItems.map((item) => {
        const isActive = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-full px-1 py-2.5 text-[10px] font-medium transition-colors duration-[180ms] ${
              isActive ? "bg-mirror-text text-white" : "bg-transparent text-mirror-muted"
            }`}
          >
            {item.id === "home" ? <IconHome /> : null}
            {item.id === "tryon" ? <IconTryOn /> : null}
            {item.id === "circle" ? <IconCircle /> : null}
            {item.id === "wornby" ? <IconWornBy /> : null}
            {item.id === "feed" ? <IconGrid /> : null}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
