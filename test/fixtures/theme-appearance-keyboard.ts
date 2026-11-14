import type { WebContents } from "electron";
import assert from "node:assert/strict";
import type { TerminalSize } from "../../src/shared/terminal-contract";
import { waitFor } from "./window-chrome-exercise";

// Submission does not order renderer evaluation after Chromium's Tab default.
// Observe the real down/up pair before moving focus; never synthesize modality.
export async function focusThemeSeparator(
  contents: Pick<WebContents, "executeJavaScript" | "sendInputEvent" | "focus">,
  selector: string,
  keyboardStart = "#snippets-sidebar input",
) {
  // A hosted search lives in another WebContents. Establish keyboard modality
  // in the core with its real panel control, not a synthetic core search input.
  if (keyboardStart !== "#snippets-sidebar input") contents.focus();
  await contents.executeJavaScript(`(() => {
    if (globalThis.__themeKeyboardReceipt) throw new Error('Theme keyboard receipt already armed');
    const start = document.querySelector(${JSON.stringify(keyboardStart)});
    if (!start) throw new Error('Theme keyboard start is missing');
    start.focus();
    const receipt = globalThis.__themeKeyboardReceipt = {down: false, up: false};
    receipt.listener = (event) => {
      if (!event.isTrusted || event.key !== 'Tab' || !event.shiftKey ||
          event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (event.type === 'keydown') receipt.down = true;
      else if (receipt.down) receipt.up = true;
    };
    document.addEventListener('keydown', receipt.listener, true);
    document.addEventListener('keyup', receipt.listener, true);
  })()`);
  try {
    for (const type of ["keyDown", "keyUp"] as const)
      contents.sendInputEvent({ type, keyCode: "Tab", modifiers: ["shift"] });
    let focused = false;
    const element = `document.querySelector(${JSON.stringify(selector)})`;
    // Consumption and the original strict focus-visible oracle share one
    // unchanged waitFor budget, rather than adding another response deadline.
    await waitFor(async () => {
      if (!focused) {
        const consumed = (await contents.executeJavaScript(
          "globalThis.__themeKeyboardReceipt.down && globalThis.__themeKeyboardReceipt.up",
        )) as boolean;
        if (!consumed) return false;
        await contents.executeJavaScript(`${element}.focus()`);
        focused = true;
      }
      return contents.executeJavaScript(
        `${element}.matches(':focus-visible')`,
      ) as Promise<boolean>;
    }, "theme Shift-Tab consumption and separator focus-visible");
  } finally {
    await contents.executeJavaScript(`(() => {
      const receipt = globalThis.__themeKeyboardReceipt;
      document.removeEventListener('keydown', receipt.listener, true);
      document.removeEventListener('keyup', receipt.listener, true);
      delete globalThis.__themeKeyboardReceipt;
    })()`);
  }
}

// One keyboard step is 2% of the split, or 10 px for the panel, so it can be
// smaller than a cell: the divider moves and no grid changes (#1024, a
// 681-DIP-tall window). Step until a pane has moved more than one cell. Every
// step must move a pane, and that much movement must refit a PTY.
export async function stepUntilRefit(
  scene: {
    evaluate<T>(script: string): Promise<T>;
    key(keyCode: string): void;
    grid(): TerminalSize[];
    changed(before: TerminalSize[]): boolean;
    pane: string;
  },
  axis: "width" | "height",
) {
  const { evaluate, key, grid, changed, pane } = scene;
  const before = grid();
  const ratio = await evaluate<number>("devicePixelRatio");
  // Grid pixels are device pixels without padding: pixels / cells is a cell.
  const cell =
    Math.max(
      ...before.map((size) =>
        axis === "width"
          ? size.pixelWidth! / size.cols
          : size.pixelHeight! / size.rows,
      ),
    ) / ratio;
  assert.ok(Number.isFinite(cell) && cell > 0, "PTY grids report cell pixels");
  const extents = () =>
    evaluate<number[]>(
      `[...document.querySelectorAll(${JSON.stringify(pane)})].map(e => e.getBoundingClientRect().${axis})`,
    );
  const start = await extents();
  let current = start;
  // One CSS px of slack covers device-pixel rounding in the fit.
  while (
    Math.max(...current.map((e, i) => Math.abs(e - start[i]!))) <=
    cell + 1
  ) {
    if (changed(before)) return;
    const previous = current;
    key(axis === "height" ? "Up" : "Left");
    await waitFor(async () => {
      current = await extents();
      return current.some((e, i) => e !== previous[i]);
    }, "Keyboard step moves a hidden divider");
  }
  await waitFor(
    () => changed(before),
    "Keyboard resize of hidden divider refits PTYs",
  );
}
