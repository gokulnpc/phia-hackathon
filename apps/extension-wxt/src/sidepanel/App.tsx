import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  canonicalUrlHash,
  mirrorApiHttpErrorMessage,
  pollFitScoreJob,
  saveToOwned,
  saveToWishlist,
  submitFitScore,
  submitTryOn,
  submitTryOnEditorialJob,
  waitForFitScoreJob,
  waitForTryOnEditorialJob,
  waitForTryOnJob,
  type FitScoreResult,
  type TryOnSubmitBody,
} from "@mirror/sdk-js";
import {
  inferGarmentBucketFromPdp,
  normalizeClosetGarmentBucket,
} from "../lib/closetGarmentBucket";
import { closeMirrorUi } from "../lib/closeMirrorUi";
import { normalizeProductImageUrl } from "../lib/productImageUrl";
import { createExtensionSupabase } from "../lib/supabase";
import { AppHeader } from "./layout/AppHeader";
import { BottomNav } from "./layout/BottomNav";
import { DevTabBar } from "./layout/DevTabBar";
import { PanelFrame } from "./layout/PanelFrame";
import type { ReferenceStatus, SidePanelTab } from "./types";
import { CircleView } from "./views/CircleView";

const EXT_TAB_STORAGE_KEY = "mirror_ext_state_v1";

function isSidePanelTab(v: string): v is SidePanelTab {
  return (
    v === "home" ||
    v === "tryon" ||
    v === "circle" ||
    v === "feed" ||
    v === "wornby" ||
    v === "fit"
  );
}
import { FeedView, type FeedViewProps } from "./views/FeedView";
import { FitScoreView } from "./views/FitScoreView";
import { HomeView } from "./views/HomeView";
import { SignInView } from "./views/SignInView";
import { WornByView } from "./views/WornByView";
import {
  TryOnView,
  type GarmentCategory,
  type GarmentListFilter,
  type PdpGarmentPreview,
  type SavedGarment,
} from "./views/TryOnView";

type Product = {
  url: string;
  name: string;
  image: string;
  price?: number;
  brand?: string;
  category?: string;
};

const apiBase = import.meta.env.VITE_MIRROR_API_URL ?? "http://localhost:8000";

async function refreshCatalogRulesInBackground(token: string) {
  await chrome.runtime.sendMessage({
    type: "mirror:refreshCatalogRules",
    token,
    apiBase,
  });
}

function formatPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return `$${Math.round(n)}`;
}

/** Ask the active tab’s content script to detect the product (same path as the M pill, without overlay). */
function brandLineFromProduct(
  product: Product | null,
  productName: string,
): string {
  if (product?.brand?.trim()) return `${product.brand.trim()}`;
  if (product?.url) {
    try {
      const host = new URL(product.url).hostname.replace(/^www\./i, "");
      if (host && productName !== "No product detected")
        return `${host} · this tab`;
    } catch {
      /* ignore invalid url */
    }
  }
  return "Open a product page · use the Mirror control on the right edge";
}

async function requestDetectionFromActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab?.id || !tab.url) return;
    const { url } = tab;
    if (!url.startsWith("http://") && !url.startsWith("https://")) return;
    await chrome.tabs.sendMessage(tab.id, { type: "mirror:runDetection" });
  } catch {
    /* No content script (restricted URL, chrome://, etc.) — user can still use the M pill. */
  }
}

type TryOnGarmentSource =
  | { kind: "saved"; garment: SavedGarment }
  | {
      kind: "pdp";
      imageUrl: string;
      name: string;
      brand: string | undefined;
      category: GarmentCategory;
      pageUrl: string;
      price: number | undefined;
    };

function buildPdpGarmentPreview(
  p: Product | null,
  normalizedImageUrl: string,
  category: GarmentCategory,
): PdpGarmentPreview | null {
  if (!p || !normalizedImageUrl.trim()) return null;
  return {
    imageUrl: normalizedImageUrl,
    name: p.name,
    brand: p.brand,
    category,
    pageUrl: p.url,
    price: p.price,
  };
}

function effectiveTryOnGarmentSource(
  active: GarmentCategory,
  top: SavedGarment | null,
  bottom: SavedGarment | null,
  pdp: PdpGarmentPreview | null,
): TryOnGarmentSource | null {
  if (active === "top") {
    if (top) return { kind: "saved", garment: top };
    if (pdp?.category === "top") {
      return {
        kind: "pdp",
        imageUrl: pdp.imageUrl,
        name: pdp.name,
        brand: pdp.brand,
        category: pdp.category,
        pageUrl: pdp.pageUrl,
        price: pdp.price,
      };
    }
    if (bottom) return { kind: "saved", garment: bottom };
    return null;
  }
  if (bottom) return { kind: "saved", garment: bottom };
  if (pdp?.category === "bottom") {
    return {
      kind: "pdp",
      imageUrl: pdp.imageUrl,
      name: pdp.name,
      brand: pdp.brand,
      category: pdp.category,
      pageUrl: pdp.pageUrl,
      price: pdp.price,
    };
  }
  if (top) return { kind: "saved", garment: top };
  return null;
}

export function App() {
  const [activeTab, setActiveTab] = useState<SidePanelTab>("home");
  const [tabHydrated, setTabHydrated] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "result" | "error">(
    "idle",
  );
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // priceIntel state retained — the try-on flow still calls setPriceIntel after
  // a successful generation; reintroducing a Price tile/tab later won't need a
  // backend or fetch change.
  const [, setPriceIntel] = useState<Record<string, unknown> | null>(null);
  const [posted, setPosted] = useState(false);
  const [lastSharedPostId, setLastSharedPostId] = useState<string | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [tryonResultId, setTryonResultId] = useState<string | null>(null);
  /** Last FASHN primary result id — editorial API must source from this, not a derivative row. */
  const [tryonPrimaryResultId, setTryonPrimaryResultId] = useState<string | null>(
    null,
  );
  const [editorialBusy, setEditorialBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [referenceStatus, setReferenceStatus] =
    useState<ReferenceStatus>("loading");
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [pdpGarmentCategory, setPdpGarmentCategory] =
    useState<GarmentCategory>("top");
  const [savedGarments, setSavedGarments] = useState<SavedGarment[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<GarmentListFilter>("top");
  const [referenceOverrideResultId, setReferenceOverrideResultId] = useState<
    string | null
  >(null);
  const [referenceModelPreviewUrl, setReferenceModelPreviewUrl] = useState<
    string | null
  >(null);
  const [recentTryOnModelPicks, setRecentTryOnModelPicks] = useState<
    { id: string; thumbUrl: string }[]
  >([]);
  const [selectedTop, setSelectedTop] = useState<SavedGarment | null>(null);
  const [selectedBottom, setSelectedBottom] = useState<SavedGarment | null>(
    null,
  );
  const [activeGarment, setActiveGarment] = useState<GarmentCategory>("top");
  const [wishlistSaved, setWishlistSaved] = useState(false);
  const [wishlistSaving, setWishlistSaving] = useState(false);
  const [wishlistMessage, setWishlistMessage] = useState<string | null>(null);
  const [pdpIsOwned, setPdpIsOwned] = useState(false);
  const [ownedSaving, setOwnedSaving] = useState(false);
  const [ownedMessage, setOwnedMessage] = useState<string | null>(null);
  type FitScorePhase =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "empty_closet"; cta: string }
    | { kind: "result"; result: FitScoreResult }
    | { kind: "error"; message: string };
  const [fitScorePhase, setFitScorePhase] = useState<FitScorePhase>({
    kind: "idle",
  });
  /** Bumps when user taps Home "Worn by" strip — WornByView only runs reverse search after this (or Search now). Reset on PDP change. */
  const [wornByFetchNonce, setWornByFetchNonce] = useState(0);
  /** Snapshot of the last reverse-search result for the current PDP. Drives
   *  the Home strip count without forcing a refetch on tab-switch. Persisted
   *  to chrome.storage.session, keyed by canonical_url_hash, so flipping
   *  Home → Worn by → Home preserves the count badge. */
  type WornByResult = {
    canonical_url_hash: string;
    mirror_count: number;
    web_count: number;
  };
  const [wornByResult, setWornByResult] = useState<WornByResult | null>(null);

  useEffect(() => {
    void chrome.storage.local.get(EXT_TAB_STORAGE_KEY).then((raw) => {
      const blob = raw[EXT_TAB_STORAGE_KEY];
      if (
        blob &&
        typeof blob === "object" &&
        blob !== null &&
        "activeTab" in blob
      ) {
        const t = (blob as { activeTab: unknown }).activeTab;
        if (typeof t === "string" && isSidePanelTab(t)) setActiveTab(t);
      }
      setTabHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!tabHydrated) return;
    void chrome.storage.local.set({
      [EXT_TAB_STORAGE_KEY]: { version: 1, activeTab },
    });
  }, [activeTab, tabHydrated]);

  useEffect(() => {
    setWishlistSaved(false);
    setWishlistMessage(null);
  }, [product?.url]);

  useEffect(() => {
    setOwnedMessage(null);
  }, [product?.url]);

  // Reset fit score whenever the PDP changes so it doesn't carry over from the prior product.
  useEffect(() => {
    setFitScorePhase({ kind: "idle" });
  }, [product?.url]);

  useEffect(() => {
    setWornByFetchNonce(0);
  }, [product?.url]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      setPdpIsOwned(false);
      const url = product?.url?.trim();
      if (!url || !session?.user?.id) return;
      try {
        const sb = createExtensionSupabase();
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user || cancelled) return;
        const hash = await canonicalUrlHash(url);
        const { data, error } = await sb
          .from("closet_items")
          .select("products(canonical_url_hash)")
          .eq("user_id", user.id)
          .eq("kind", "owned");
        if (cancelled || error) return;
        for (const row of data ?? []) {
          const raw = row.products as
            | { canonical_url_hash?: string }
            | { canonical_url_hash?: string }[]
            | null
            | undefined;
          const prod = Array.isArray(raw) ? raw[0] : raw;
          if (prod?.canonical_url_hash === hash) {
            setPdpIsOwned(true);
            return;
          }
        }
      } catch {
        /* ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [product?.url, session?.user?.id]);

  // Hydrate the persisted Worn-by result on PDP change so the Home strip
  // shows the last known count without forcing a refetch. Storage is session-
  // scoped (cleared on browser close) to avoid stale counts leaking across
  // days.
  useEffect(() => {
    const url = product?.url?.trim();
    if (!url) {
      setWornByResult(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const hash = await canonicalUrlHash(url);
        const raw = await chrome.storage.session.get("mirror_ext_wornby_v1");
        if (cancelled) return;
        const blob = raw["mirror_ext_wornby_v1"] as WornByResult | undefined;
        if (
          blob &&
          typeof blob === "object" &&
          blob.canonical_url_hash === hash
        ) {
          setWornByResult(blob);
        } else {
          setWornByResult(null);
        }
      } catch {
        if (!cancelled) setWornByResult(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product?.url]);

  useEffect(() => {
    const next = inferGarmentBucketFromPdp({
      name: product?.name ?? "",
      url: product?.url ?? "",
      category: product?.category,
    });
    setPdpGarmentCategory(next);
    setActiveGarment(next);
  }, [product?.url, product?.name, product?.category]);

  const loadSessionProduct = useCallback(async () => {
    const { mirrorProduct } = await chrome.storage.session.get("mirrorProduct");
    if (mirrorProduct && typeof mirrorProduct === "object") {
      setProduct(mirrorProduct as Product);
    }
  }, []);

  const loadWishlist = useCallback(async () => {
    if (!session?.user?.id) return;
    setSavedLoading(true);
    setSavedError(null);
    try {
      const sb = createExtensionSupabase();
      const { data, error: qErr } = await sb
        .from("closet_items")
        .select(
          `
          id,
          product_id,
          products (
            id,
            name,
            brand,
            category,
            primary_image_url,
            price_usd
          )
        `,
        )
        .eq("kind", "wishlist")
        .not("product_id", "is", null)
        .order("created_at", { ascending: false });

      if (qErr) {
        setSavedError(qErr.message);
        setSavedGarments([]);
        return;
      }

      const rows = (data ?? []) as Array<{
        id: string;
        product_id: string | null;
        products: unknown;
      }>;
      const out: SavedGarment[] = [];
      for (const row of rows) {
        if (!row.product_id) continue;
        const raw = row.products;
        const p = Array.isArray(raw) ? raw[0] : raw;
        if (!p || typeof p !== "object") continue;
        const prod = p as Record<string, unknown>;
        const pid =
          typeof prod.id === "string" ? prod.id : String(prod.id ?? "");
        const img =
          typeof prod.primary_image_url === "string"
            ? prod.primary_image_url.trim()
            : "";
        if (!pid || !img) continue;
        const bucket = normalizeClosetGarmentBucket(prod.category);
        const nameRaw = typeof prod.name === "string" ? prod.name.trim() : "";
        const brandRaw =
          typeof prod.brand === "string" ? prod.brand.trim() : "";
        const priceRaw = prod.price_usd;
        const priceUsd =
          typeof priceRaw === "number" && Number.isFinite(priceRaw)
            ? priceRaw
            : null;
        out.push({
          closetItemId: row.id,
          productId: pid,
          name: nameRaw || "Saved item",
          brand: brandRaw || null,
          imageUrl: normalizeProductImageUrl(img),
          bucket,
          priceUsd,
        });
      }
      setSavedGarments(out);
      setSelectedTop((t) => {
        if (!t) return null;
        return out.find((g) => g.closetItemId === t.closetItemId) ?? null;
      });
      setSelectedBottom((b) => {
        if (!b) return null;
        return out.find((g) => g.closetItemId === b.closetItemId) ?? null;
      });
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : "Could not load closet");
      setSavedGarments([]);
    } finally {
      setSavedLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (activeTab !== "tryon" && activeTab !== "home") return;
    void loadWishlist();
  }, [activeTab, session?.user?.id, loadWishlist]);

  useEffect(() => {
    if (activeTab !== "tryon" || !session?.user?.id) {
      setRecentTryOnModelPicks([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const sb = createExtensionSupabase();
      const { data, error } = await sb
        .from("tryon_results")
        .select("id, thumbnail_storage_path")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .order("generated_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (error || !data?.length) {
        setRecentTryOnModelPicks([]);
        return;
      }
      const picks: { id: string; thumbUrl: string }[] = [];
      for (const row of data) {
        const tp = row.thumbnail_storage_path;
        if (typeof tp !== "string" || !tp.trim()) continue;
        const { data: signed } = await sb.storage
          .from("tryon-results")
          .createSignedUrl(tp.trim(), 600);
        const u = signed?.signedUrl;
        if (typeof u === "string")
          picks.push({ id: String(row.id), thumbUrl: u });
      }
      if (!cancelled) setRecentTryOnModelPicks(picks);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, session?.user?.id]);

  useEffect(() => {
    void loadSessionProduct();
    const t = setInterval(() => void loadSessionProduct(), 800);
    return () => clearInterval(t);
  }, [loadSessionProduct]);

  useEffect(() => {
    if (!session) return;
    void (async () => {
      await requestDetectionFromActiveTab();
      await loadSessionProduct();
    })();
  }, [session, loadSessionProduct]);

  useEffect(() => {
    if (!session?.user?.id) {
      setReferenceStatus("missing");
      setAvatarImageUrl(null);
      return;
    }
    let cancelled = false;
    setReferenceStatus("loading");
    setAvatarImageUrl(null);
    const sb = createExtensionSupabase();
    void (async () => {
      const { data: ref, error } = await sb
        .from("reference_photos")
        .select("storage_path, preprocessed_storage_path")
        .eq("user_id", session.user.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !ref?.storage_path) {
        setReferenceStatus("missing");
        setAvatarImageUrl(null);
        return;
      }
      const row = ref as {
        storage_path: string;
        preprocessed_storage_path: string | null;
      };
      const { data: signed, error: signErr } = await sb.storage
        .from("reference-photos")
        .createSignedUrl(row.storage_path, 3600);
      if (cancelled) return;
      if (signErr || !signed?.signedUrl) {
        setReferenceStatus("missing");
        setAvatarImageUrl(null);
        return;
      }
      setReferenceStatus("ready");

      const prePath =
        typeof row.preprocessed_storage_path === "string"
          ? row.preprocessed_storage_path.trim()
          : "";
      if (!prePath) {
        if (!cancelled) setAvatarImageUrl(null);
        return;
      }
      const { data: preSigned, error: preErr } = await sb.storage
        .from("reference-photos")
        .createSignedUrl(prePath, 3600);
      if (cancelled) return;
      if (preErr || !preSigned?.signedUrl) {
        setAvatarImageUrl(null);
        return;
      }
      setAvatarImageUrl(preSigned.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const sb = createExtensionSupabase();
    void sb.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      if (s?.access_token) void refreshCatalogRulesInBackground(s.access_token);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      if (sess?.access_token)
        void refreshCatalogRulesInBackground(sess.access_token);
    });
    return () => {
      void sub.subscription.unsubscribe();
    };
  }, []);

  const normalizedProductImage = useMemo(
    () => (product?.image ? normalizeProductImageUrl(product.image) : ""),
    [product?.image],
  );
  const pdpGarmentPreview = useMemo(
    () =>
      buildPdpGarmentPreview(
        product,
        normalizedProductImage,
        pdpGarmentCategory,
      ),
    [product, normalizedProductImage, pdpGarmentCategory],
  );
  const effectiveGarmentSource = useMemo(
    () =>
      effectiveTryOnGarmentSource(
        activeGarment,
        selectedTop,
        selectedBottom,
        pdpGarmentPreview,
      ),
    [activeGarment, selectedTop, selectedBottom, pdpGarmentPreview],
  );

  const fitScoreTile = useMemo(() => {
    switch (fitScorePhase.kind) {
      case "idle":
        return { kind: "idle" as const };
      case "loading":
        return { kind: "loading" as const };
      case "empty_closet":
        return { kind: "empty_closet" as const };
      case "result":
        return {
          kind: "result" as const,
          score: fitScorePhase.result.overall_score,
          colorScore: fitScorePhase.result.breakdown.color_palette,
        };
      case "error":
        return { kind: "error" as const };
    }
  }, [fitScorePhase]);

  const savedGarmentThumbs = useMemo(
    () =>
      savedGarments.map((g) => ({
        closetItemId: g.closetItemId,
        name: g.name,
        imageUrl: g.imageUrl,
      })),
    [savedGarments],
  );

  async function signInExtension(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      const sb = createExtensionSupabase();
      const { data, error: err } = await sb.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        return;
      }
      if (data.session?.access_token) {
        await refreshCatalogRulesInBackground(data.session.access_token);
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function signOutExtension() {
    const sb = createExtensionSupabase();
    await sb.auth.signOut();
    setSession(null);
    setReferenceStatus("missing");
    setAvatarImageUrl(null);
    setSavedGarments([]);
    setSavedError(null);
    setSelectedTop(null);
    setSelectedBottom(null);
    setReferenceOverrideResultId(null);
    setReferenceModelPreviewUrl(null);
    setRecentTryOnModelPicks([]);
  }

  const pickReferenceModel = async (id: string) => {
    const sb = createExtensionSupabase();
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { data, error } = await sb
      .from("tryon_results")
      .select("storage_path")
      .eq("id", id)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data?.storage_path) return;
    const sp = String(data.storage_path).trim();
    if (!sp) return;
    const { data: signed } = await sb.storage
      .from("tryon-results")
      .createSignedUrl(sp, 600);
    const u = signed?.signedUrl;
    if (typeof u !== "string") return;
    setReferenceOverrideResultId(id);
    setReferenceModelPreviewUrl(u);
  };

  const fetchPrice = async (token: string, price?: number, brand?: string) => {
    const u = new URL(`${apiBase}/api/v1/intelligence/price/mock`);
    if (price != null && Number.isFinite(price))
      u.searchParams.set("price_usd", String(price));
    if (brand?.trim()) u.searchParams.set("brand", brand.trim());
    const r = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setPriceIntel((await r.json()) as Record<string, unknown>);
  };

  const runTryOn = async () => {
    const src = effectiveGarmentSource;
    if (!src) {
      setError(
        "Pick a saved garment, this page’s product, or open a PDP with an image.",
      );
      setPhase("error");
      return;
    }
    setPhase("loading");
    setError(null);
    setTryonPrimaryResultId(null);
    try {
      const supabase = createExtensionSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Sign in with the same email/password as the web app.");
        setPhase("error");
        return;
      }
      const body: TryOnSubmitBody =
        src.kind === "saved"
          ? {
              product_id: src.garment.productId,
              product_metadata: {
                name: src.garment.name,
                brand: src.garment.brand ?? undefined,
                category: src.garment.bucket,
              },
            }
          : {
              product_image_url: src.imageUrl,
              product_metadata: {
                name: src.name,
                brand: src.brand,
                category: src.category,
                page_url: src.pageUrl,
              },
            };
      if (referenceOverrideResultId) {
        body.model_reference_tryon_result_id = referenceOverrideResultId;
      }
      const res = await submitTryOn(apiBase, token, body);
      if (res.cache_hit && res.result) {
        setResultUrl(res.result.signed_url);
        setTryonResultId(res.result.id);
        setTryonPrimaryResultId(res.result.id);
        setPhase("result");
        await fetchPrice(
          token,
          src.kind === "saved"
            ? (src.garment.priceUsd ?? undefined)
            : src.price,
          src.kind === "saved" ? (src.garment.brand ?? undefined) : src.brand,
        );
        return;
      }
      const jobId = res.job_id;
      const row = await waitForTryOnJob(supabase, jobId, {
        timeoutMs: 300_000,
        pollIntervalMs: 1500,
      });
      if (row.status !== "completed") {
        throw new Error(row.error_message ?? "Try-on failed");
      }
      const st = await supabase.auth.getSession();
      const t2 = st.data.session?.access_token;
      if (!t2) throw new Error("Session lost");
      const poll = await fetch(`${apiBase}/api/v1/tryon/${jobId}`, {
        headers: { Authorization: `Bearer ${t2}` },
      });
      if (!poll.ok) {
        throw new Error(await mirrorApiHttpErrorMessage(poll, "Try-on result"));
      }
      const pollBody = (await poll.json()) as {
        result?: { signed_url: string; id: string };
      };
      if (!pollBody.result?.signed_url) throw new Error("No result image");
      setResultUrl(pollBody.result.signed_url);
      setTryonResultId(pollBody.result.id);
      setTryonPrimaryResultId(pollBody.result.id);
      setPhase("result");
      await fetchPrice(
        t2,
        src.kind === "saved" ? (src.garment.priceUsd ?? undefined) : src.price,
        src.kind === "saved" ? (src.garment.brand ?? undefined) : src.brand,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try-on error");
      setPhase("error");
    }
  };

  const runEditorialPose = async () => {
    const sourceId = tryonPrimaryResultId;
    if (!sourceId) return;
    setEditorialBusy(true);
    setError(null);
    try {
      const supabase = createExtensionSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Sign in with the same email/password as the web app.");
        return;
      }
      const sub = await submitTryOnEditorialJob(apiBase, token, {
        source_result_id: sourceId,
      });
      const row = await waitForTryOnEditorialJob(apiBase, token, sub.job_id, {
        timeoutMs: 180_000,
        pollIntervalMs: 1500,
      });
      if (row.status !== "completed" || !row.result?.signed_url) {
        throw new Error(row.error_message ?? "Editorial enhancement failed");
      }
      setResultUrl(row.result.signed_url);
      setTryonResultId(row.result.id);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Editorial error");
    } finally {
      setEditorialBusy(false);
    }
  };

  const handleSaveToCloset = async () => {
    const p = product;
    if (!p?.url?.trim()) {
      setWishlistMessage("No product URL to save.");
      return;
    }
    const supabase = createExtensionSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setWishlistMessage("Sign in to save items to your closet.");
      return;
    }
    const imageUrl = p.image ? normalizeProductImageUrl(p.image) : "";
    setWishlistSaving(true);
    setWishlistMessage(null);
    try {
      const out = await saveToWishlist(apiBase, token, {
        url: p.url,
        extracted: {
          name: p.name,
          image: imageUrl || undefined,
          brand: p.brand,
          price: p.price,
          category: pdpGarmentCategory,
        },
      });
      setWishlistSaved(true);
      setWishlistMessage(
        out.already_saved
          ? "Already in your closet (Saved)."
          : "Saved to My Closet.",
      );
      void loadWishlist();
    } catch (e) {
      setWishlistSaved(false);
      setWishlistMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setWishlistSaving(false);
    }
  };

  const handleCheckFitScore = useCallback(async () => {
    const p = product;
    if (!p?.url?.trim()) {
      setFitScorePhase({ kind: "error", message: "No product to score." });
      return;
    }
    const supabase = createExtensionSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setFitScorePhase({ kind: "error", message: "Sign in to score fit." });
      return;
    }
    setFitScorePhase({ kind: "loading" });
    const imageUrl = p.image ? normalizeProductImageUrl(p.image) : "";
    try {
      const submit = await submitFitScore(apiBase, token, {
        url: p.url,
        extracted: {
          name: p.name,
          image: imageUrl || undefined,
          brand: p.brand,
          price: p.price,
          category: pdpGarmentCategory,
        },
      });
      if (submit.status === "empty_closet") {
        setFitScorePhase({ kind: "empty_closet", cta: submit.cta });
        return;
      }
      if (submit.status === "completed" && submit.cache_hit) {
        setFitScorePhase({ kind: "result", result: submit.result });
        return;
      }
      const jobId = submit.job_id;
      const row = await waitForFitScoreJob(supabase, jobId, {
        timeoutMs: 120_000,
        pollIntervalMs: 1500,
      });
      if (row.status !== "completed") {
        throw new Error(row.error_message ?? "Fit score failed");
      }
      const { data: refreshed } = await supabase.auth.getSession();
      const t2 = refreshed.session?.access_token;
      if (!t2) throw new Error("Session lost");
      const poll = await pollFitScoreJob(apiBase, t2, jobId);
      if (!poll.result) throw new Error("No fit score result");
      setFitScorePhase({ kind: "result", result: poll.result });
    } catch (e) {
      setFitScorePhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Fit score failed",
      });
    }
  }, [product, pdpGarmentCategory]);

  const handleSaveToOwned = async () => {
    const p = product;
    if (!p?.url?.trim()) {
      setOwnedMessage("No product URL.");
      return;
    }
    const supabase = createExtensionSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setOwnedMessage("Sign in to mark items as owned.");
      return;
    }
    const imageUrl = p.image ? normalizeProductImageUrl(p.image) : "";
    setOwnedSaving(true);
    setOwnedMessage(null);
    try {
      const out = await saveToOwned(apiBase, token, {
        url: p.url,
        extracted: {
          name: p.name,
          image: imageUrl || undefined,
          brand: p.brand,
          price: p.price,
          category: pdpGarmentCategory,
        },
      });
      setPdpIsOwned(true);
      setOwnedMessage(
        out.already_saved
          ? "Already marked as owned in your closet."
          : "Marked as owned in your closet.",
      );
    } catch (e) {
      setOwnedMessage(e instanceof Error ? e.message : "Could not save");
    } finally {
      setOwnedSaving(false);
    }
  };

  const shareToFeed = async () => {
    const src = effectiveGarmentSource;
    const captionName =
      src?.kind === "saved"
        ? src.garment.name
        : src?.kind === "pdp"
          ? src.name
          : (product?.name ?? null);
    if (!resultUrl || !captionName?.trim()) return;
    const supabase = createExtensionSupabase();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;
    const { data: inserted, error: insErr } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        image_url: resultUrl,
        caption: `Fit check: ${captionName}`.slice(0, 280),
        visibility: "public",
        moderation_status: "approved",
        tryon_result_id: tryonResultId,
      })
      .select("id")
      .single();
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setPosted(true);
    setLastSharedPostId(typeof inserted?.id === "string" ? inserted.id : null);
    setFeedRefreshKey((k) => k + 1);
  };

  if (!session) {
    return (
      <PanelFrame>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SignInView
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={(e) => void signInExtension(e)}
            error={error}
            signingIn={signingIn}
            onClose={() => closeMirrorUi()}
          />
        </div>
      </PanelFrame>
    );
  }

  const productName = product?.name ?? "No product detected";
  const feedViewProps: FeedViewProps = {
    posted,
    lastSharedPostId,
    lastTryOnImageUrl: resultUrl ?? "",
    refreshKey: feedRefreshKey,
  };
  const brandLine = brandLineFromProduct(product, productName);
  const priceLabel = formatPrice(product?.price);

  const hasProductImage = Boolean(normalizedProductImage.trim());
  const displayProductImage = hasProductImage
    ? normalizedProductImage
    : undefined;

  const tryOnDisabled = !session || !effectiveGarmentSource;
  const tryOnGenerateDisabled = tryOnDisabled || referenceStatus !== "ready";
  const tryOnCtaDisabled =
    tryOnDisabled || phase === "loading" || referenceStatus !== "ready";

  function handleTryOnMe() {
    setActiveTab("tryon");
    if (hasProductImage) {
      setListFilter("this_page");
    }
    const next = inferGarmentBucketFromPdp({
      name: product?.name ?? "",
      url: product?.url ?? "",
      category: product?.category,
    });
    setPdpGarmentCategory(next);
    setActiveGarment(next);
  }

  return (
    <PanelFrame>
      {import.meta.env.DEV ? (
        <div className="flex shrink-0 justify-center">
          <DevTabBar active={activeTab} onChange={setActiveTab} />
        </div>
      ) : null}

      <AppHeader
        variant="home"
        onNotifications={() => {}}
        onProfile={() => {
          if (
            session &&
            window.confirm("Sign out of Mirror in this extension?")
          )
            void signOutExtension();
        }}
        onClose={() => closeMirrorUi()}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {activeTab === "home" ? (
          <HomeView
            productName={productName}
            brandLine={brandLine}
            priceLabel={priceLabel}
            productImage={displayProductImage}
            missingProductImageHint={!hasProductImage}
            tryOnCtaDisabled={tryOnCtaDisabled}
            tryOnCtaBusy={phase === "loading"}
            onTryOnMe={handleTryOnMe}
            onCircleTab={() => setActiveTab("circle")}
            onSaveToCloset={() => void handleSaveToCloset()}
            saveToClosetDisabled={!product?.url?.trim()}
            saveToClosetBusy={wishlistSaving}
            saveToClosetSaved={wishlistSaved}
            saveToClosetMessage={wishlistMessage}
            pdpIsOwned={pdpIsOwned}
            onMarkOwned={() => void handleSaveToOwned()}
            ownedDisabled={!product?.url?.trim()}
            ownedBusy={ownedSaving}
            ownedMessage={ownedMessage}
            fitScore={fitScoreTile}
            onCheckFitScore={() => void handleCheckFitScore()}
            checkFitScoreDisabled={
              !product?.url?.trim() || fitScorePhase.kind === "loading"
            }
            wornBy={
              wornByResult
                ? {
                    kind: "result",
                    count:
                      wornByResult.mirror_count + wornByResult.web_count,
                  }
                : { kind: "idle" }
            }
            onWornByPress={() => {
              setWornByFetchNonce((n) => n + 1);
              setActiveTab("wornby");
            }}
            recentSaved={savedGarments.slice(0, 3).map((g) => ({
              id: g.closetItemId,
              imageUrl: g.imageUrl,
            }))}
            onSeeAllSaved={() => setActiveTab("tryon")}
          />
        ) : null}
        {activeTab === "tryon" ? (
          <TryOnView
            phase={phase}
            resultUrl={resultUrl}
            error={error}
            referenceStatus={referenceStatus}
            avatarTileDisplayUrl={referenceModelPreviewUrl ?? avatarImageUrl}
            savedGarments={savedGarments}
            savedLoading={savedLoading}
            savedError={savedError}
            listFilter={listFilter}
            onListFilterChange={setListFilter}
            hasProductImage={hasProductImage}
            productLabel={productName}
            pdpGarment={pdpGarmentPreview}
            onSelectThisPageGarment={() => {
              setActiveGarment(pdpGarmentCategory);
            }}
            selectedTop={selectedTop}
            selectedBottom={selectedBottom}
            activeGarment={activeGarment}
            onActiveGarmentChange={setActiveGarment}
            onSelectSavedGarment={(g) => {
              if (g.bucket === "top") {
                setSelectedTop((t) =>
                  t?.closetItemId === g.closetItemId ? null : g,
                );
                setActiveGarment("top");
              } else {
                setSelectedBottom((b) =>
                  b?.closetItemId === g.closetItemId ? null : g,
                );
                setActiveGarment("bottom");
              }
            }}
            onClearSlot={(slot) => {
              if (slot === "top") {
                setSelectedTop(null);
                if (activeGarment === "top" && selectedBottom)
                  setActiveGarment("bottom");
              } else {
                setSelectedBottom(null);
                if (activeGarment === "bottom" && selectedTop)
                  setActiveGarment("top");
              }
            }}
            pdpGarmentCategory={pdpGarmentCategory}
            onPdpGarmentCategoryChange={setPdpGarmentCategory}
            recentModelPicks={recentTryOnModelPicks}
            referenceModelOverrideActive={Boolean(referenceOverrideResultId)}
            onPickReferenceModel={(id) => pickReferenceModel(id)}
            onClearReferenceModel={() => {
              setReferenceOverrideResultId(null);
              setReferenceModelPreviewUrl(null);
            }}
            onRunTryOn={() => void runTryOn()}
            onRegenerate={() => void runTryOn()}
            onEditorialPose={() => void runEditorialPose()}
            editorialBusy={editorialBusy}
            showEditorialCta={Boolean(tryonPrimaryResultId)}
            onShareToFeed={() => void shareToFeed()}
            posted={posted}
            generateDisabled={tryOnGenerateDisabled}
            regenerateDisabled={tryOnGenerateDisabled}
          />
        ) : null}
        {activeTab === "circle" ? (
          <CircleView
            productUrl={product?.url}
            productName={product?.name}
            normalizedProductImage={normalizedProductImage}
            posted={posted}
            lastTryOnImageUrl={resultUrl ?? ""}
            onGoTryOn={() => setActiveTab("tryon")}
          />
        ) : null}
        {activeTab === "fit" ? (
          <FitScoreView
            phase={fitScorePhase}
            canCheck={
              Boolean(product?.url?.trim()) && fitScorePhase.kind !== "loading"
            }
            onCheck={() => void handleCheckFitScore()}
            savedGarments={savedGarmentThumbs}
          />
        ) : null}
        {activeTab === "wornby" ? (
          <WornByView
            key={product?.url ?? ""}
            productUrl={product?.url}
            productName={productName}
            apiBase={apiBase}
            fetchNonce={wornByFetchNonce}
            productExtracted={
              product
                ? {
                    name: product.name,
                    image: product.image,
                    brand: product.brand,
                    price: product.price,
                    category: product.category,
                  }
                : undefined
            }
            tryOnDisabled={tryOnCtaDisabled}
            onTryOnProduct={() => {
              setActiveTab("tryon");
              void handleTryOnMe();
            }}
            onResultsChange={({
              mirror_count,
              web_count,
              canonical_url_hash,
            }) => {
              if (!canonical_url_hash) return;
              const next = { canonical_url_hash, mirror_count, web_count };
              setWornByResult(next);
              void chrome.storage.session
                .set({ mirror_ext_wornby_v1: next })
                .catch(() => undefined);
            }}
          />
        ) : null}
        {activeTab === "feed" ? <FeedView {...feedViewProps} /> : null}
      </div>

      <BottomNav active={activeTab} onChange={(t) => setActiveTab(t)} />
    </PanelFrame>
  );
}
