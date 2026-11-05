// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// Execute the actual consumer's final-state observer, without Electron or a browser.
const consumer = await readFile("test/fixtures/files-070-consumer.mjs", "utf8");
const production = await readFile("test/fixtures/files-production.mjs", "utf8");
function block(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < from) throw Error("fixture block missing");
  return source.slice(from, to);
}
const run = new Function(
  "context",
  `const {assert, path, evaluate, until, checks, evidence, writeFile, view, core, query, closeFiles, menu} = context;
   const files = '/owned', source = '/owned/project', moved = '/owned/destination/project';
   ${block(production, "  function listingReady(", "  function entryQuery(")}
   ${block(consumer, "  const row =", "  const ready =")}
   return (async () => {
     ${block(consumer, "  const completedMove =", "  const backend =")}
   })();`,
) as (context: unknown) => Promise<void>;

afterEach(() => document.body.replaceChildren());
function harness() {
  document.body.innerHTML = `
    <form class="location"><input value="/owned"></form>
    <div class="entries" role="tree" aria-busy="false">
      <div role="treeitem" data-path="/owned/destination/project"></div>
    </div>
    <p class="summary">2 visible entries</p>
    <form class="operation-editor" hidden></form>
    <p role="status">Operation completed.</p>`;
  const frames: FrameRequestCallback[] = [];
  const evaluate = async (script: string): Promise<unknown> => {
    const execute = new Function(
      "document",
      "requestAnimationFrame",
      `return (${script});`,
    ) as (
      doc: Document,
      frame: (callback: FrameRequestCallback) => number,
    ) => unknown;
    return execute(document, (callback) => frames.push(callback));
  };
  const capturePage = vi.fn(async () => ({
    toPNG: () => Buffer.from("image"),
  }));
  const writeFile = vi.fn(async () => {});
  let filter = "";
  const query = vi.fn(async (value: string) => {
    filter = value;
  });
  const closeFiles = vi.fn(async () => {
    expect(filter).toBe("needle"); // Close/reset must start from a nonempty query.
    return { executeJavaScript: async () => "" };
  });
  return {
    frames,
    capturePage,
    writeFile,
    query,
    closeFiles,
    start: () =>
      run({
        assert,
        path: path.posix,
        evaluate,
        checks: [],
        evidence: "/private-evidence",
        until: async (check: () => Promise<boolean>) => {
          if (!(await check())) throw Error("consumer readiness deadline");
        },
        writeFile,
        view: { capturePage },
        core: { capturePage },
        query,
        closeFiles,
        menu: () => {},
      }),
  };
}
it("orders consumer captures after final-state frames and closes a nonempty filter", async () => {
  const h = harness();
  const result = h.start();
  await vi.waitFor(() => expect(h.frames).toHaveLength(1));
  expect(h.capturePage).not.toHaveBeenCalled();
  h.frames.shift()!(0);
  expect(h.capturePage).not.toHaveBeenCalled();
  h.frames.shift()!(1);
  await result;
  expect(h.writeFile.mock.calls).toHaveLength(2);
  expect(h.query).toHaveBeenCalledWith("needle");
  expect(h.closeFiles).toHaveBeenCalledOnce();
});
it.each([
  "busy",
  "wrong-root",
  "failed-refresh",
  "stale-source",
  "missing-move",
  "open-editor",
  "pending",
  "unfinished",
])("refuses consumer capture with %s state", async (state) => {
  const h = harness();
  if (state === "busy")
    document.querySelector(".entries")!.setAttribute("aria-busy", "true");
  if (state === "wrong-root")
    document.querySelector<HTMLInputElement>("input")!.value = "/elsewhere";
  if (state === "failed-refresh")
    document.querySelector(".summary")!.textContent = "Directory unavailable";
  if (state === "stale-source")
    document
      .querySelector(".entries")!
      .insertAdjacentHTML(
        "beforeend",
        '<div role="treeitem" data-path="/owned/project"></div>',
      );
  if (state === "missing-move")
    document.querySelector("[role=treeitem]")!.remove();
  if (state === "open-editor")
    document.querySelector<HTMLElement>(".operation-editor")!.hidden = false;
  if (state === "pending")
    document.querySelector<HTMLElement>(".operation-editor")!.inert = true;
  if (state === "unfinished")
    document.querySelector("[role=status]")!.textContent =
      "Operation in progress…";
  await expect(h.start()).rejects.toThrow("consumer readiness deadline");
  expect(h.frames).toHaveLength(0);
  expect(h.capturePage).not.toHaveBeenCalled();
  expect(h.closeFiles).not.toHaveBeenCalled();
});
it("rechecks consumer state after the render opportunity", async () => {
  const h = harness();
  const result = h.start().catch((error: unknown) => error);
  await vi.waitFor(() => expect(h.frames).toHaveLength(1));
  h.frames.shift()!(0);
  document.querySelector(".entries")!.setAttribute("aria-busy", "true");
  h.frames.shift()!(1);
  expect(await result).toBeInstanceOf(Error);
  expect(h.capturePage).not.toHaveBeenCalled();
  expect(h.closeFiles).not.toHaveBeenCalled();
});
