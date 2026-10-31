// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
function block(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < from) throw Error("observer block missing");
  return source.slice(from, to);
}
const helpers = block("  function listingReady(", "  async function select(");
const captureHelper = block(
  "  async function captureFilesOperation(",
  "  window.focus();",
);
const capturePosition = source.indexOf(
  'path.join(options.evidence, "files.png")',
);
const captureStart = source.lastIndexOf("  await writeFile(", capturePosition);
const captureEnd = source.indexOf(
  "  const requestsBeforeReopen",
  capturePosition,
);
const run = new Function(
  "view",
  "options",
  "until",
  "writeFile",
  "path",
  `${helpers}\n${captureHelper}\nreturn (async () => { ${source.slice(captureStart, captureEnd)} })();`,
) as (...args: unknown[]) => Promise<void>;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

async function readyPage() {
  const page = mountFilesPage(document, {
    request: async (value) => {
      const request = value as { operation: string };
      return request.operation === "home"
        ? { ok: true, directory: "/owned" }
        : {
            ok: true,
            directory: "/owned",
            rows: [
              { name: "moved.txt", kind: "file", size: 6 },
              { name: "conflict.txt", kind: "file", size: 9 },
            ],
          };
    },
  });
  dispose = page.dispose;
  await page.ready;
  document.querySelector("[role=status]")!.textContent = "Operation completed.";
}
function harness(publicMode: "link" | "catalog" | "local" = "link") {
  const frames: FrameRequestCallback[] = [];
  const capturePage = vi.fn(async () => ({
    toPNG: () => Buffer.from("image"),
  }));
  const write = vi.fn(async () => {});
  const executeJavaScript = vi.fn(async (script: string): Promise<unknown> => {
    const evaluate = new Function(
      "document",
      "requestAnimationFrame",
      `return (${script});`,
    ) as (
      doc: Document,
      frame: (callback: FrameRequestCallback) => number,
    ) => unknown;
    return evaluate(document, (callback) => frames.push(callback));
  });
  const until = async (check: () => Promise<boolean>) => {
    // A failed condition is a controlled deadline, not retry-until-green.
    if (!(await check())) throw Error("capture readiness deadline");
  };
  return {
    frames,
    capturePage,
    write,
    executeJavaScript,
    start: () =>
      run(
        { executeJavaScript, capturePage },
        {
          files: "/owned",
          evidence: "/private-evidence",
          publicLink:
            publicMode === "link"
              ? "https://example.invalid/archive"
              : undefined,
          publicCatalog: publicMode === "catalog",
        },
        until,
        write,
        path,
      ),
  };
}
it.each(["link", "catalog"] as const)(
  "orders %s capture after child render opportunities",
  async (mode) => {
    await readyPage();
    const h = harness(mode);
    const result = h.start();
    await vi.waitFor(() => expect(h.frames).toHaveLength(1));
    expect(h.capturePage).not.toHaveBeenCalled();
    h.frames.shift()!(0);
    expect(h.capturePage).not.toHaveBeenCalled();
    expect(h.frames).toHaveLength(1);
    h.frames.shift()!(1);
    await result;
    expect(h.capturePage).toHaveBeenCalledOnce();
    expect(h.write).toHaveBeenCalledWith(
      path.join("/private-evidence", "files.png"),
      Buffer.from("image"),
    );
  },
);
it.each([
  "busy",
  "pending",
  "editor-open",
  "stale-source",
  "missing-destination",
  "wrong-directory",
  "failed-refresh",
  "unfinished-notice",
])("refuses %s before capture", async (state) => {
  await readyPage();
  if (state === "busy")
    document.querySelector(".entries")!.setAttribute("aria-busy", "true");
  if (state === "pending")
    document.querySelector<HTMLElement>(".operation-editor")!.inert = true;
  if (state === "editor-open")
    document.querySelector<HTMLElement>(".operation-editor")!.hidden = false;
  if (state === "stale-source") {
    const row = document
      .querySelector<HTMLElement>(".file-row")!
      .cloneNode(true) as HTMLElement;
    row.dataset.path = "/owned/source.txt";
    document.querySelector(".entries")!.append(row);
  }
  if (state === "missing-destination")
    document.querySelector('[data-path="/owned/moved.txt"]')!.remove();
  if (state === "wrong-directory")
    document.querySelector<HTMLInputElement>("form.location input")!.value =
      "/elsewhere";
  if (state === "failed-refresh")
    document.querySelector(".summary")!.textContent =
      "Directory unavailable: permission";
  if (state === "unfinished-notice")
    document.querySelector("[role=status]")!.textContent =
      "Operation in progress…";
  const h = harness();
  await expect(h.start()).rejects.toThrow("capture readiness deadline");
  expect(h.frames).toHaveLength(0);
  expect(h.capturePage).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
});
it("refuses state invalidated during the render opportunity instead of capturing it", async () => {
  await readyPage();
  const h = harness();
  const result = h.start();
  const outcome = result.then(
    () => null,
    (cause: unknown) => cause,
  );
  await vi.waitFor(() => expect(h.frames).toHaveLength(1));
  h.frames.shift()!(0);
  document.querySelector(".entries")!.setAttribute("aria-busy", "true");
  h.frames.shift()!(1);
  expect(await outcome).toEqual(
    new Error("Files operation changed before capture"),
  );
  expect(h.capturePage).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
});
it("preserves the local/lifecycle capture path without imposing public-move state", async () => {
  const h = harness("local");
  await h.start();
  expect(h.executeJavaScript).not.toHaveBeenCalled();
  expect(h.capturePage).toHaveBeenCalledOnce();
});
