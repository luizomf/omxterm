// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for #96: xterm 6 keeps an empty companion viewport whose stock
// overflow-y: scroll paints a permanent disabled scrollbar track on platforms
// with classic scrollbars. The Terminal Window stylesheet must win the cascade
// against the bundled xterm stylesheet and hide that vestigial scrollbar.
describe("terminal window viewport scrollbar", () => {
  it("hides the vestigial xterm viewport scrollbar", () => {
    for (const stylesheet of [
      "node_modules/@xterm/xterm/css/xterm.css",
      "src/renderer/terminal-window.css",
    ]) {
      const style = document.createElement("style");
      style.textContent = readFileSync(stylesheet, "utf8");
      document.head.append(style);
    }
    const surface = document.createElement("div");
    surface.className = "terminal-surface";
    const viewport = document.createElement("div");
    viewport.className = "xterm-viewport";
    surface.append(viewport);
    document.body.append(surface);

    expect(getComputedStyle(viewport).overflowY).toBe("hidden");
  });
});
