import { IconBack, IconBell, IconClose, IconUser } from "../icons";

type AppHeaderProps =
  | {
      variant: "home";
      onNotifications?: () => void;
      onProfile?: () => void;
      onClose?: () => void;
    }
  | {
      variant: "sub";
      onBack: () => void;
      onClose?: () => void;
    };

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-mirror-border bg-transparent text-mirror-ink2 transition-colors hover:bg-mirror-text/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AppHeader(props: AppHeaderProps) {
  const wordmark = (
    <div className="flex items-center font-display text-[26px] font-normal italic leading-none tracking-tight text-mirror-text">
      mirror
      <span
        className="relative ml-[3px] mb-[6px] inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-mirror-accent"
        aria-hidden
      />
    </div>
  );

  if (props.variant === "home") {
    return (
      <header className="relative flex shrink-0 items-center justify-between px-5 pb-[14px] pt-[18px]">
        {wordmark}
        <div className="flex gap-2">
          <IconBtn label="Notifications" onClick={props.onNotifications}>
            <IconBell />
          </IconBtn>
          <IconBtn label="Profile" onClick={props.onProfile}>
            <IconUser />
          </IconBtn>
          <IconBtn label="Close" onClick={props.onClose}>
            <IconClose />
          </IconBtn>
        </div>
      </header>
    );
  }

  return (
    <header className="relative flex shrink-0 items-center justify-between px-5 pb-[14px] pt-[18px]">
      <IconBtn label="Back" onClick={props.onBack}>
        <IconBack />
      </IconBtn>
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
        {wordmark}
      </div>
      <IconBtn label="Close" onClick={props.onClose}>
        <IconClose />
      </IconBtn>
    </header>
  );
}
