"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MirrorAuthShell } from "@/components/mirror/MirrorAuthShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const iconStroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <path {...iconStroke} d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle {...iconStroke} cx={12} cy={12} r={3} />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <path
        {...iconStroke}
        d="M10.733 5.076A10.744 10.744 0 0 1 12 5c7 0 10 7 10 7a13.165 13.165 0 0 1-1.555 2.665"
      />
      <path {...iconStroke} d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path
        {...iconStroke}
        d="M6.61 6.611A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.611"
      />
      <line {...iconStroke} x1={2} y1={2} x2={22} y2={22} />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/feed");
    router.refresh();
  }

  return (
    <MirrorAuthShell
      leadingTitle="Sign"
      accentWord="in."
      subtitle="Welcome back — open your fit feed and style circle."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="eyebrow mb-2 block text-ink3">
            Email
          </label>
          <input
            id="email"
            className="body w-full rounded-mirror-sm border border-hair bg-card px-3.5 py-2.5 text-ink transition-colors placeholder:text-ink3"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="eyebrow mb-2 block text-ink3">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              className="body w-full rounded-mirror-sm border border-hair bg-card py-2.5 pl-3.5 pr-11 text-ink transition-colors placeholder:text-ink3"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink3 transition-colors hover:bg-ink/[0.06] hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        {error ? <p className="body-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          className="mt-2 rounded-full bg-ink py-3 text-[13px] font-medium text-white transition-colors duration-150 ease-out hover:bg-black"
        >
          Continue
        </button>
      </form>
      <p className="body-sm mt-8 text-center text-ink3">
        No account?{" "}
        <Link
          className="font-medium text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
          href="/signup"
        >
          Sign up
        </Link>
      </p>
    </MirrorAuthShell>
  );
}
