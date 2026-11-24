import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

/** The admin panel opens on «الحسابات». */
export default function AdminHome() {
  redirect(ROUTES.adminAccounts.href);
}
