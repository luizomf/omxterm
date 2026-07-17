import { describe, expect, it } from "vitest";
import {
  inspectAsarEntries,
  inspectIcnsRepresentations,
} from "../../scripts/verify-packaged-app.mjs";

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
  it("requires every standard and Retina macOS icon representation", () => {
    const representations = [
      { name: "icon_16x16.png", width: 16, height: 16 },
      { name: "icon_16x16@2x.png", width: 32, height: 32 },
      { name: "icon_32x32.png", width: 32, height: 32 },
      { name: "icon_32x32@2x.png", width: 64, height: 64 },
      { name: "icon_128x128.png", width: 128, height: 128 },
      { name: "icon_128x128@2x.png", width: 256, height: 256 },
      { name: "icon_256x256.png", width: 256, height: 256 },
      { name: "icon_256x256@2x.png", width: 512, height: 512 },
      { name: "icon_512x512.png", width: 512, height: 512 },
      { name: "icon_512x512@2x.png", width: 1024, height: 1024 },
    ];

    expect(inspectIcnsRepresentations(representations)).toEqual({
      missing: [],
      wrongDimensions: [],
    });
    expect(inspectIcnsRepresentations(representations.slice(1))).toEqual({
      missing: ["icon_16x16.png"],
      wrongDimensions: [],
    });
    expect(
      inspectIcnsRepresentations([
        ...representations.slice(0, 5),
        { name: "icon_128x128@2x.png", width: 512, height: 512 },
        ...representations.slice(6),
      ]),
    ).toEqual({
      missing: [],
      wrongDimensions: ["icon_128x128@2x.png (expected 256x256, got 512x512)"],
    });
  });

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
    "/node_modules/node-addon-api/napi.h",
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
