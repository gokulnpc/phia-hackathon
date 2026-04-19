"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MirrorAuthShell } from "@/components/mirror/MirrorAuthShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AVATAR_BIOMETRIC_SCOPES,
  defaultMirrorApiBase,
  grantAvatarConsent,
  uploadReferencePhotos,
} from "@/lib/mirror/avatarUpload";

export default function OnboardingPage() {
  const router = useRouter();
  const apiBase = defaultMirrorApiBase();
  const [consentId, setConsentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
      }
    })();
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consent failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhotos(fileList: File[]) {
    if (!consentId) {
      setError("Grant consent first.");
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
      router.push("/feed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setAvatarStatus(null);
    }
  }

  return (
    <MirrorAuthShell
      leadingTitle="Reference"
      accentWord="photo."
      subtitle="Mirror uses one full-body photo for virtual try-on. You must confirm biometric consent before upload (required for compliance)."
    >
      <div className="space-y-6">
        <div className="rounded-mirror border border-hair bg-card p-5">
          <p className="eyebrow text-ink3">Step 1</p>
          <h2 className="font-display mt-2 text-[22px] font-normal leading-[1.15] tracking-[-0.01em] text-ink">
            Consent
          </h2>
          <p className="body-sm mt-2 text-ink3">
            Scopes: {AVATAR_BIOMETRIC_SCOPES.join(", ")}. You can revoke later from settings (v1 stub).
          </p>
          <button
            type="button"
            className="mt-4 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-white transition-colors duration-150 ease-out hover:bg-black disabled:opacity-50"
            onClick={() => void grantConsent()}
            disabled={busy || !!consentId}
          >
            {consentId ? "Consent recorded" : "I agree — record consent"}
          </button>
        </div>
        <div className="rounded-mirror border border-hair bg-card p-5">
          <p className="eyebrow text-ink3">Step 2</p>
          <h2 className="font-display mt-2 text-[22px] font-normal leading-[1.15] tracking-[-0.01em] text-ink">
            Upload
          </h2>
          <p className="body-sm mt-2 text-ink3">
            Choose 1–5 full-body photos (different angles help). Each image must be at least
            320×480px.
          </p>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="body-sm mt-4 block w-full text-ink3 file:mr-4 file:rounded-full file:border file:border-hair file:bg-bg2 file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-ink transition-colors file:transition-colors hover:file:border-ink hover:file:bg-bg"
            disabled={!consentId || busy}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length > 0) void uploadPhotos(list);
              e.target.value = "";
            }}
          />
        </div>
        {avatarStatus ? <p className="body-sm text-ink3">{avatarStatus}</p> : null}
        {error ? <p className="body-sm text-danger">{error}</p> : null}
      </div>
    </MirrorAuthShell>
  );
}
