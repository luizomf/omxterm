import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Locations of the bundled application files. Main is bundled into one ESM
// file, so import.meta.url names dist/main/index.js in every build.
const mainDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(mainDirectory, "..");
export const preloadPath = path.join(applicationRoot, "preload", "index.cjs");
export const rendererPath = path.join(
  applicationRoot,
  "renderer",
  "index.html",
);
export const developmentApplicationIconPath = path.resolve(
  applicationRoot,
  "..",
  "assets",
  "application-icon.png",
);
export const packagedApplicationIconPath = path.join(
  process.resourcesPath,
  "application-icon.png",
);
// Linux windows must carry their own icon: a directly-run AppImage has no
// registered desktop entry for the environment to resolve one from.
export const linuxWindowIconPath =
  process.platform === "linux"
    ? existsSync(packagedApplicationIconPath)
      ? packagedApplicationIconPath
      : developmentApplicationIconPath
    : undefined;
