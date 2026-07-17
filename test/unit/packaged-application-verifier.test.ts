import { describe, expect, it } from "vitest";
import { inspectAsarEntries } from "../../scripts/verify-packaged-app.mjs";

const requiredEntries = [
  "/dist/main/index.js",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.css",
  "/dist/renderer/index.html",
  "/dist/renderer/index.js",
  "/dist/renderer/fonts/JetBrainsMonoNerdFontMono-Regular.woff2",
  "/dist/renderer/fonts/OFL.txt",
  "/node_modules/@xterm/addon-fit/lib/addon-fit.js",
  "/node_modules/@xterm/addon-web-links/lib/addon-web-links.js",
  "/node_modules/@xterm/xterm/lib/xterm.js",
  "/node_modules/node-pty/lib/index.js",
  "/package.json",
];

describe("packaged application verifier", () => {
  it("accepts the complete production runtime boundary", () => {
    expect(inspectAsarEntries(requiredEntries)).toEqual({
      missing: [],
      forbidden: [],
    });
  });

  it.each([
    "/.env",
    "/.git/config",
    "/dist/main/index.js.map",
    "/node_modules/node-pty/src/index.ts",
    "/node_modules/node-pty/prebuilds/darwin-x64/pty.node",
    "/node_modules/node-pty/lib/terminal.test.js",
    "/session-transcript.txt",
  ])("rejects development or private-looking entry %s", (entry) => {
    expect(inspectAsarEntries([...requiredEntries, entry]).forbidden).toEqual([
      entry,
    ]);
  });

  it("reports a missing runtime asset", () => {
    expect(inspectAsarEntries(requiredEntries.slice(1)).missing).toEqual([
      "/dist/main/index.js",
    ]);
  });
});
