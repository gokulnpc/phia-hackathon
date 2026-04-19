import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const chromeStorage = {
  getItem: async (key: string) => {
    const v = await chrome.storage.local.get(key);
    return (v[key] as string | undefined) ?? null;
  },
  setItem: async (key: string, value: string) => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string) => {
    await chrome.storage.local.remove(key);
  },
};

/** One shared client per extension page — multiple `createClient` calls spawn multiple GoTrueClients and trigger Supabase warnings. */
let clientSingleton: SupabaseClient | null = null;

export function createExtensionSupabase(): SupabaseClient {
  if (!url || !anon) {
    throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the extension build.");
  }
  if (!clientSingleton) {
    clientSingleton = createClient(url, anon, {
      auth: {
        storage: chromeStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return clientSingleton;
}
