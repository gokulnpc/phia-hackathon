import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type { Database };

export type TryOnJobRow = Database["public"]["Tables"]["tryon_jobs"]["Row"];

export type TryOnSubmitBody = {
  product_id?: string;
  /** Required unless `product_id` is set (server resolves image from catalog). */
  product_image_url?: string;
  product_metadata?: Record<string, unknown>;
  /** When set, worker uses this completed try-on result as the model image (user-owned). */
  model_reference_tryon_result_id?: string;
  mode?: "standard" | "quality" | "fast";
  priority?: number;
};

export type TryOnSubmitResponse = {
  job_id: string;
  status: string;
  cache_hit: boolean;
  estimated_ready_at?: string;
  poll_url?: string;
  result?: {
    id: string;
    signed_url: string;
    thumbnail_url: string;
    quality_score: number;
    provider: string;
    generated_at: string;
  };
};

/**
 * Human-readable error from a non-OK Mirror API `Response` (consumes the body once).
 * For empty HTML/gateway bodies (common on 502), adds deployment hints.
 */
export async function mirrorApiHttpErrorMessage(
  res: Response,
  context: string,
): Promise<string> {
  const statusLine = `${context}: HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const parsed = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      detail?: unknown;
    };
    const m = parsed.error?.message;
    if (typeof m === "string" && m.trim()) return m;
    if (
      typeof parsed.detail === "string" ||
      typeof parsed.detail === "number"
    ) {
      return `${statusLine}. ${String(parsed.detail)}`;
    }
  } else {
    const text = (await res.text().catch(() => "")).trim().slice(0, 400);
    if (text) return `${statusLine}. ${text}`;
  }
  if (res.status >= 502 && res.status <= 504) {
    return `${statusLine}. Gateway could not reach the API process (Railway often reports connection refused — confirm the public HTTP service runs mirror-api and listens on PORT; curl GET /health on the same host).`;
  }
  return statusLine;
}

/** POST try-on via Mirror API (JWT from Supabase session). Treats 202 Accepted as success for queued jobs. */
export async function submitTryOn(
  apiBaseUrl: string,
  accessToken: string,
  body: TryOnSubmitBody,
): Promise<TryOnSubmitResponse> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/tryon`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Try-on"));
  }
  return res.json() as Promise<TryOnSubmitResponse>;
}

export type TryOnEditorialSubmitResponse = {
  job_id: string;
  status: string;
  estimated_ready_at?: string;
  poll_url: string;
};

/** Enqueue Gemini editorial polish for a primary (non-derivative) try-on result. */
export async function submitTryOnEditorialJob(
  apiBaseUrl: string,
  accessToken: string,
  body: { source_result_id: string },
): Promise<TryOnEditorialSubmitResponse> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/api/v1/tryon/editorial`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Try-on editorial"));
  }
  return res.json() as Promise<TryOnEditorialSubmitResponse>;
}

export type TryOnEditorialPollBody = {
  job_id: string;
  status: string;
  result?: {
    id: string;
    signed_url: string;
    thumbnail_url: string;
    quality_score: number;
    provider: string;
    generated_at: string;
  };
  error_code?: string;
  error_message?: string;
};

export async function fetchTryOnEditorialJob(
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
): Promise<TryOnEditorialPollBody> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/api/v1/tryon/editorial/${jobId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Try-on editorial poll"));
  }
  return res.json() as Promise<TryOnEditorialPollBody>;
}

/** Poll HTTP until editorial job completes, fails, or times out. */
export async function waitForTryOnEditorialJob(
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<TryOnEditorialPollBody> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const deadline = Date.now() + timeoutMs;
  const terminal = (s: string) =>
    s === "completed" || s === "failed" || s === "cancelled";

  while (Date.now() < deadline) {
    const row = await fetchTryOnEditorialJob(apiBaseUrl, accessToken, jobId);
    if (terminal(row.status)) return row;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error("Editorial enhancement timed out");
}

export type ClosetWishlistBody = {
  url: string;
  extracted: {
    name?: string;
    image?: string;
    brand?: string;
    price?: number;
    /** Closet bucket hint; API coerces to `top` or `bottom` on `products.category`. */
    category?: string;
  };
};

export type ClosetWishlistResponse = {
  already_saved: boolean;
  closet_item_id: string;
  product_id: string;
};

/** Save current PDP to the user’s closet wishlist (Mirror API + service upsert product). */
export async function saveToWishlist(
  apiBaseUrl: string,
  accessToken: string,
  body: ClosetWishlistBody,
): Promise<ClosetWishlistResponse> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/closet/wishlist`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = data as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Save failed: ${res.status}`);
  }
  if (typeof data.error === "string") {
    throw new Error(data.error);
  }
  return {
    already_saved: Boolean(data.already_saved),
    closet_item_id: String(data.closet_item_id ?? ""),
    product_id: String(data.product_id ?? ""),
  };
}

/** Mark current PDP as owned in the closet (same API shape as wishlist). */
export async function saveToOwned(
  apiBaseUrl: string,
  accessToken: string,
  body: ClosetWishlistBody,
): Promise<ClosetWishlistResponse> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/closet/owned`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = data as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Save failed: ${res.status}`);
  }
  if (typeof data.error === "string") {
    throw new Error(data.error);
  }
  return {
    already_saved: Boolean(data.already_saved),
    closet_item_id: String(data.closet_item_id ?? ""),
    product_id: String(data.product_id ?? ""),
  };
}

/**
 * SHA-256 hex digest of UTF-8 bytes of `url` (matches backend `product_catalog` canonical_url_hash).
 */
export async function canonicalUrlHash(url: string): Promise<string> {
  const data = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Subscribe to tryon_jobs row until status is terminal or timeout. */
export function subscribeTryOnJob(
  client: SupabaseClient<Database>,
  jobId: string,
  onUpdate: (row: TryOnJobRow) => void,
): RealtimeChannel {
  const channel = client
    .channel(`tryon:${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tryon_jobs",
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        onUpdate(payload.new as TryOnJobRow);
      },
    )
    .subscribe();
  return channel;
}

export async function waitForTryOnJob(
  client: SupabaseClient<Database>,
  jobId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<TryOnJobRow> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const deadline = Date.now() + timeoutMs;

  const terminal = (s: string) =>
    s === "completed" || s === "failed" || s === "cancelled";

  const fetchRow = async (): Promise<TryOnJobRow> => {
    const { data, error } = await client.from("tryon_jobs").select("*").eq("id", jobId).single();
    if (error) throw new Error(error.message);
    return data as TryOnJobRow;
  };

  const channel = subscribeTryOnJob(client, jobId, () => {
    /* realtime fires; polling below still resolves */
  });

  try {
    while (Date.now() < deadline) {
      const row = await fetchRow();
      if (terminal(row.status)) return row;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error("Try-on timed out");
  } finally {
    void client.removeChannel(channel);
  }
}

// ---- Fit score ------------------------------------------------------------

export type FitScoreBreakdown = {
  silhouette: number;
  color_palette: number;
  closet_overlap: number;
  occasion_fit: number;
  brand_affinity: number;
};

export type FitScoreMatchingItem = {
  closet_item_id: string;
  reason: string;
};

export type FitScoreResult = {
  id?: string;
  overall_score: number;
  breakdown: FitScoreBreakdown;
  matching_items: FitScoreMatchingItem[];
  conflicts: FitScoreMatchingItem[];
  explanation: string;
  confidence: "low" | "medium" | "high";
  generated_at?: string;
};

export type FitScoreSubmitBody = {
  url: string;
  extracted: {
    name?: string;
    image?: string;
    brand?: string;
    price?: number;
    category?: string;
  };
};

export type FitScoreSubmitResponse =
  | {
      status: "empty_closet";
      cache_hit: false;
      cta: string;
    }
  | {
      job_id: string;
      status: "completed";
      cache_hit: true;
      result: FitScoreResult;
    }
  | {
      job_id: string;
      status: "queued";
      cache_hit: false;
      estimated_ready_at?: string;
      poll_url?: string;
    };

export type FitScoreJobPollResponse = {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  result?: FitScoreResult;
  error_code?: string;
  error_message?: string;
};

/** POST fit-score; 202 means queued, 200 means cache hit or empty closet. */
export async function submitFitScore(
  apiBaseUrl: string,
  accessToken: string,
  body: FitScoreSubmitBody,
): Promise<FitScoreSubmitResponse> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/fit-score`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Fit score"));
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return data as unknown as FitScoreSubmitResponse;
}

/** GET fit-score job status (resolves cached-* ids inline). */
export async function pollFitScoreJob(
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
): Promise<FitScoreJobPollResponse> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/api/v1/fit-score/${jobId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Fit score poll"));
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return data as unknown as FitScoreJobPollResponse;
}

type FitScoreJobRowLite = {
  id: string;
  status: string;
  error_message: string | null;
  error_code: string | null;
  result_id: string | null;
};

/** Poll fit_score_jobs (with realtime subscription for updates) until terminal. */
export async function waitForFitScoreJob(
  client: SupabaseClient<Database>,
  jobId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<FitScoreJobRowLite> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const deadline = Date.now() + timeoutMs;

  const terminal = (s: string) =>
    s === "completed" || s === "failed" || s === "cancelled";

  const channel = client
    .channel(`fit-score:${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "fit_score_jobs",
        filter: `id=eq.${jobId}`,
      },
      () => {
        /* realtime fires; polling below still resolves */
      },
    )
    .subscribe();

  try {
    while (Date.now() < deadline) {
      const { data, error } = await client
        .from("fit_score_jobs")
        // database.types doesn't know this table yet; cast at the boundary.
        .select("id, status, error_message, error_code, result_id")
        .eq("id", jobId)
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as FitScoreJobRowLite;
      if (terminal(row.status)) return row;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error("Fit score timed out");
  } finally {
    void client.removeChannel(channel);
  }
}

// ---- Reverse search / "Worn by" -------------------------------------------

export type ReverseSearchSubmitBody = {
  /** Full product page URL. Server hashes (SHA-256) to the product identity. */
  url?: string;
  /** Precomputed SHA-256 of the canonical product URL (hex lowercase). */
  canonical_url_hash?: string;
  /** PDP metadata scraped by the extension. When present the server upserts the
   *  `products` row so the reverse-search worker has a `primary_image_url` and
   *  brand/category hints for the provider fan-out (SerpAPI Lens + Apify). */
  extracted?: {
    name?: string;
    image?: string;
    brand?: string;
    price?: number;
    /** Closet bucket hint; server coerces to `top` or `bottom`. */
    category?: string;
  };
};

export type MirrorPostMatch = {
  post_id: string;
  user_id: string;
  /** Fresh signed URL when the post has a `tryon_result_id`; else the raw `posts.image_url`. */
  image_url: string;
  thumbnail_url: string | null;
  caption: string;
  created_at: string | null;
  reaction_count: number;
  comment_count: number;
};

/** One "Around the web" result from an external visual-search provider. */
export type WebVisualMatch = {
  image_url: string;
  source_url: string;
  source_host: string;
  title: string;
  visual_score: number;
};

export type ReverseSearchSubmitResponse = {
  status: "completed" | "queued";
  cache_hit: boolean;
  canonical_url_hash: string;
  mirror_results: MirrorPostMatch[];
  /** Populated on cache hits or when no external provider is configured ([]). */
  web_results: WebVisualMatch[];
  /** Present when the external-search job is async; client should poll. */
  job_id?: string;
  /** Which provider the job was enqueued against (informational). */
  provider?: string;
  /** True when no external-search provider is configured on the backend. */
  external_disabled?: boolean;
  /** Soft-error code when mirror-native succeeded but enqueue failed. */
  external_provider_error?: string;
};

export type ReverseSearchJobPollResponse = {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  web_results?: WebVisualMatch[];
  error_code?: string;
  error_message?: string;
};

/** POST reverse-search. Mirror-native results are always inline; web results
 * arrive synchronously on cache hit, otherwise via `job_id` + `pollReverseSearchJob`. */
export async function submitReverseSearch(
  apiBaseUrl: string,
  accessToken: string,
  body: ReverseSearchSubmitBody,
): Promise<ReverseSearchSubmitResponse> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/api/v1/reverse-search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Reverse search"));
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return data as unknown as ReverseSearchSubmitResponse;
}

/** GET reverse-search job status + web_results (when completed). */
export async function pollReverseSearchJob(
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
): Promise<ReverseSearchJobPollResponse> {
  const res = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/api/v1/reverse-search/${jobId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(await mirrorApiHttpErrorMessage(res, "Reverse search poll"));
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return data as unknown as ReverseSearchJobPollResponse;
}

/** Poll `reverse_search_jobs` (with Realtime subscription) until terminal.
 *
 * Default wait matches try-on / fit-score (120s): composite search + Apify +
 * Gemini person-filter often exceeds 30s.
 */
export async function waitForReverseSearchJob(
  client: SupabaseClient<Database>,
  apiBaseUrl: string,
  accessToken: string,
  jobId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<ReverseSearchJobPollResponse> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const deadline = Date.now() + timeoutMs;

  const terminal = (s: string) =>
    s === "completed" || s === "failed" || s === "cancelled";

  const channel = client
    .channel(`reverse-search:${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "reverse_search_jobs",
        filter: `id=eq.${jobId}`,
      },
      () => {
        /* Realtime fires; HTTP poll below still resolves. */
      },
    )
    .subscribe();

  try {
    while (Date.now() < deadline) {
      const got = await pollReverseSearchJob(apiBaseUrl, accessToken, jobId);
      if (terminal(got.status)) return got;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    const last = await pollReverseSearchJob(apiBaseUrl, accessToken, jobId);
    if (terminal(last.status)) return last;
    throw new Error("Reverse search timed out");
  } finally {
    void client.removeChannel(channel);
  }
}
