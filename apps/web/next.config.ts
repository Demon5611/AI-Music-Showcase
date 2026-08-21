import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@waveform-playlist/browser",
    "@waveform-playlist/playout",
    "@waveform-playlist/engine",
    "tone",
    "three",
    "@react-three/fiber",
    "@react-three/drei",
  ],
};

export default withNextIntl(nextConfig);
