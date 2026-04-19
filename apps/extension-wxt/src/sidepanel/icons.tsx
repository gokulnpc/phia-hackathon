import type { SVGProps } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path {...stroke} d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function IconUser(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <circle {...stroke} cx={12} cy={8} r={4} />
      <path {...stroke} d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconBack(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="M12 2 2 12h3v8h6v-6h2v6h6v-8h3z" />
    </svg>
  );
}

export function IconTryOn(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <rect {...stroke} x={3} y={3} width={18} height={18} rx={4} />
      <circle {...stroke} cx={12} cy={10} r={3} />
      <path {...stroke} d="M6 20c1.5-3 4-4 6-4s4.5 1 6 4" />
    </svg>
  );
}

export function IconCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <circle {...stroke} cx={9} cy={8} r={4} />
      <path {...stroke} d="M17 11a3 3 0 1 0 0-6" />
      <path {...stroke} d="M3 21c0-3 3-5 6-5s6 2 6 5" />
      <path {...stroke} d="M22 21c0-2.5-2-4.3-5-4.8" />
    </svg>
  );
}

export function IconGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <rect {...stroke} x={3} y={3} width={7} height={7} />
      <rect {...stroke} x={14} y={3} width={7} height={7} />
      <rect {...stroke} x={3} y={14} width={7} height={7} />
      <rect {...stroke} x={14} y={14} width={7} height={7} />
    </svg>
  );
}

export function IconWornBy(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle {...stroke} cx={12} cy={12} r={3} />
    </svg>
  );
}

export function IconTrendDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden {...props}>
      <path {...stroke} strokeWidth={2.5} d="M7 17 L17 7 M17 17 V7 H7" />
    </svg>
  );
}

export function IconSparkleOutline(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden {...props}>
      <path
        {...stroke}
        d="M12 2v6M12 22v-6M4 12H2M22 12h-2M19 19l-1.4-1.4M6.4 6.4 5 5M19 5l-1.4 1.4M6.4 17.6 5 19"
      />
      <circle {...stroke} cx={12} cy={12} r={4} />
    </svg>
  );
}

export function IconMessage(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden {...props}>
      <path {...stroke} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconHeart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden {...props}>
      <path
        {...stroke}
        d="M12 20.5s-7-4.35-9.5-8.29C.89 9.66 2.06 6 5.52 6c2.16 0 3.57 1.23 4.31 2.33C10.56 7.23 11.97 6 14.13 6c3.46 0 4.63 3.66 3.02 6.21C19 16.15 12 20.5 12 20.5Z"
      />
    </svg>
  );
}

export function IconShare(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden {...props}>
      <path {...stroke} d="M12 16V4" />
      <path {...stroke} d="m7 9 5-5 5 5" />
      <path {...stroke} d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export function IconDotsHorizontal(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden fill="currentColor" {...props}>
      <circle cx={5} cy={12} r={1.6} />
      <circle cx={12} cy={12} r={1.6} />
      <circle cx={19} cy={12} r={1.6} />
    </svg>
  );
}

export function IconBookmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden {...props}>
      <path
        {...stroke}
        d="M6 4h12a2 2 0 0 1 2 2v16l-8-4-8 4V6a2 2 0 0 1 2-2z"
      />
    </svg>
  );
}

export function IconStar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden {...props}>
      <path
        {...stroke}
        d="m12 2 3 7 7 .6-5.3 4.7 1.6 7L12 17.8 5.7 21.3l1.6-7L2 9.6 9 9z"
      />
    </svg>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden {...props}>
      <path {...stroke} strokeWidth={2.5} d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconCamera(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path
        {...stroke}
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
      />
      <circle {...stroke} cx={12} cy={13} r={4} />
    </svg>
  );
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline {...stroke} points="17 8 12 3 7 8" />
      <line {...stroke} x1={12} y1={3} x2={12} y2={15} />
    </svg>
  );
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden {...props}>
      <path {...stroke} d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <circle {...stroke} cx={12} cy={12} r={10} />
      <line {...stroke} x1={12} y1={16} x2={12} y2={12} />
      <line {...stroke} x1={12} y1={8} x2={12.01} y2={8} />
    </svg>
  );
}

export function IconLayers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <path {...stroke} d="M12 2 2 7l10 5 10-5-10-5z" />
      <path {...stroke} d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

export function SparkleFilled(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22} aria-hidden {...props}>
      <path d="m12 2 2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />
    </svg>
  );
}

export function IconHelpCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden {...props}>
      <circle {...stroke} cx={12} cy={12} r={10} />
      <path {...stroke} d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line {...stroke} x1={12} y1={17} x2={12.01} y2={17} />
    </svg>
  );
}

export function IconMail(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden {...props}>
      <path {...stroke} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline {...stroke} points="22,6 12,13 2,6" />
    </svg>
  );
}

export function IconLock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden {...props}>
      <rect {...stroke} x={3} y={11} width={18} height={11} rx={2} />
      <path {...stroke} d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden {...props}>
      <path {...stroke} d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle {...stroke} cx={12} cy={12} r={3} />
    </svg>
  );
}

export function IconEyeOff(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden {...props}>
      <path {...stroke} d="M10.733 5.076A10.744 10.744 0 0 1 12 5c7 0 10 7 10 7a13.165 13.165 0 0 1-1.555 2.665" />
      <path {...stroke} d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path {...stroke} d="M6.61 6.611A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.611" />
      <line {...stroke} x1={2} y1={2} x2={22} y2={22} />
    </svg>
  );
}

export function IconGoogle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function IconApple(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden fill="currentColor" {...props}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden {...props}>
      <path {...stroke} strokeWidth={2.5} d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
