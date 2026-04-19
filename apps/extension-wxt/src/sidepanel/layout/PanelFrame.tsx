import type { ReactNode } from "react";

type PanelFrameProps = {
  children: ReactNode;
};

export function PanelFrame({ children }: PanelFrameProps) {
  return (
    <div className="mx-auto flex h-[min(100vh,800px)] min-h-0 w-full max-w-panel flex-col overflow-hidden bg-mirror-panel px-5 pb-4 pt-0 sm:h-screen sm:max-h-screen">
      {children}
    </div>
  );
}
