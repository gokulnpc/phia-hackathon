import { redirect } from "next/navigation";
import { SettingsPageClient } from "@/components/mirror/settings/SettingsPageClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const meta = user.user_metadata as { display_name?: string } | undefined;
  const displayName =
    (typeof meta?.display_name === "string" && meta.display_name.trim() !== "" && meta.display_name) ||
    user.email?.split("@")[0] ||
    "Member";

  let avatarSignedUrl: string | null = null;
  let preprocessedAt: string | null = null;
  let consentId: string | null = null;

  try {
    const { data: ref } = await supabase
      .from("reference_photos")
      .select("preprocessed_storage_path, preprocessed_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prePath =
      typeof ref?.preprocessed_storage_path === "string" && ref.preprocessed_storage_path.trim() !== ""
        ? ref.preprocessed_storage_path
        : null;
    if (typeof ref?.preprocessed_at === "string") {
      preprocessedAt = ref.preprocessed_at;
    }

    if (prePath) {
      const { data: signed, error: signErr } = await supabase.storage
        .from("reference-photos")
        .createSignedUrl(prePath, 3600);
      if (!signErr && signed?.signedUrl) {
        avatarSignedUrl = signed.signedUrl;
      }
    }

    const { data: consentRow } = await supabase
      .from("biometric_consents")
      .select("id")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consentRow && typeof consentRow.id === "string") {
      consentId = consentRow.id;
    }
  } catch {
    avatarSignedUrl = null;
    preprocessedAt = null;
    consentId = null;
  }

  return (
    <SettingsPageClient
      email={user.email ?? ""}
      displayName={displayName}
      avatarSignedUrl={avatarSignedUrl}
      preprocessedAt={preprocessedAt}
      initialConsentId={consentId}
    />
  );
}
