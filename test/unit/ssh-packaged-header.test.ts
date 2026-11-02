// @vitest-environment jsdom
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { mountSshPage } from "../../extensions/ssh/page";
import { fixture, settle } from "../fixtures/companion-content";
import { cleanupSnippetsWindows } from "../fixtures/snippets-window";

const require = createRequire(import.meta.url);
const {
  observeSshChildHeader,
  observeSshHostHeader,
  captureSshHeader,
  usesChangedSshHeader,
  assertChangedSshTrust,
  assertPublicSshTrust,
} = require("../fixtures/ssh-packaged-header.cjs") as {
  observeSshChildHeader: () => unknown;
  observeSshHostHeader: () => unknown;
  usesChangedSshHeader: (host: string, extension: string) => boolean;
  assertChangedSshTrust: (
    prompt: { message: string; detail: string },
    digest: string,
  ) => void;
  assertPublicSshTrust: (
    prompt: {
      title: string;
      message: string;
      detail: string;
      buttons: string[];
    },
    digest: string,
    generation: number,
  ) => void;
  captureSshHeader: (
    window: unknown,
    core: unknown,
    view: unknown,
  ) => Promise<{
    host: unknown;
    child: unknown;
    native: unknown;
    crop: unknown;
    frameOpportunities: { host: number; child: number };
  }>;
};
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  cleanupSnippetsWindows();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function sshPage(
  doc: Document = document,
  language: "en-US" | "pt-BR" = "en-US",
) {
  vi.spyOn(
    doc.defaultView!.HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue(new DOMRect(10, 10, 100, 20));
  const page = mountSshPage(doc, {
    onAppearance: () => () => {},
    onLanguage(listener) {
      listener(language);
      return () => {};
    },
    onVisibility(listener) {
      listener(true);
      return () => {};
    },
    request: async (value) =>
      (value as { operation: string }).operation === "host.capabilities"
        ? { capabilities: ["terminal.openSsh.v1"] }
        : { ok: true, aliases: ["fixture-fast"] },
  });
  dispose = page.dispose;
  await page.ready;
}
function observeChild() {
  return runInNewContext(`(${observeSshChildHeader.toString()})()`, {
    document,
    getComputedStyle: window.getComputedStyle.bind(window),
  }) as unknown;
}

async function hostPage() {
  const f = await fixture();
  f.open("ssh", true, false, "SSH Connect");
  await settle();
  for (const [selector, rect] of [
    [".auxiliary-header", new DOMRect(700, 40, 260, 28)],
    [".auxiliary-header h2", new DOMRect(700, 40, 150, 28)],
    [".companion-native-slot", new DOMRect(700, 80, 260, 500)],
    [".terminal-surface", new DOMRect(0, 40, 680, 600)],
  ] as const) {
    vi.spyOn(
      document.querySelector<HTMLElement>(selector)!,
      "getBoundingClientRect",
    ).mockReturnValue(rect);
  }
  return f;
}
function observeHost() {
  return runInNewContext(`(${observeSshHostHeader.toString()})()`, {
    document,
    getComputedStyle: window.getComputedStyle.bind(window),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }) as unknown;
}

async function captureFixture() {
  await hostPage();
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const childDocument = frame.contentDocument!;
  await sshPage(childDocument);
  const frames = { host: 0, child: 0 };
  const context = (doc: Document, owner: "host" | "child") => ({
    document: doc,
    getComputedStyle: doc.defaultView!.getComputedStyle.bind(doc.defaultView),
    innerWidth: doc.defaultView!.innerWidth,
    innerHeight: doc.defaultView!.innerHeight,
    requestAnimationFrame: (callback: () => void) => {
      frames[owner]++;
      callback();
      return frames[owner];
    },
  });
  const image = { isEmpty: () => false, toPNG: () => Buffer.from("fixture") };
  const core = {
    executeJavaScript: async (script: string) =>
      runInNewContext(script, context(document, "host")) as unknown,
    capturePage: vi.fn(async () => image),
    isDestroyed: () => false,
    isFocused: () => false,
  };
  const view = {
    executeJavaScript: async (script: string) =>
      runInNewContext(script, context(childDocument, "child")) as unknown,
    capturePage: vi.fn(async () => image),
    isDestroyed: () => false,
    isFocused: () => true,
  };
  const bounds = { x: 700, y: 80, width: 260, height: 500 };
  const native = {
    webContents: view,
    getBounds: () => bounds,
    getVisible: () => true,
  };
  const window = { contentView: { children: [native] } };
  return { window, core, view, native, bounds, childDocument, image, frames };
}

it("requires exact Official SSH 0.3.1 consent and the captured installation generation", () => {
  const digest =
    "be7589f44a65c8ab763b85e78863deeb487094bd33a936923988fe41bd846b0b";
  const prompt = {
    title: "Trust extension code?",
    message: "Install SSH Connect 0.3.1?",
    detail: `Trusted code\n\nPackage: omxterm.ssh\nSHA-256: ${digest}\nCurrent generation: 1\n\nOfficial means project-maintained, not sandboxed or harmless. Extensions run trusted code with access to files, programs and networks. HTTPS and the catalog hash bind the selected bytes; they are not an independent publisher signature. Third-party authors remain responsible for their extensions.`,
    buttons: ["Cancel", "Trust and install"],
  };
  expect(() => assertPublicSshTrust(prompt, digest, 1)).not.toThrow();
  for (const changed of [
    { ...prompt, title: "Other" },
    { ...prompt, message: "Install SSH Connect 0.3.0?" },
    { ...prompt, detail: prompt.detail.replace("omxterm.ssh", "other.ssh") },
    { ...prompt, detail: prompt.detail.replace(digest, "a".repeat(64)) },
    {
      ...prompt,
      detail: prompt.detail.replace("generation: 1", "generation: 10"),
    },
    {
      ...prompt,
      detail: prompt.detail.replace("Official means", "Unofficial means"),
    },
    { ...prompt, buttons: ["Trust and install", "Cancel"] },
  ])
    expect(() => assertPublicSshTrust(changed, digest, 1)).toThrow();
});

it("rejects a different extension ID even when the selected digest matches", () => {
  const digest = "a".repeat(64);
  expect(() =>
    assertChangedSshTrust(
      {
        message: "Install SSH Connect 0.3.1?",
        detail: `Trusted code\n\nPackage: other.ssh\nSHA-256: ${digest}\nCurrent generation: 0`,
      },
      digest,
    ),
  ).toThrow("SSH trust identity");
});

it("binds consent to the exact SSH ID, version, name and selected digest", () => {
  const digest = "a".repeat(64);
  const prompt = {
    message: "Install SSH Connect 0.3.1?",
    detail: `Trusted code\n\nPackage: omxterm.ssh\nSHA-256: ${digest}\nCurrent generation: 0`,
  };
  expect(() => assertChangedSshTrust(prompt, digest)).not.toThrow();
  for (const changed of [
    { ...prompt, message: "Install SSH Connect 0.3.0?" },
    { ...prompt, message: "Install Other Tool 0.3.1?" },
    {
      ...prompt,
      detail: prompt.detail.replace("omxterm.ssh", "omxterm.other"),
    },
    {
      ...prompt,
      detail: prompt.detail.replace(digest, "b".repeat(64)) + digest,
    },
  ])
    expect(() => assertChangedSshTrust(changed, digest)).toThrow(
      "SSH trust identity",
    );
});

it("limits the changed-header assertion to the exact release pair", () => {
  expect(usesChangedSshHeader("0.24.0", "0.3.1")).toBe(true);
  for (const [host, extension] of [
    ["0.24.0-dev.11", "0.3.1"],
    ["0.24.0-dev.36", "0.3.1"],
    ["0.24.0", "0.3.0"],
    ["0.24.0", "0.1.0"],
    ["0.24.1", "0.3.1"],
  ])
    expect(usesChangedSshHeader(host!, extension!)).toBe(false);
});

it("captures the real host header and child separately, with native slot evidence", async () => {
  const f = await captureFixture();
  const receipt = await captureSshHeader(f.window, f.core, f.view);
  expect(receipt).toMatchObject({
    host: {
      identity: "SSH Connect",
      slot: { x: 700, y: 80, width: 260, height: 500 },
    },
    child: {
      region: "SSH Connect",
      language: "en-US",
      duplicateTitle: false,
      quickConnect: true,
      aliasSearch: true,
      syntheticAlias: "fixture-fast",
    },
    native: { x: 700, y: 80, width: 260, height: 500 },
    crop: { x: 700, y: 40, width: 260, height: 28 },
    frameOpportunities: { host: 2, child: 2 },
  });
  expect(f.core.capturePage).toHaveBeenCalledExactlyOnceWith({
    x: 700,
    y: 40,
    width: 260,
    height: 28,
  });
  expect(f.view.capturePage).toHaveBeenCalledExactlyOnceWith();
  expect(f.frames).toEqual({ host: 2, child: 2 });
});

it("bounds a stalled renderer frame before saving either capture", async () => {
  const f = await captureFixture();
  const execute = f.core.executeJavaScript;
  vi.useFakeTimers();
  vi.spyOn(f.core, "executeJavaScript").mockImplementation((script) =>
    script.startsWith("new Promise") ? new Promise(() => {}) : execute(script),
  );
  const rejected = vi.fn();
  void captureSshHeader(f.window, f.core, f.view).catch(rejected);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(3000);
  expect(rejected).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: "SSH header observation timed out" }),
  );
  expect(f.core.capturePage).not.toHaveBeenCalled();
  expect(f.view.capturePage).not.toHaveBeenCalled();
});

it.each([
  "hidden",
  "wrong-focus",
  "empty",
  "changed-child",
  "changed-host",
  "native-drift",
])("rejects %s during capture without accepting the images", async (fault) => {
  const f = await captureFixture();
  if (fault === "hidden")
    vi.spyOn(f.native, "getVisible").mockReturnValue(false);
  if (fault === "wrong-focus")
    vi.spyOn(f.view, "isFocused").mockReturnValue(false);
  if (fault === "empty") vi.spyOn(f.image, "isEmpty").mockReturnValue(true);
  if (["changed-child", "changed-host", "native-drift"].includes(fault))
    f.core.capturePage.mockImplementation(async () => {
      if (fault === "changed-child")
        f.childDocument.querySelector('[data-alias="fixture-fast"]')!.remove();
      if (fault === "changed-host")
        document.querySelector(".auxiliary-header h2")!.textContent = "Files";
      if (fault === "native-drift") f.bounds.x -= 30;
      return f.image;
    });
  await expect(captureSshHeader(f.window, f.core, f.view)).rejects.toThrow();
});

it("rejects a native child that does not occupy the observed host slot", async () => {
  const f = await captureFixture();
  f.bounds.x -= 30;
  await expect(captureSshHeader(f.window, f.core, f.view)).rejects.toThrow(
    "SSH native slot",
  );
});

it("rejects a host slot overlapping the SSH header", async () => {
  const f = await hostPage();
  vi.spyOn(
    f.root.querySelector<HTMLElement>(".companion-native-slot")!,
    "getBoundingClientRect",
  ).mockReturnValue(new DOMRect(700, 45, 260, 500));
  expect(() => observeHost()).toThrow("SSH host geometry");
});

it("rejects a clipped host tool identity", async () => {
  const f = await hostPage();
  const title = f.root.querySelector<HTMLElement>(".auxiliary-header h2")!;
  Object.defineProperties(title, {
    clientWidth: { configurable: true, value: 20 },
    scrollWidth: { configurable: true, value: 80 },
  });
  expect(() => observeHost()).toThrow("SSH host geometry");
});

it("rejects a host header naming the wrong tool", async () => {
  const f = await hostPage();
  f.root.querySelector(".auxiliary-header h2")!.textContent = "Files";
  expect(() => observeHost()).toThrow("SSH host header");
});

it.each(["en-US", "pt-BR"] as const)(
  "recognizes named SSH controls without capturing their input in %s",
  async (language) => {
    await sshPage(document, language);
    document.querySelector<HTMLInputElement>(".quick-connect input")!.value =
      "sensitive-draft-not-in-receipt";
    document.querySelector<HTMLInputElement>('input[type="search"]')!.value =
      "sensitive-search-not-in-receipt";
    expect(observeChild()).toEqual({
      region: "SSH Connect",
      language,
      duplicateTitle: false,
      quickConnect: true,
      aliasSearch: true,
      syntheticAlias: "fixture-fast",
    });
  },
);

it.each([
  "quick",
  "disabled-connect",
  "search",
  "disabled-refresh",
  "hidden-alias",
  "wrong-alias-label",
])("rejects %s when the real child controls are unavailable", async (fault) => {
  await sshPage();
  if (fault === "quick")
    document.querySelector(".quick-connect input")!.remove();
  if (fault === "disabled-connect")
    document.querySelector<HTMLButtonElement>(
      ".quick-connect button",
    )!.disabled = true;
  if (fault === "search")
    document.querySelector('.alias-toolbar input[type="search"]')!.remove();
  if (fault === "disabled-refresh")
    document.querySelector<HTMLButtonElement>(
      ".alias-toolbar button",
    )!.disabled = true;
  if (fault === "hidden-alias")
    document.querySelector<HTMLElement>('[data-alias="fixture-fast"]')!.hidden =
      true;
  if (fault === "wrong-alias-label")
    document
      .querySelector('[data-alias="fixture-fast"]')!
      .setAttribute("aria-label", "different");
  expect(() => observeChild()).toThrow("SSH child controls");
});

it("rejects a missing real synthetic alias control", async () => {
  await sshPage();
  document.querySelector('[data-alias="fixture-fast"]')!.remove();
  expect(() => observeChild()).toThrow("SSH child controls");
});

it("rejects a missing named SSH Connect child region", async () => {
  await sshPage();
  document.querySelector('[role="region"]')!.removeAttribute("aria-label");
  expect(() => observeChild()).toThrow("SSH child region");
});

it("rejects a duplicated SSH Connect title in the hosted child", async () => {
  await sshPage();
  const duplicate = document.createElement("h1");
  duplicate.textContent = "SSH Connect";
  document.querySelector('[role="region"]')!.prepend(duplicate);
  expect(() => observeChild()).toThrow("SSH child header");
});
