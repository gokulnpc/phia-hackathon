/** Inline SVGs from files/mirror-app.html sidebar nav */

export function IconTryOn({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 20c1.5-3 4-4 6-4s4.5 1 6 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M17 11a3 3 0 1 0 0-6M3 21c0-3 3-5 6-5s6 2 6 5M22 21c0-2.5-2-4.3-5-4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconFit({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconFeed({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1" y="1" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="1" width="7" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="10" width="7" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="7" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconCloset({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 2h12a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 2v14M6 6h0M12 6h0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconFriends({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 16c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M13 7a2.5 2.5 0 100-5M15 16c0-2.5-1.2-4-3-4.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconNotifications({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M13.5 6.5a4.5 4.5 0 10-9 0c0 5-2 6.5-2 6.5h13s-2-1.5-2-6.5z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M7.18 15a2 2 0 003.64 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1v2M9 15v2M1 9h2M15 9h2M3.34 3.34l1.42 1.42M13.24 13.24l1.42 1.42M14.66 3.34l-1.42 1.42M4.76 13.24l-1.42 1.42"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
