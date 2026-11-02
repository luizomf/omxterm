// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { renderExtensions } from "../../src/renderer/settings/settings-extensions";
import { translatorFor } from "../../src/shared/i18n";
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
) as (assertion: typeof assert) => (
  prompt: { title: string; message: string; detail: string },
  options: {
    publicLink?: string;
    publicCatalog?: string;
    macosLifecycle?: boolean;
    extensionVersion?: string;
    archiveSha256: string;
  },
  approvals?: number,
) => void;
const consent = createConsent(assert);
const createCatalogInstall = new Function(
  `${block("function installPublicCatalog(", "function verifyFilesConsent(")} return installPublicCatalog;`,
) as () => (document: Document, action: string, version?: string) => void;
const catalogInstall = createCatalogInstall();
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
it("checks the selected local macOS archive version without changing historical public checks", () => {
  const digest = "a".repeat(64);
  const prompt = {
    title: "Trust extension code?",
    message: "Install Files — ARM64 preview 0.6.0?",
    detail: `omxterm.files ${digest} network`,
  };
  const options = {
    macosLifecycle: true,
    extensionVersion: "0.6.0",
    archiveSha256: digest,
  };
  expect(() => consent(prompt, options)).not.toThrow();
  expect(() =>
    consent(
      { ...prompt, message: prompt.message.replace("0.6.0", "0.5.0") },
      options,
    ),
  ).toThrow();
});
it("does not mistake an incompatible tool card for pending management", () => {
  const createIdle = new Function(
    `${block("function extensionsIdle(", "function installPublicCatalog(")} return extensionsIdle;`,
  ) as () => (document: Document, publicCatalog: boolean) => boolean;
  const idle = createIdle();
  document.body.innerHTML =
    '<section class="extensions-panel"><button>Install local</button><section class="extension-catalog-card"><button disabled>Install</button></section></section>';
  expect(idle(document, true)).toBe(true);
  expect(idle(document, false)).toBe(false);
  document.querySelector("button")!.disabled = true;
  expect(idle(document, true)).toBe(false);
});
it("uses only the exact Files card among other installable catalog entries", async () => {
  let action: "install" | "reinstall" = "install";
  const snapshot = (): ExtensionsResult => ({
    ok: true,
    pendingCleanup: false,
    entries: [],
    catalog: {
      loaded: true,
      stale: false,
      entries: [
        {
          selection: "snippets",
          id: "omxterm.snippets",
          name: "Snippets",
          version: "0.1.0",
          description: "Other",
          installedVersion: null,
          compatible: true,
          action: "install",
        },
        {
          selection: "files",
          id: "omxterm.files",
          name: "Files — ARM64 preview",
          version: "0.5.0",
          description: "Files",
          installedVersion: null,
          compatible: true,
          action,
        },
      ],
    },
  });
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockImplementation(async () => snapshot());
  document.body.append(renderExtensions(document, { request }, () => true));
  await vi.waitFor(() =>
    expect(document.querySelectorAll(".extension-catalog-card")).toHaveLength(
      2,
    ),
  );
  for (const label of ["Install", "Reinstall", "Install"]) {
    action = label === "Install" ? "reinstall" : "install";
    catalogInstall(document, label);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: "catalog-install",
        selection: "files",
      }),
    );
    await vi.waitFor(() =>
      expect(
        document
          .querySelectorAll(".extension-catalog-card")[1]!
          .querySelector("button")!.textContent,
      ).toBe(action === "install" ? "Install" : "Reinstall"),
    );
  }
  expect(
    request.mock.calls.filter(
      ([value]) => value.operation === "catalog-install",
    ),
  ).toHaveLength(3);
  expect(
    request.mock.calls.some(
      ([value]) =>
        value.operation === "install-link" || value.operation === "install",
    ),
  ).toBe(false);
});
it.each(["0.5.0", "0.6.0"])(
  "captures the selected public Files %s card, not another release",
  async (version) => {
    document.body.innerHTML =
      '<section class="extension-catalog-card"><h4>Files — ARM64 preview · 0.5.0</h4><button>Install</button></section><section class="extension-catalog-card"><h4>Files — ARM64 preview · 0.6.0</h4><button>Install</button></section>';
    for (const card of document.querySelectorAll<HTMLElement>(
      ".extension-catalog-card",
    )) {
      card.scrollIntoView = () => {};
      card.getBoundingClientRect = () =>
        ({ top: 0, bottom: 50, left: 0, right: 100 }) as DOMRect;
    }
    const captures: { text: string }[] = [];
    const js = async (expression: string) => {
      const evaluate = new Function(
        "document",
        "requestAnimationFrame",
        "innerHeight",
        "innerWidth",
        `return ${expression}`,
      ) as (...args: unknown[]) => unknown;
      return evaluate(document, (callback: () => void) => callback(), 500, 500);
    };
    const capture = new Function(
      "assert",
      "js",
      "options",
      "core",
      "writeFile",
      "path",
      "renderedCatalog",
      `${block("  async function captureCatalog(", "  const children = [];")} return captureCatalog;`,
    ) as (
      ...args: unknown[]
    ) => (name: string, selector: string, text: string) => Promise<void>;
    const write = vi.fn(async () => {});
    await capture(
      assert,
      js,
      { publicCatalog: "fixed", extensionVersion: version, evidence: "/tmp" },
      { capturePage: async () => ({ toPNG: () => Buffer.from("capture") }) },
      write,
      { join: (...parts: string[]) => parts.join("/") },
      captures,
    )("catalog.png", ".extension-catalog-card", "Install");
    expect(captures).toHaveLength(1);
    expect(captures[0]!.text).toContain(`Files — ARM64 preview · ${version}`);
    expect(write).toHaveBeenCalledOnce();
  },
);

it("selects only the exact Files0.6 catalog card, not the historical offer", () => {
  document.body.innerHTML =
    '<section class="extension-catalog-card"><h4>Files — ARM64 preview · 0.5.0</h4><button>Install</button></section><section class="extension-catalog-card"><h4>Files — ARM64 preview · 0.6.0</h4><button>Install</button></section>';
  const buttons = document.querySelectorAll("button");
  const historical = vi.fn();
  const selected = vi.fn();
  buttons[0]!.addEventListener("click", historical);
  buttons[1]!.addEventListener("click", selected);
  catalogInstall(document, "Install", "0.6.0");
  expect(selected).toHaveBeenCalledOnce();
  expect(historical).not.toHaveBeenCalled();
});

it.each([
  "disabled",
  "hidden",
  "inert",
  "wrong-version",
  "missing",
  "duplicate",
  "wrong-action",
])("refuses %s catalog controls without selecting another tool", (mode) => {
  document.body.innerHTML =
    '<section class="extension-catalog-card"><h4>Snippets · 0.1.0</h4><button>Install</button></section><section class="extension-catalog-card"><h4>Files — ARM64 preview · 0.5.0</h4><button>Install</button></section>';
  const card = document.querySelectorAll(".extension-catalog-card")[1]!;
  if (mode === "disabled") card.querySelector("button")!.disabled = true;
  if (mode === "hidden" || mode === "inert") card.setAttribute(mode, "");
  if (mode === "wrong-version")
    card.querySelector("h4")!.textContent = "Files — ARM64 preview · 0.4.0";
  if (mode === "missing") card.remove();
  if (mode === "duplicate") document.body.append(card.cloneNode(true));
  const otherClick = vi.fn();
  document.querySelector("button")!.addEventListener("click", otherClick);
  expect(() =>
    catalogInstall(document, mode === "wrong-action" ? "Reinstall" : "Install"),
  ).toThrow();
  expect(otherClick).not.toHaveBeenCalled();
});
it.each([
  [0, 0],
  [1, 1],
  [2, 5],
])(
  "Files0.6 public consent %i binds the captured generation %i",
  (approval, generation) => {
    const digest =
      "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143";
    const t = translatorFor("en-US");
    const prompt = {
      type: "warning",
      title: t.t("extensions.trustTitle"),
      message: t.t("extensions.trustMessage", {
        name: "Files — ARM64 preview",
        version: "0.6.0",
      }),
      detail:
        t.t("extensions.trustDetail", {
          id: "omxterm.files",
          digest,
          generation,
        }) +
        "\n\n" +
        t.t("extensions.catalogTrust"),
      buttons: [t.t("common.cancel"), t.t("extensions.trustInstall")],
      defaultId: 0,
      cancelId: 0,
    };
    const options = {
      publicCatalog: "fixed",
      extensionVersion: "0.6.0",
      archiveSha256: digest,
    };
    expect(() => consent(prompt, options, approval)).not.toThrow();
    for (const wrong of [
      {
        ...prompt,
        detail: prompt.detail.replace(
          `Current generation: ${generation}`,
          `Current generation: ${generation + 1}`,
        ),
      },
      { ...prompt, detail: prompt.detail.replace(digest, "a".repeat(64)) },
      {
        ...prompt,
        detail: prompt.detail.replace("omxterm.files", "omxterm.other"),
      },
      {
        ...prompt,
        detail: prompt.detail.replace("Official means", "Third party means"),
      },
      { ...prompt, message: "Install Files — ARM64 preview 0.5.0?" },
      { ...prompt, title: "Other prompt" },
      { ...prompt, buttons: ["Trust and install", "Cancel"] },
      { ...prompt, defaultId: 1 },
      { ...prompt, cancelId: 1 },
      { ...prompt, type: "info" },
    ])
      expect(() => consent(wrong, options, approval)).toThrow();
    expect(() => consent(prompt, options, 3)).toThrow();
  },
);

it("requires Official catalog trust in addition to exact Files manifest and digest", () => {
  const digest = "a".repeat(64);
  const prompt = {
    title: "Trust extension code?",
    message: "Install Files — ARM64 preview 0.5.0?",
    detail: `omxterm.files ${digest} network`,
  };
  const options = { publicCatalog: "fixed", archiveSha256: digest };
  expect(() => consent(prompt, options)).toThrow("Official");
  prompt.detail +=
    " Official means project-maintained, not sandboxed or harmless.";
  expect(() => consent(prompt, options)).not.toThrow();
  for (const field of ["digest", "version", "id"]) {
    const wrong = { ...prompt };
    if (field === "digest")
      wrong.detail = wrong.detail.replace(digest, "b".repeat(64));
    if (field === "id")
      wrong.detail = wrong.detail.replace("omxterm.files", "omxterm.other");
    if (field === "version")
      wrong.message = wrong.message.replace("0.5.0", "0.4.0");
    expect(() => consent(wrong, options)).toThrow();
  }
});
it("routes all three Files0.6 catalog actions to the selected version", async () => {
  document.body.innerHTML =
    '<section class="extension-catalog-card"><h4>Files — ARM64 preview · 0.6.0</h4><button>Install</button><button>Reinstall</button></section>';
  const clicks: string[] = [];
  for (const button of document.querySelectorAll("button"))
    button.addEventListener("click", () => clicks.push(button.textContent!));
  const code = block(
    "  const publicLinkInstalls = [];",
    "  async function openFiles()",
  );
  const execute = new Function(
    "assert",
    "options",
    "js",
    "click",
    "installPublicCatalog",
    `return (async () => { const core = {}; ${code} await installArchive(); await installArchive("Reinstall"); await installArchive(); return publicCatalogInstalls; })();`,
  ) as (...args: unknown[]) => Promise<string[]>;
  const js = async (expression: string) => {
    const evaluate = new Function("document", `return ${expression}`) as (
      document: Document,
    ) => unknown;
    return evaluate(document);
  };
  const fallback = vi.fn(() => {
    throw Error("fallback forbidden");
  });
  await expect(
    execute(
      assert,
      { publicCatalog: "fixed", extensionVersion: "0.6.0" },
      js,
      fallback,
      catalogInstall,
    ),
  ).resolves.toEqual(["Install", "Reinstall", "Install"]);
  expect(clicks).toEqual(["Install", "Reinstall", "Install"]);
  expect(fallback).not.toHaveBeenCalled();
});

it("routes three catalog installs through scoped UI without local or link fallback", async () => {
  const code = block(
    "  const publicLinkInstalls = [];",
    "  async function openFiles()",
  );
  const execute = new Function(
    "assert",
    "options",
    "js",
    "click",
    "installPublicCatalog",
    `return (async () => { const core = {}; ${code} await installArchive(); await installArchive("Reinstall"); await installArchive(); return publicCatalogInstalls; })();`,
  ) as (...args: unknown[]) => Promise<string[]>;
  const js = vi.fn(async (expression: string) => {
    expect(expression).toContain("exact Files catalog card unavailable");
  });
  const click = vi.fn(async () => {
    throw Error("fallback forbidden");
  });
  await expect(
    execute(assert, { publicCatalog: "fixed" }, js, click, catalogInstall),
  ).resolves.toEqual(["Install", "Reinstall", "Install"]);
  expect(js).toHaveBeenCalledTimes(3);
  expect(click).not.toHaveBeenCalled();
  await expect(
    execute(
      assert,
      { publicCatalog: "fixed", publicLink: url },
      js,
      click,
      catalogInstall,
    ),
  ).rejects.toThrow();
});
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
