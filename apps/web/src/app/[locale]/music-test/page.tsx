import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export default async function MusicTestRedirectPage() {
  redirect({ href: "/music-create", locale: await getLocale() });
}
