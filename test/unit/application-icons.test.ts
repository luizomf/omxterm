// @vitest-environment jsdom
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  encodeIcns,
  macosIconSvg,
} from "../../scripts/generate-application-icons.mjs";
import { applicationIconSvg } from "../../src/renderer/application-icon";
import { showStartupSplash } from "../../src/renderer/startup-splash";

const root = path.resolve(import.meta.dirname, "../..");
const source = path.join(
  root,
  "src/shared/icons/hicolor/scalable/apps/omxterm-hero.svg",
);

// Width and height from a PNG's IHDR chunk.
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

describe("application icons", () => {
  it("gives the renderer the exact scalable source", async () => {
    expect(applicationIconSvg).toBe(await readFile(source, "utf8"));
  });

  it("places the artwork on Apple's 1024 px grid", () => {
    const wrapped = macosIconSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>',
    );
    expect(wrapped).toContain('viewBox="0 0 1024 1024"');
    expect(wrapped).toContain(
      '<svg x="100" y="100" width="824" height="824" viewBox="0 0 24 24"><path d="M0 0"/></svg>',
    );
  });

  it("encodes ICNS chunks with their lengths", () => {
    const icns = encodeIcns([["ic04", Buffer.from("png")]]);
    expect(icns.subarray(0, 4).toString()).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(icns.subarray(8, 12).toString()).toBe("ic04");
    expect(icns.readUInt32BE(12)).toBe(11);
  });

  it("ships every macOS representation at its pixel size", async () => {
    const icns = await readFile(
      path.join(root, "assets/application-icon.icns"),
    );
    const sizes: Record<string, number> = {};
    for (let offset = 8; offset < icns.length;) {
      const length = icns.readUInt32BE(offset + 4);
      const type = icns.subarray(offset, offset + 4).toString();
      const [width, height] = pngSize(
        icns.subarray(offset + 8, offset + length),
      );
      expect(width, type).toBe(height);
      sizes[type] = width!;
      offset += length;
    }
    expect(sizes).toEqual({
      ic04: 16,
      ic05: 32,
      ic11: 32,
      ic12: 64,
      ic07: 128,
      ic13: 256,
      ic08: 256,
      ic14: 512,
      ic09: 512,
      ic10: 1024,
    });
  });

  it("ships Linux theme icons at their folder's size", async () => {
    const hicolor = path.join(root, "assets/icons/hicolor");
    const folders = (await readdir(hicolor)).filter(
      (name) => name !== "scalable",
    );
    expect(folders.length).toBeGreaterThanOrEqual(8);
    for (const folder of folders) {
      const size = Number(folder.split("x")[0]);
      const png = await readFile(
        path.join(hicolor, folder, "apps/omxterm.png"),
      );
      expect(pngSize(png), folder).toEqual([size, size]);
    }
    expect(
      await readFile(path.join(hicolor, "scalable/apps/omxterm.svg"), "utf8"),
    ).toBe(applicationIconSvg);
    expect(
      pngSize(await readFile(path.join(root, "assets/application-icon.png"))),
    ).toEqual([1024, 1024]);
  });

  it("shows the icon while a window starts and removes it afterwards", () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = "";
      const hide = showStartupSplash(document);
      const splash = document.querySelector("#startup-splash")!;
      expect(splash.getAttribute("aria-hidden")).toBe("true");
      expect(splash.querySelector("svg")).not.toBeNull();
      hide();
      expect(splash.classList.contains("done")).toBe(true);
      vi.advanceTimersByTime(400);
      expect(document.querySelector("#startup-splash")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
