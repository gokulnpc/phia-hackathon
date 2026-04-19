import { useState } from "react";
import { getMirrorWebBase, openMirrorWebPath } from "../../lib/openWeb";
import {
  IconApple,
  IconArrowRight,
  IconClose,
  IconEye,
  IconEyeOff,
  IconGoogle,
  IconHelpCircle,
  IconLock,
  IconMail,
} from "../icons";

type SignInViewProps = {
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
  signingIn: boolean;
  onClose?: () => void;
};

export function SignInView({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  error,
  signingIn,
  onClose,
}: SignInViewProps) {
  const [showPassword, setShowPassword] = useState(false);
  const canOpenWeb = Boolean(getMirrorWebBase());

  const openLogin = () => openMirrorWebPath("/login");
  const openSignup = () => openMirrorWebPath("/signup");

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pb-[14px] pt-[18px]">
        <div className="flex items-center font-display text-[26px] font-normal italic leading-none tracking-tight text-mirror-text">
          mirror
          <span
            className="relative ml-[3px] mb-[6px] inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-mirror-accent"
            aria-hidden
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-mirror-border bg-transparent text-mirror-ink2 transition-colors hover:bg-mirror-text/[0.04]"
            aria-label="Help"
            onClick={() => {
              if (canOpenWeb) openLogin();
            }}
          >
            <IconHelpCircle />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-mirror-border bg-transparent text-mirror-ink2 transition-colors hover:bg-mirror-text/[0.04]"
            aria-label="Close"
            onClick={onClose}
          >
            <IconClose />
          </button>
        </div>
      </header>

      {/* Editorial hero */}
      <div className="mt-4 px-1 pb-6">
        <div className="mb-3 flex items-center gap-1.5">
          <span
            className="h-[5px] w-[5px] shrink-0 animate-eyebrow-pulse rounded-full bg-mirror-accent"
            aria-hidden
          />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
            Social try-on for Phia
          </span>
        </div>
        <h1 className="font-display text-[52px] font-normal leading-[0.98] tracking-[-0.02em] text-mirror-text">
          See it on{" "}
          <em className="italic text-mirror-accent">you,</em>
          <br />
          before you buy.
        </h1>
        <p className="mt-3 max-w-[280px] text-[13.5px] leading-[1.55] text-mirror-muted">
          Virtual try-on plus your trusted circle&apos;s taste in every
          shopping tab.
        </p>
      </div>

      {/* SSO + form card */}
      <form
        className="flex flex-col gap-2.5 rounded-card border border-mirror-border bg-mirror-card px-4 py-5"
        onSubmit={(e) => {
          onSubmit(e);
        }}
      >
        {/* Google SSO */}
        <button
          type="button"
          disabled={!canOpenWeb}
          title={
            canOpenWeb
              ? "Continue in the web app (OAuth is not available in the extension yet)"
              : "Set VITE_MIRROR_WEB_URL to open the web app for Google sign-in"
          }
          onClick={() => openLogin()}
          className="flex items-center justify-center gap-2.5 rounded-xl border border-mirror-border bg-mirror-card py-3.5 text-sm font-medium text-mirror-text transition-colors hover:bg-mirror-panel disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconGoogle />
          Continue with Google
        </button>

        {/* Apple SSO */}
        <button
          type="button"
          disabled={!canOpenWeb}
          title={
            canOpenWeb
              ? "Continue in the web app (Apple sign-in is not available in the extension yet)"
              : "Set VITE_MIRROR_WEB_URL to open the web app for Apple sign-in"
          }
          onClick={() => openLogin()}
          className="flex items-center justify-center gap-2.5 rounded-xl border border-mirror-border bg-mirror-card py-3.5 text-sm font-medium text-mirror-text transition-colors hover:bg-mirror-panel disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconApple />
          Continue with Apple
        </button>

        {/* OR divider */}
        <div className="mx-1 my-1 flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-mirror-muted">
          <span className="h-px flex-1 bg-mirror-border" />
          or email
          <span className="h-px flex-1 bg-mirror-border" />
        </div>

        {/* Email field */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mirror-muted">
            <IconMail />
          </span>
          <input
            className="w-full rounded-xl border border-mirror-border bg-mirror-card py-3.5 pl-[38px] pr-3.5 text-[13.5px] text-mirror-text transition-[color,background-color,border-color] duration-150 placeholder:text-mirror-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            required
          />
        </div>

        {/* Password field */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mirror-muted">
            <IconLock />
          </span>
          <input
            className="w-full rounded-xl border border-mirror-border bg-mirror-card py-3.5 pl-[38px] pr-11 text-[13.5px] text-mirror-text transition-[color,background-color,border-color] duration-150 placeholder:text-mirror-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirror-accent"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-mirror-muted transition-colors hover:bg-mirror-text/[0.06] hover:text-mirror-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mirror-accent"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>

        {/* Keep signed in + forgot */}
        <div className="flex items-center justify-between px-1 py-0.5 text-xs">
          <div
            className="flex items-center gap-1.5 text-mirror-ink2"
            title="Session is stored in this browser via Chrome extension storage."
          >
            <span
              className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border-[1.5px] border-mirror-text bg-mirror-text"
              aria-hidden
            >
              <svg
                viewBox="0 0 12 12"
                width={8}
                height={8}
                className="text-white"
                aria-hidden
              >
                <path
                  d="M2 6l3 3 5-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                />
              </svg>
            </span>
            <span>Keep me signed in</span>
          </div>
          <button
            type="button"
            className="font-medium text-mirror-text underline underline-offset-[3px] hover:text-mirror-ink2 disabled:text-mirror-muted disabled:no-underline"
            disabled={!canOpenWeb}
            onClick={() => openLogin()}
          >
            Forgot?
          </button>
        </div>

        {error ? (
          <p className="text-center text-sm text-mirror-danger">{error}</p>
        ) : null}

        {/* Submit */}
        <button
          type="submit"
          disabled={signingIn}
          className="group mt-1 flex items-center justify-center gap-2 rounded-full bg-mirror-text py-[14px] text-[14px] font-medium tracking-[0.01em] text-white transition-colors hover:bg-mirror-ink2 disabled:opacity-60"
        >
          {signingIn ? "Signing in…" : "Sign in"}
          <span className="transition-transform group-hover:translate-x-0.5">
            <IconArrowRight />
          </span>
        </button>
      </form>

      <p className="mt-4 px-2 text-center text-xs leading-relaxed text-mirror-muted">
        New to Mirror?{" "}
        <button
          type="button"
          className="font-medium text-mirror-text underline underline-offset-[3px] hover:text-mirror-ink2 disabled:text-mirror-muted"
          disabled={!canOpenWeb}
          onClick={() => openSignup()}
        >
          Create an account
        </button>
      </p>

      <p className="mt-3.5 px-5 text-center text-[10px] leading-relaxed text-mirror-muted">
        By signing in you agree to Mirror&apos;s{" "}
        <button
          type="button"
          className="text-mirror-ink2 underline underline-offset-[3px] hover:text-mirror-text disabled:opacity-50"
          disabled={!canOpenWeb}
          onClick={() => openLogin()}
        >
          Terms
        </button>{" "}
        and{" "}
        <button
          type="button"
          className="text-mirror-ink2 underline underline-offset-[3px] hover:text-mirror-text disabled:opacity-50"
          disabled={!canOpenWeb}
          onClick={() => openLogin()}
        >
          Privacy Policy
        </button>
        . Your reference photos never leave your device unencrypted.
      </p>
    </div>
  );
}
