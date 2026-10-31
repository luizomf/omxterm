// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { renderExtensions } from "../../src/renderer/settings/settings-extensions";
import type {
  ExtensionsRequest,
  ExtensionsResult,
} from "../../src/shared/extensions";

const url =
  "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.5.0/files-0.5.0-a343704c0794.omxext";
const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
function block(start: string, end: string) {
  const from = source.indexOf(start),
    to = source.indexOf(end, from);
  assert.ok(from > 0 && to > from);
  return source.slice(from, to);
}
const createInstall = new Function(
  `${block("function installPublicLink(", "function verifyFilesConsent(")} return installPublicLink;`,
) as () => (document: Document, url: string) => void;
const install = createInstall();
const createConsent = new Function(
  "assert",
  `${block("function verifyFilesConsent(", "async function run(")} return verifyFilesConsent;`,
) as (
  assertion: typeof assert,
) => (
  prompt: { title: string; message: string; detail: string },
  options: { publicLink: string; archiveSha256: string },
) => void;
const consent = createConsent(assert);
afterEach(() => document.body.replaceChildren());

it("uses real Settings HTTPS input/click for install, reinstall and final activation install", async () => {
  let finish: ((result: ExtensionsResult) => void) | undefined;
  const snapshot: ExtensionsResult = {
    ok: true,
    pendingCleanup: false,
    entries: [],
  };
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockImplementation(async (value) => {
      if (value.operation === "install-link")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return snapshot;
    });
  document.body.append(renderExtensions(document, { request }, () => true));
  await vi.waitFor(() =>
    expect(document.querySelector("input")!.disabled).toBe(false),
  );
  for (let i = 0; i < 3; i++) {
    install(document, url);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: "install-link", url }),
    );
    expect(document.querySelector("input")!.value).toBe(url);
    expect(() => install(document, url)).toThrow("controls unavailable");
    finish!(snapshot);
    await vi.waitFor(() =>
      expect(document.querySelector("input")!.disabled).toBe(false),
    );
  }
  expect(request.mock.calls.map(([value]) => value.operation)).toEqual([
    "snapshot",
    "install-link",
    "install-link",
    "install-link",
  ]);
});
it.each(["hidden", "inert", "missing"])(
  "refuses %s public controls rather than using a local chooser",
  (mode) => {
    document.body.innerHTML =
      '<div class="extensions-panel"><input type="url"><button>Install from link</button></div>';
    const panel = document.querySelector(".extensions-panel")!;
    if (mode === "missing") panel.remove();
    else panel.setAttribute(mode, "");
    expect(() => install(document, url)).toThrow("controls unavailable");
  },
);
it.each(["valid", "digest", "id", "version", "title"])(
  "checks exact captured digest and Files manifest before consent: %s",
  (mode) => {
    const digest = "a".repeat(64);
    const prompt = {
      title: "Trust extension code?",
      message: "Install Files — ARM64 preview 0.5.0?",
      detail: `omxterm.files ${digest} network`,
    };
    if (mode === "digest")
      prompt.detail = prompt.detail.replace(digest, "b".repeat(64));
    if (mode === "id")
      prompt.detail = prompt.detail.replace("omxterm.files", "other.tool");
    if (mode === "version")
      prompt.message = prompt.message.replace("0.5.0", "0.4.0");
    if (mode === "title") prompt.title = "Other prompt";
    if (mode === "valid")
      expect(() =>
        consent(prompt, { publicLink: url, archiveSha256: digest }),
      ).not.toThrow();
    else
      expect(() =>
        consent(prompt, { publicLink: url, archiveSha256: digest }),
      ).toThrow();
  },
);
it("routes every public install through the renderer, never the local chooser or catalog", async () => {
  const code = block(
    "  const publicLinkInstalls = [];",
    "  async function openFiles()",
  );
  const execute = new Function(
    "assert",
    "options",
    "js",
    "click",
    "installPublicLink",
    `return (async () => { const core = {}; ${code} await installArchive(); await installArchive(); await installArchive(); return publicLinkInstalls; })();`,
  ) as (...args: unknown[]) => Promise<string[]>;
  const js = vi.fn(async (expression: string) => {
    expect(expression).toContain("Install from link");
    expect(expression).toContain(JSON.stringify(url));
  });
  const click = vi.fn(async () => {
    throw Error("local chooser forbidden");
  });
  await expect(
    execute(assert, { publicLink: url }, js, click, install),
  ).resolves.toEqual([url, url, url]);
  expect(js).toHaveBeenCalledTimes(3);
  expect(click).not.toHaveBeenCalled();
  await expect(
    execute(
      assert,
      { publicLink: url, catalogMode: "public" },
      js,
      click,
      install,
    ),
  ).rejects.toThrow();
  await expect(
    execute(
      assert,
      { publicLink: url, macosLifecycle: true },
      js,
      click,
      install,
    ),
  ).rejects.toThrow();
});
