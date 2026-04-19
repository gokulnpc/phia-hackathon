import { redirect } from "next/navigation";
import { MirrorSidebar } from "@/components/mirror/MirrorSidebar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-bg">
      <MirrorSidebar userEmail={user.email ?? ""} />
      <main className="min-h-screen min-w-0 w-full pl-16 md:pl-[260px]">{children}</main>
    </div>
  );
}
