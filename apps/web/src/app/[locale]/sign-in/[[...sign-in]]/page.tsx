import { SignIn } from "@clerk/nextjs";
import { getLocale } from "next-intl/server";
import { env } from "@/shared/config/env";
import { redirect } from "@/i18n/navigation";
import { appShell } from "@/shared/theme/app-theme";

export default async function SignInPage() {
  if (!env.isClerkEnabled) {
    redirect({ href: "/profile", locale: await getLocale() });
  }

  return (
    <main className={appShell.authPage}>
      <SignIn />
    </main>
  );
}
