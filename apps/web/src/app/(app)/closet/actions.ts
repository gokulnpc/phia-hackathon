"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClosetDeleteSource = "tried" | "wishlist" | "owned";

export async function deleteClosetItem(
  source: ClosetDeleteSource,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Invalid item" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Session expired. Sign in again." };
  }

  if (source === "tried") {
    const { error } = await supabase
      .from("tryon_results")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const kind = source === "wishlist" ? "wishlist" : "owned";
    const { error } = await supabase
      .from("closet_items")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("kind", kind);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  revalidatePath("/closet");
  revalidatePath(`/closet/tried/${id}`);
  revalidatePath(`/closet/wishlist/${id}`);
  revalidatePath(`/closet/owned/${id}`);
  revalidatePath("/closet", "layout");
  return { ok: true };
}
