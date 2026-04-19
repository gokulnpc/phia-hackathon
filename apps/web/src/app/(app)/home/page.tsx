import { redirect } from "next/navigation";

/** Legacy URL — Feed is the app home. */
export default function HomeRedirectPage() {
  redirect("/feed");
}
