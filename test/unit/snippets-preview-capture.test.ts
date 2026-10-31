// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createSnippetPreview } from "../../src/renderer/snippet-preview";
import catalog from "../fixtures/snippets-catalog.json";

// Exercise the actual shared scenario helper, as in files-operation-capture.
// No Electron/native image is produced by these controlled ordering tests.
const source = await readFile("test/fixtures/snippets-scenario.cjs", "utf8");
const start = source.indexOf("    async function capturePreview() {");
const end = source.indexOf("    if (fixture.evidence)", start);
assert.ok(start >= 0 && end > start, "shared preview capture helper exists");
const capture = new Function(
  "core",
  "native",
  "assert",
  "run",
  `${source.slice(start, end)}\nreturn capturePreview();`,
) as (...args: unknown[]) => Promise<unknown>;
let preview: ReturnType<typeof createSnippetPreview> | undefined;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  preview?.dispose();
  preview = undefined;
  document.body.replaceChildren();
});
function harness() {
  const snippet = catalog.snippets[1]!;
  preview = createSnippetPreview(document, {
    canOpen: () => true,
    onActivityChange: () => {},
    focusTerminal: () => {},
  });
  preview.open(
    snippet,
    {
      live: () => true,
      onUnavailable: () => () => {},
      deliver: () => {
        throw Error("capture must not deliver input");
      },
    },
    () => true,
  );
  const frames: FrameRequestCallback[] = [];
  const image = {};
  const capturePage = vi.fn(async () => image);
  const getVisible = vi.fn(() => false);
  const executeJavaScript = async (script: string) => {
    const evaluate = new Function(
      "document",
      "requestAnimationFrame",
      `return (${script});`,
    ) as (
      doc: Document,
      frame: (callback: FrameRequestCallback) => number,
    ) => unknown;
    return evaluate(document, (callback) => frames.push(callback));
  };
  return {
    frames,
    image,
    capturePage,
    getVisible,
    start: () =>
      capture(
        { executeJavaScript, capturePage },
        { getVisible },
        assert,
        snippet.body,
      ),
  };
}
it("cannot capture at dialog-open DOM readiness or after only one frame", async () => {
  const h = harness();
  const result = h.start();
  expect(document.querySelector(".snippet-preview[open]")).not.toBeNull();
  expect(h.frames).toHaveLength(1);
  expect(h.capturePage).not.toHaveBeenCalled();
  h.frames.shift()!(0);
  expect(h.capturePage).not.toHaveBeenCalled();
  expect(h.frames).toHaveLength(1);
  h.frames.shift()!(1);
  expect(await result).toBe(h.image);
  expect(h.capturePage).toHaveBeenCalledOnce();
});
it.each([
  "closed",
  "removed",
  "changed-body",
  "replaced-body",
  "replaced-dialog",
])(
  "refuses %s during the frame barrier instead of saving a stale capture",
  async (state) => {
    const h = harness();
    const result = h.start().catch((error: unknown) => error);
    h.frames.shift()!(0);
    const dialog =
      document.querySelector<HTMLDialogElement>(".snippet-preview")!;
    const body = dialog.querySelector(".snippet-preview-body")!;
    if (state === "closed") dialog.close();
    if (state === "removed") dialog.remove();
    if (state === "changed-body") body.textContent += " ";
    if (state === "replaced-body") body.replaceWith(body.cloneNode(true));
    if (state === "replaced-dialog") dialog.replaceWith(dialog.cloneNode(true));
    h.frames.shift()!(1);
    expect(await result).toEqual(
      Error("Snippets preview changed before capture"),
    );
    expect(h.capturePage).not.toHaveBeenCalled();
  },
);
it("refuses an initially closed dialog without scheduling frames", async () => {
  const h = harness();
  document.querySelector<HTMLDialogElement>("dialog")!.close();
  await expect(h.start()).rejects.toThrow(
    "Snippets preview changed before capture",
  );
  expect(h.frames).toHaveLength(0);
  expect(h.capturePage).not.toHaveBeenCalled();
});
it("rechecks native child exclusion after the render opportunities", async () => {
  const h = harness();
  const result = h.start().catch((error: unknown) => error);
  h.frames.shift()!(0);
  h.getVisible.mockReturnValue(true);
  h.frames.shift()!(1);
  expect(String(await result)).toContain("overlay excludes native child");
  expect(h.capturePage).not.toHaveBeenCalled();
});
it("propagates capture failure without a retry or fallback", async () => {
  const h = harness();
  h.capturePage.mockRejectedValue(Error("capture failed"));
  const result = h.start().catch((error: unknown) => error);
  h.frames.shift()!(0);
  h.frames.shift()!(1);
  expect(await result).toEqual(Error("capture failed"));
  expect(h.capturePage).toHaveBeenCalledOnce();
});
