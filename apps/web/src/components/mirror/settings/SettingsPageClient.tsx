"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { MirrorPageHeader } from "@/components/mirror/MirrorPageHeader";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AVATAR_BIOMETRIC_SCOPES,
  defaultMirrorApiBase,
  grantAvatarConsent,
  uploadReferencePhotos,
} from "@/lib/mirror/avatarUpload";

type SettingsTab = "profile" | "privacy" | "notifications" | "account";

function tabClass(active: boolean): string {
  return `rounded-full px-[14px] py-2 text-[12.5px] font-medium transition-colors duration-150 ${
    active
      ? "bg-ink text-white"
      : "text-ink2 hover:bg-ink/[0.06]"
  }`;
}

function CameraIcon({ className = "shrink-0" }: { className?: string }) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4 7h3l1.5-2h7L17 7h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function FieldRow({
  label,
  value,
  empty,
  editDisabled = true,
  editTitle,
}: {
  label: string;
  value: string;
  empty?: boolean;
  editDisabled?: boolean;
  editTitle?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center border-t border-hair py-3.5 first:border-t-0 first:pt-1">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div
          className="mt-0.5 text-[12.5px] leading-snug"
          style={{ color: empty ? "var(--ink-3)" : "var(--ink-2)" }}
        >
          {value}
        </div>
      </div>
      <button
        type="button"
        disabled={editDisabled}
        title={editTitle ?? "Editing is coming soon"}
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-hair bg-transparent px-3 py-1.5 text-xs font-medium text-ink2 transition-colors enabled:hover:border-ink2 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Edit
      </button>
    </div>
  );
}

function SettingsCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[14px] border border-hair bg-card p-7 ${className}`}
    >
      {children}
    </div>
  );
}

function SettingToggle({
  defaultOn = true,
  id,
}: {
  defaultOn?: boolean;
  id: string;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={`relative h-6 w-[42px] shrink-0 rounded-full border transition-colors ${
        on ? "border-sage bg-sage" : "border-hair bg-bg2"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b border-hair py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`}
    >
      {children}
    </div>
  );
}

function SettingBtn({
  children,
  variant = "default",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "danger";
}) {
  const base =
    "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors";
  const styles =
    variant === "danger"
      ? "border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
      : "border-hair bg-card text-ink2 hover:border-ink2 hover:bg-bg2";
  return (
    <button type="button" className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display-sm mb-4 border-b border-hair pb-3 text-ink">
      {children}
    </h2>
  );
}

const selectClass =
  "cursor-pointer appearance-none rounded-full border border-hair bg-card py-1.5 pl-3 pr-8 text-xs font-medium text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

function formatUploadedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return null;
  }
}

export function SettingsPageClient({
  email,
  displayName,
  avatarSignedUrl = null,
  preprocessedAt = null,
  initialConsentId = null,
}: {
  email: string;
  displayName: string;
  avatarSignedUrl?: string | null;
  preprocessedAt?: string | null;
  initialConsentId?: string | null;
}) {
  const router = useRouter();
  const apiBase = defaultMirrorApiBase();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const handle = email.includes("@") ? `@${email.split("@")[0]}` : "@you";
  const [consentId, setConsentId] = useState<string | null>(
    initialConsentId ?? null,
  );
  useEffect(() => {
    setConsentId(initialConsentId ?? null);
  }, [initialConsentId]);

  const hasAvatar = !!avatarSignedUrl;
  const avatarUpdatedLabel = formatUploadedDate(preprocessedAt);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const personaFileRef = useRef<HTMLInputElement>(null);

  const signOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  async function grantConsent() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const j = await grantAvatarConsent(apiBase, token);
      setConsentId(j.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consent failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReferenceUpload(fileList: File[]) {
    if (!consentId) {
      setError("Record biometric consent first.");
      return;
    }
    setBusy(true);
    setError(null);
    setAvatarStatus(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not signed in");
      await uploadReferencePhotos({
        apiBase,
        accessToken: token,
        consentId,
        files: fileList,
        onStatus: setAvatarStatus,
      });
      setAvatarStatus(null);
      setRegenerateOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setAvatarStatus(null);
    }
  }

  const tabButtons = (
    <div className="inline-flex flex-wrap justify-end gap-1">
      {(
        [
          ["profile", "Profile"],
          ["privacy", "Privacy"],
          ["notifications", "Notifications"],
          ["account", "Account"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setTab(id)}
          className={tabClass(tab === id)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-10 bg-bg/90 backdrop-blur-md">
        <div className="px-3 pb-1 pt-6 md:px-4 md:pt-7">
          <MirrorPageHeader
            flush
            eyebrow="ACCOUNT"
            leadingTitle="Your"
            accentWord="profile."
            subtitle="Your digital persona, sizes, and preferences."
            right={tabButtons}
          />
        </div>
      </header>

      <div className="w-full px-3 pb-20 pt-6 md:px-4">
        {tab === "privacy" ? (
          <div className="space-y-8">
            <SettingsCard>
              <SectionTitle>Visibility</SectionTitle>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Default fit audience
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
                    Who sees your shared fits by default
                  </div>
                </div>
                <select
                  className={selectClass}
                  defaultValue="followers"
                  aria-label="Default fit audience"
                >
                  <option value="followers">Followers</option>
                  <option value="public">Public</option>
                  <option value="close">Close Friends</option>
                  <option value="private">Private</option>
                </select>
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Who can find you
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Controls search visibility
                  </div>
                </div>
                <select
                  className={selectClass}
                  defaultValue="anyone"
                  aria-label="Who can find you"
                >
                  <option value="anyone">Anyone</option>
                  <option value="handle">By handle only</option>
                  <option value="nobody">Nobody</option>
                </select>
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Show Style Score
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
                    Style Score is always private — only you can see it
                  </div>
                </div>
                <SettingToggle id="score" defaultOn />
              </SettingRow>
            </SettingsCard>

            <SettingsCard>
              <SectionTitle>Data and analytics</SectionTitle>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Analytics opt-in
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
                    Help us improve Mirror with anonymous usage data
                  </div>
                </div>
                <SettingToggle id="analytics" defaultOn />
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Personalized For You feed
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Uses style fingerprinting to rank content
                  </div>
                </div>
                <SettingToggle id="foryou" defaultOn />
              </SettingRow>
            </SettingsCard>
          </div>
        ) : null}

        {tab === "notifications" ? (
          <div className="space-y-8">
            <SettingsCard>
              <SectionTitle>Push notifications</SectionTitle>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Social</div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Reactions, comments, mentions, new followers
                  </div>
                </div>
                <SettingToggle id="push-social" defaultOn />
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Commerce</div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Price drops, restocks, friend purchased an item you tried
                  </div>
                </div>
                <SettingToggle id="push-commerce" defaultOn />
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Style digest
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Weekly summary of your circle&apos;s top fits
                  </div>
                </div>
                <SettingToggle id="push-digest" defaultOn />
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">System</div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Account, privacy, and security alerts
                  </div>
                </div>
                <SettingToggle id="push-system" defaultOn />
              </SettingRow>
            </SettingsCard>

            <SettingsCard>
              <SectionTitle>Email</SectionTitle>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Weekly digest email
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Delivered via Resend every Monday at 9 AM your time
                  </div>
                </div>
                <SettingToggle id="email-digest" defaultOn />
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Price drop alerts
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Email when watched items drop in price
                  </div>
                </div>
                <SettingToggle id="email-price" defaultOn={false} />
              </SettingRow>
            </SettingsCard>
          </div>
        ) : null}

        {tab === "account" ? (
          <div className="space-y-8">
            <SettingsCard>
              <SectionTitle>Account</SectionTitle>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Email</div>
                  <div className="mt-0.5 break-all text-[12.5px] text-ink3">
                    {email}
                  </div>
                </div>
                <SettingBtn disabled>Change</SettingBtn>
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Password</div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Manage via Supabase Auth (email link / reset)
                  </div>
                </div>
                <SettingBtn disabled>Change</SettingBtn>
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Connected devices
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    Chrome extension, this browser session
                  </div>
                </div>
                <SettingBtn disabled>Manage</SettingBtn>
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">Sign out</div>
                  <div className="mt-0.5 text-[12.5px] text-ink3">
                    End your session on this device
                  </div>
                </div>
                <SettingBtn onClick={() => void signOut()}>Sign out</SettingBtn>
              </SettingRow>
            </SettingsCard>

            <SettingsCard>
              <SectionTitle>Data</SectionTitle>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Export all data
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
                    Download everything — photos, try-ons, closet, social — in
                    JSON + image bundle
                  </div>
                </div>
                <SettingBtn disabled>Export</SettingBtn>
              </SettingRow>
              <SettingRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">
                    Delete try-on history
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
                    Remove all past try-on results. Cannot be undone.
                  </div>
                </div>
                <SettingBtn variant="danger" disabled>
                  Delete history
                </SettingBtn>
              </SettingRow>
            </SettingsCard>

            <SettingsCard>
              <SectionTitle>Danger zone</SectionTitle>
              <div className="rounded-[var(--radius-sm)] border border-[var(--danger)]/25 bg-[var(--danger)]/[0.06] p-5">
                <SettingRow className="!border-b-0 !py-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--danger)]">
                      Delete account
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
                      Permanently delete your account and all data. This cannot
                      be undone.
                    </div>
                  </div>
                  <SettingBtn
                    variant="danger"
                    onClick={() =>
                      window.alert(
                        "Account deletion is not wired in the hackathon build.",
                      )
                    }
                  >
                    Delete account
                  </SettingBtn>
                </SettingRow>
              </div>
            </SettingsCard>
          </div>
        ) : null}

        {tab === "profile" ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
            {/* Digital persona */}
            <SettingsCard className="lg:sticky lg:top-24">
              <div className="eyebrow mb-2.5">
                <span style={{ color: "var(--accent)" }}>● </span>YOUR DIGITAL
                PERSONA
              </div>
              <div className="display-md text-ink">
                The body behind every{" "}
                <span className="ital" style={{ color: "var(--accent)" }}>
                  try-on.
                </span>
              </div>

              <div className="relative mt-[18px] aspect-[4/5] overflow-hidden rounded-[14px] border border-hair">
                {hasAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL; not in next/image remotePatterns
                  <img
                    src={avatarSignedUrl!}
                    alt="Your try-on reference"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="ph ph-rose absolute inset-0 rounded-none border-0" />
                )}
                {!hasAvatar ? (
                  <div className="ph-cap ph-cap-top mono-tag">PRIVATE · 5 PHOTOS</div>
                ) : null}
                <div className="ph-cap mono-tag ph-cap-center">
                  REFERENCE · FULL-BODY
                </div>
              </div>

              {!consentId ? (
                <div className="mt-4 rounded-[var(--radius-sm)] border border-hair bg-bg2/50 p-4">
                  <p className="text-[13px] font-medium text-ink">
                    Biometric consent required
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-ink3">
                    Scopes: {AVATAR_BIOMETRIC_SCOPES.join(", ")}.
                  </p>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center justify-center rounded-full bg-ink px-4 py-2 text-xs font-medium text-white transition hover:bg-[#000] disabled:opacity-50"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void grantConsent()}
                  >
                    {busy ? "Recording consent…" : "I agree — record consent"}
                  </button>
                  {error ? (
                    <p className="mt-2 text-[12.5px] leading-snug text-[var(--danger)]">
                      {error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="meta">
                      {avatarUpdatedLabel
                        ? `Updated ${avatarUpdatedLabel}`
                        : "\u00a0"}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input
                        ref={personaFileRef}
                        id="settings-persona-files"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy}
                        aria-label="Choose reference photos for try-on (JPEG, PNG, or WebP)"
                        className="sr-only"
                        onChange={(e) => {
                          const list = Array.from(e.target.files ?? []);
                          if (list.length > 0) void handleReferenceUpload(list);
                          e.target.value = "";
                        }}
                      />
                      {hasAvatar && !regenerateOpen ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#000] disabled:opacity-50"
                          disabled={busy}
                          onClick={() => setRegenerateOpen(true)}
                        >
                          <CameraIcon />
                          Regenerate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#000] disabled:opacity-50"
                          disabled={busy}
                          onClick={() => personaFileRef.current?.click()}
                        >
                          <CameraIcon />
                          {hasAvatar && regenerateOpen
                            ? "Choose photos"
                            : "Upload photos"}
                        </button>
                      )}
                      {hasAvatar && regenerateOpen ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full border border-hair bg-transparent px-3 py-1.5 text-xs font-medium text-ink2 transition hover:border-ink2 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => setRegenerateOpen(false)}
                        >
                          Cancel
                        </button>
                      ) : null}
                      <Link
                        href="/onboarding"
                        className="inline-flex items-center justify-center rounded-full border border-hair bg-transparent px-3 py-1.5 text-xs font-medium text-ink2 transition hover:border-ink2"
                      >
                        Learn more
                      </Link>
                    </div>
                  </div>
                  {avatarStatus ? (
                    <p className="meta mt-2">{avatarStatus}</p>
                  ) : null}
                  {error ? (
                    <p className="mt-2 text-[12.5px] text-[var(--danger)]">
                      {error}
                    </p>
                  ) : null}
                </>
              )}
            </SettingsCard>

            <div className="flex min-w-0 flex-col gap-5">
              <SettingsCard>
                <div className="display-md mb-3.5 text-ink">Profile</div>
                <FieldRow label="Display name" value={displayName} />
                <FieldRow label="Username" value={handle} />
                <FieldRow
                  label="Bio"
                  value="Add a short bio (coming soon)."
                  empty
                />
                <FieldRow label="Pronouns" value="Not set" empty />
              </SettingsCard>

              <SettingsCard>
                <div className="display-md mb-3.5 text-ink">Size Profile</div>
                <FieldRow label="Height" value="Not set" empty />
                <FieldRow
                  label="Preferred fit"
                  value="Regular / Relaxed"
                />
                <FieldRow
                  label="Default sizes"
                  value="Tops: M · Bottoms: 32 · Shoes: 10"
                />
                <FieldRow
                  label="Color palette"
                  value="Warm earth · Neutrals"
                />
              </SettingsCard>

              <SettingsCard>
                <div className="eyebrow text-ink3">● DANGER ZONE</div>
                <div className="display-md mt-1 text-ink">
                  Sign out or delete{" "}
                  <span className="ital" style={{ color: "var(--danger)" }}>
                    everything.
                  </span>
                </div>
                <p className="meta mt-1.5">
                  Your reference photos are removed from our servers within 24
                  hours.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="inline-flex items-center justify-center rounded-full border border-ink bg-transparent px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-ink hover:text-white"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.alert(
                        "Account deletion is not wired in the hackathon build.",
                      )
                    }
                    className="inline-flex items-center justify-center rounded-full border border-hair bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:border-[var(--danger)]/40"
                  >
                    Delete account
                  </button>
                </div>
              </SettingsCard>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
