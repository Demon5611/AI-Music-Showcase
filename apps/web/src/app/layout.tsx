import "./globals.css";

type RootLayoutProps = {
  children: React.ReactNode;
};

/**
 * Root layout required by Next.js.
 * Document shell (`html`/`body`) lives in `[locale]/layout.tsx`.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return children;
}
