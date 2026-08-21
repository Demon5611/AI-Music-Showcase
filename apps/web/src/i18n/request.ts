import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const baseMessages = (await import(`../../messages/${locale}.json`)).default;
  const legalMessages = (await import(`../../messages/legal/${locale}.json`)).default;

  return {
    locale,
    messages: {
      ...baseMessages,
      Legal: legalMessages,
    },
  };
});
