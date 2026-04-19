"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MirrorAuthShell } from "@/components/mirror/MirrorAuthShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: email.split("@")[0] ?? "Shopper" } },
    });
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <MirrorAuthShell
      leadingTitle="Create"
      accentWord="account."
      subtitle="Start with email and password — then add your reference photo for try-on."
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
          <input
            id="password"
            className="body w-full rounded-mirror-sm border border-hair bg-card px-3.5 py-2.5 text-ink transition-colors placeholder:text-ink3"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? <p className="body-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          className="mt-2 rounded-full bg-ink py-3 text-[13px] font-medium text-white transition-colors duration-150 ease-out hover:bg-black"
        >
          Sign up
        </button>
      </form>
      <p className="body-sm mt-8 text-center text-ink3">
        Already have an account?{" "}
        <Link
          className="font-medium text-ink underline underline-offset-2 transition-colors duration-150 hover:text-accent"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </MirrorAuthShell>
  );
}
