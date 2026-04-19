/** Shared client flows for reference photos → avatar job (POST /avatar + poll). */

export const AVATAR_BIOMETRIC_SCOPES = [
  "storage",
  "tryon_generation",
  "no_training",
  "no_third_party_sharing",
] as const;

export const AVATAR_MAX_FILES = 5;
export const AVATAR_MIN_FILES = 1;

export function defaultMirrorApiBase(): string {
  return process.env.NEXT_PUBLIC_MIRROR_API_URL ?? "http://localhost:8000";
}

/** FastAPI often returns `detail` as a string, or a list of validation errors with `msg`. */
export function formatFastApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((x) => {
      if (x && typeof x === "object" && "msg" in x) {
        return String((x as { msg: unknown }).msg);
      }
      return JSON.stringify(x);
    });
    return parts.join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  if (detail == null) return "";
  return String(detail);
}

/** Minimal quality gate: readable dimensions (full-body try-on). */
export function validateReferenceImage(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth < 320 || img.naturalHeight < 480) {
        reject(
          new Error(
            "Image is too small. Use at least 320×480px (taller is better for full-body try-on).",
          ),
        );
        return;
      }
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Try JPEG or PNG."));
    };
    img.src = url;
  });
}

export async function grantAvatarConsent(
  apiBase: string,
  accessToken: string,
): Promise<{ id: string }> {
  const res = await fetch(`${apiBase}/api/v1/avatar/consent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "grant",
      consent_version: "biometric-v1",
      scope: [...AVATAR_BIOMETRIC_SCOPES],
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const msg = formatFastApiDetail(j.detail) || res.statusText;
    throw new Error(msg);
  }
  return (await res.json()) as { id: string };
}

export async function waitForAvatarJob(
  apiBase: string,
  accessToken: string,
  jobId: string,
  onStatus?: (message: string) => void,
): Promise<void> {
  const maxAttempts = 90;
  const delayMs = 2000;
  for (let i = 0; i < maxAttempts; i++) {
    onStatus?.("Generating a clean full-body avatar for try-on…");
    const st = await fetch(`${apiBase}/api/v1/avatar/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!st.ok) {
      const j = (await st.json().catch(() => ({}))) as { detail?: unknown };
      const msg = formatFastApiDetail(j.detail) || st.statusText;
      throw new Error(msg);
    }
    const j = (await st.json()) as {
      status?: string;
      error_message?: string | null;
      error_code?: string | null;
    };
    const s = j.status;
    if (s === "completed") return;
    if (s === "failed") {
      throw new Error(
        j.error_message?.trim() ||
          j.error_code ||
          "Avatar generation failed. Check GEMINI_API_KEY / billing and try again.",
      );
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    "Avatar generation is taking longer than expected. You can leave this page and check Settings later.",
  );
}

export async function uploadReferencePhotos(params: {
  apiBase: string;
  accessToken: string;
  consentId: string;
  files: File[];
  onStatus?: (message: string | null) => void;
}): Promise<void> {
  const { apiBase, accessToken, consentId, files, onStatus } = params;
  if (files.length < AVATAR_MIN_FILES) {
    throw new Error("Select at least one image.");
  }
  if (files.length > AVATAR_MAX_FILES) {
    throw new Error(`Select at most ${AVATAR_MAX_FILES} images.`);
  }
  for (const f of files) {
    await validateReferenceImage(f);
  }
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f);
  }
  fd.append("consent_id", consentId);
  const res = await fetch(`${apiBase}/api/v1/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const msg = formatFastApiDetail(j.detail) || res.statusText;
    throw new Error(msg);
  }
  if (res.status === 202) {
    const body = (await res.json()) as { job_id?: string };
    if (!body.job_id) throw new Error("Missing job_id from server");
    await waitForAvatarJob(apiBase, accessToken, body.job_id, (msg) => onStatus?.(msg));
  }
  onStatus?.(null);
}
