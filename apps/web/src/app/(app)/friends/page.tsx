import { redirect } from "next/navigation";

/** Legacy URL — Circle is the primary route (extension parity). */
export default function FriendsPage() {
  redirect("/circle");
}
