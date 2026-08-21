import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./orbital-loader.module.css";

const CIRCLE_COUNT = 16;
const BASE_DURATION_SECONDS = 12;
const MIN_DURATION_SECONDS = 1.5;

type OrbitalCircleStyle = CSSProperties & {
  "--circle-size": string;
  "--circle-offset": string;
  "--circle-duration": string;
  "--circle-direction": "normal" | "reverse";
};

function buildOrbitalCircles() {
  const step = 100 / CIRCLE_COUNT;

  return Array.from({ length: CIRCLE_COUNT }, (_, index) => {
    const sizePercent = 100 - step * index;
    const offsetPercent = (100 - sizePercent) / 2;
    const durationSeconds = Math.max(
      MIN_DURATION_SECONDS,
      BASE_DURATION_SECONDS / (index + 1),
    );
    const isDashed = (index + 1) % 2 === 0;
    const direction = index % 3 === 0 ? "reverse" : "normal";

    const style: OrbitalCircleStyle = {
      "--circle-size": `${sizePercent}%`,
      "--circle-offset": `${offsetPercent}%`,
      "--circle-duration": `${durationSeconds}s`,
      "--circle-direction": direction,
    };

    return {
      index,
      isDashed,
      style,
    };
  });
}

const ORBITAL_CIRCLES = buildOrbitalCircles();

export type OrbitalLoaderSize = "large" | "compact";

interface OrbitalLoaderVisualProps {
  size?: OrbitalLoaderSize;
  className?: string;
}

/** Decorative 3D orbital rings — single animation implementation. */
export function OrbitalLoaderVisual({
  size = "large",
  className,
}: OrbitalLoaderVisualProps) {
  return (
    <div
      className={cn(
        styles.visual,
        size === "compact" ? styles.visualCompact : styles.visualLarge,
        className,
      )}
      aria-hidden="true"
    >
      <div className={styles.stage}>
        {ORBITAL_CIRCLES.map((circle) => (
          <span
            key={circle.index}
            className={circle.isDashed ? `${styles.circle} ${styles.circleDashed}` : styles.circle}
            style={circle.style}
          />
        ))}
      </div>
    </div>
  );
}

export const ORBITAL_LOADER_CIRCLE_COUNT = CIRCLE_COUNT;
