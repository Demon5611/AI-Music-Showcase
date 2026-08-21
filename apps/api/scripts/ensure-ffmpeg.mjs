import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { execPath, exit } = globalThis.process;
const ffmpegPackageDir = dirname(require.resolve("ffmpeg-static/package.json"));
const ffmpegBinaryPath = join(ffmpegPackageDir, "ffmpeg");
const installScriptPath = join(ffmpegPackageDir, "install.js");

async function main() {
  try {
    await access(ffmpegBinaryPath, constants.X_OK);
    return;
  } catch {
    // Download bundled ffmpeg when pnpm skipped install scripts.
  }

  const result = spawnSync(execPath, [installScriptPath], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    exit(result.status ?? 1);
  }
}

void main();
