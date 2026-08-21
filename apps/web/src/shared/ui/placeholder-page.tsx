import { Link } from "@/i18n/navigation";
import { appShell } from "@/shared/theme/app-theme";

interface PlaceholderPageProps {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}

export function PlaceholderPage({
  title,
  description,
  actionHref,
  actionLabel,
}: PlaceholderPageProps) {
  return (
    <section className={appShell.placeholderPage}>
      <h1 className={appShell.placeholderPageTitle}>{title}</h1>
      <p className={appShell.placeholderPageDescription}>{description}</p>
      {actionHref && actionLabel ? (
        <Link className={appShell.formSubmit} href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}
