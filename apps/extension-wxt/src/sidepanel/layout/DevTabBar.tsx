import type { SidePanelTab } from "../types";

type DevTabBarProps = {
  active: SidePanelTab;
  onChange: (tab: SidePanelTab) => void;
};

const tabs: { id: SidePanelTab; label: string }[] = [
  { id: "home", label: "Confidence" },
  { id: "tryon", label: "Try-On" },
  { id: "circle", label: "Circle" },
  { id: "fit", label: "Fit Score" },
  { id: "feed", label: "Feed" },
];

export function DevTabBar({ active, onChange }: DevTabBarProps) {
  return (
    <div
      className="mb-3 flex max-w-[420px] flex-wrap justify-center gap-1 rounded-full border border-[#333] bg-[#262626] p-1.5"
      role="tablist"
      aria-label="Dev screens"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
            active === t.id ? "bg-mirror-panel text-mirror-text" : "bg-transparent text-[#bbb]"
          }`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
