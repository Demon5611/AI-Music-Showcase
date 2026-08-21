import en from "../../messages/en.json";
import legalEn from "../../messages/legal/en.json";

type Messages = typeof en & { Legal: typeof legalEn };

declare module "next-intl" {
  interface AppConfig {
    Locale: "en" | "ru" | "ka";
    Messages: Messages;
  }
}
