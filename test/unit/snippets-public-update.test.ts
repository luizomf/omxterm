// @vitest-environment jsdom
// Node/jsdom controls only: no Electron, browser or public request.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { translatorFor } from "../../src/shared/i18n";

vi.mock("electron", () => ({}));
const require = createRequire(import.meta.url);
const {
  runUpdateSteps,
  selectUpdate,
  namedButton,
  managementState,
  selectedScenarioCanvas,
  captureIsUniform,
} = require("../fixtures/snippets-public-update.cjs") as {
  runUpdateSteps(steps: Record<string, () => Promise<void>>): Promise<string[]>;
  selectedScenarioCanvas(
    document: Document,
    expected?: { surface: Element; canvas: Element },
  ): { surface: Element; canvas: Element };
  selectUpdate(document: Document): HTMLButtonElement;
  namedButton(
    document: Document,
    selector: string,
    labels: string[],
  ): HTMLButtonElement | null;
  managementState(
    document: Document,
    version: string,
    generation: number,
    local: string,
  ): boolean;
  captureIsUniform(image: {
    getSize(): { width: number; height: number };
    toBitmap(): Buffer;
  }): boolean;
};
const { verifySnippetsTrust } =
  require("../fixtures/snippets-observer.cjs") as {
    verifySnippetsTrust(
      prompt: unknown,
      version: string,
      digest: string,
      generation: number,
      official: boolean,
    ): void;
  };
const { startPublicCatalogObservation, startSnippetsUpdateObservation } =
  require("../fixtures/public-catalog-observer.cjs") as {
    startPublicCatalogObservation(options: unknown): Observation;
    startSnippetsUpdateObservation(options: unknown): Observation;
  };
type Observation = {
  verifyTrust(prompt: unknown): void;
  summary(): Record<string, unknown>;
  stop(): void;
};
const endpoint =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
const url =
  "https://github.com/luizomf/omxterm/releases/download/ext-snippets-v0.1.1/snippets-0.1.1.omxext";
const archive = Buffer.from("synthetic target archive");
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const digest = hash(archive);
const selection = "a".repeat(36);
const name = "Snippets — Linux, macOS and Windows ARM64 preview";
const t = translatorFor("en-US");
function trust(generation = 1) {
  return {
    type: "warning",
    title: t.t("extensions.trustTitle"),
    message: t.t("extensions.trustMessage", {
      name: "Snippets",
      version: "0.1.1",
    }),
    detail:
      t.t("extensions.trustDetail", {
        id: "omxterm.snippets",
        digest,
        generation,
      }) +
      "\n\n" +
      t.t("extensions.catalogTrust"),
    buttons: [t.t("common.cancel"), t.t("extensions.trustInstall")],
    defaultId: 0,
    cancelId: 0,
  };
}
function fixture() {
  const release = {
    id: "omxterm.snippets",
    name,
    version: "0.1.1",
    targets: ["linux-arm64", "darwin-arm64", "linux-x64", "win32-arm64"],
    archive: { url, bytes: archive.length, sha256: digest },
  };
  const card = {
    id: release.id,
    name,
    version: release.version,
    compatible: true,
    action: "update",
    installedVersion: "0.1.0" as string | null,
    selection,
  };
  const handlers = new Map<
    string,
    (
      _event: unknown,
      request: { operation: string; selection?: string },
    ) => Promise<unknown>
  >();
  const ipcMain = {
    _invokeHandlers: handlers,
    removeHandler: (key: string) => handlers.delete(key),
    handle: (
      key: string,
      fn: (
        _event: unknown,
        request: { operation: string; selection?: string },
      ) => Promise<unknown>,
    ) => handlers.set(key, fn),
  };
  const listeners = new Map<string, Set<(event: never) => void>>();
  const diagnostics = {
    subscribe(name: string, fn: (event: never) => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    unsubscribe(name: string, fn: (event: never) => void) {
      listeners.get(name)?.delete(fn);
    },
    publish(name: string, event: unknown) {
      listeners.get(name)?.forEach((fn) => fn(event as never));
    },
  };
  let prompt = trust();
  let body = Buffer.from(
    JSON.stringify({ schemaVersion: 1, entries: [release] }),
  );
  let target: Buffer = archive;
  let observer: Observation;
  async function fetch(address: string) {
    const parsed = new URL(address);
    const request = {
      protocol: parsed.protocol,
      path: parsed.pathname,
      method: "GET",
      getHeader: () => parsed.host,
    };
    diagnostics.publish("http.client.request.start", { request });
    const response = Object.assign(
      Readable.from([address === endpoint ? body : target]),
      {
        statusCode: 200,
        headers: {},
        socket: { encrypted: true, authorized: true },
      },
    );
    diagnostics.publish("http.client.response.finish", { request, response });
    for await (const _chunk of response) {
      /* forward the actual body */
    }
  }
  const host = async (_event: unknown, request: { operation: string }) => {
    await fetch(request.operation === "catalog-refresh" ? endpoint : url);
    if (request.operation === "catalog-install") {
      observer.verifyTrust(prompt);
      card.action = "reinstall";
      card.installedVersion = "0.1.1";
    }
    return {
      ok: true,
      catalog: { loaded: true, stale: false, entries: [{ ...card }] },
    };
  };
  handlers.set("omxterm:extensions", host);
  return {
    release,
    card,
    ipcMain,
    diagnostics,
    handlers,
    setPrompt(value: typeof prompt) {
      prompt = value;
    },
    setTarget(value: Buffer) {
      target = value;
    },
    updateBody() {
      body = Buffer.from(
        JSON.stringify({ schemaVersion: 1, entries: [release] }),
      );
    },
    startProduction() {
      observer = startSnippetsUpdateObservation({
        ipcMain,
        diagnostics,
        catalogSha256: hash(body),
        archiveSha256:
          "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b",
        verifyTrust: () => {},
      });
      return observer;
    },
    start() {
      observer = startPublicCatalogObservation({
        ipcMain,
        diagnostics,
        catalogSha256: hash(body),
        archiveSha256: digest,
        release: {
          ...release,
          initialVersion: "0.1.0",
          archiveUrl: url,
          archiveBytes: archive.length,
          generations: [1],
          label: "Snippets",
          forbidFallback: true,
          verifyTrust: (
            value: unknown,
            sha: string,
            index: number,
            generation: number,
          ) => {
            expect(index).toBe(0);
            verifySnippetsTrust(value, "0.1.1", sha, generation, true);
          },
        },
      });
      return observer;
    },
    invoke(operation: string, chosen = selection) {
      return handlers.get("omxterm:extensions")!(
        {},
        { operation, selection: chosen },
      );
    },
  };
}

describe("bounded public update observer", () => {
  it("binds the update card, production response and generation 1 Official consent", async () => {
    const f = fixture();
    const observer = f.start();
    await f.invoke("catalog-refresh");
    await f.invoke("catalog-install");
    expect(observer.summary()).toMatchObject({
      catalogGeneration: 1,
      approvals: 1,
      installed: 1,
      attempts: [
        {
          selection,
          expectedGeneration: 1,
          sha256: digest,
          bytes: archive.length,
        },
      ],
    });
    observer.stop();
  });
  it.each(["version", "digest", "generation", "identity", "official"])(
    "refuses wrong consent %s",
    async (fault) => {
      const f = fixture();
      const observer = f.start();
      await f.invoke("catalog-refresh");
      const prompt = trust();
      if (fault === "version") prompt.message = "Install Snippets 0.1.0?";
      if (fault === "digest")
        prompt.detail = prompt.detail.replace(digest, "b".repeat(64));
      if (fault === "generation")
        prompt.detail = prompt.detail.replace(
          "Current generation: 1",
          "Current generation: 0",
        );
      if (fault === "identity")
        prompt.detail = prompt.detail.replace(
          "omxterm.snippets",
          "other.snippets",
        );
      if (fault === "official")
        prompt.detail = prompt.detail.replace(
          "Official means",
          "Unofficial means",
        );
      f.setPrompt(prompt);
      await expect(f.invoke("catalog-install")).rejects.toThrow();
      expect(() => observer.summary()).toThrow();
      observer.stop();
    },
  );
  it.each(["version", "digest", "fresh-install"])(
    "rejects wrong offer/card %s",
    async (fault) => {
      const f = fixture();
      if (fault === "version") f.release.version = "0.1.0";
      if (fault === "digest") f.release.archive.sha256 = "b".repeat(64);
      if (fault === "fresh-install") {
        f.card.action = "install";
        f.card.installedVersion = null;
      }
      f.updateBody();
      const observer = f.start();
      await expect(f.invoke("catalog-refresh")).rejects.toThrow();
      observer.stop();
    },
  );
  it("rejects call order, changed selection, fallback and downloaded-byte substitution", async () => {
    for (const kind of ["order", "selection", "fallback", "bytes"]) {
      const f = fixture();
      const observer = f.start();
      if (kind !== "order") await f.invoke("catalog-refresh");
      if (kind === "bytes") f.setTarget(Buffer.alloc(archive.length));
      await expect(
        f.invoke(
          kind === "fallback" ? "install-link" : "catalog-install",
          kind === "selection" ? "b".repeat(36) : selection,
        ),
      ).rejects.toThrow();
      observer.stop();
    }
  });
  it("pins the real public release profile independently of synthetic positive tests", async () => {
    expect(() =>
      startSnippetsUpdateObservation({ archiveSha256: digest }),
    ).toThrow(/0.1.1 digest/);
    const f = fixture();
    f.release.archive.sha256 =
      "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b";
    f.release.archive.bytes = 82635;
    f.updateBody();
    const observer = f.startProduction();
    await f.invoke("catalog-refresh");
    await expect(f.invoke("catalog-install")).rejects.toThrow(/archive byte/);
    observer.stop();
  });
  it.each(["url", "size", "target", "version"])(
    "the real profile rejects substituted %s",
    async (fault) => {
      const f = fixture();
      f.release.archive.sha256 =
        "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b";
      f.release.archive.bytes = 82635;
      if (fault === "url")
        f.release.archive.url = url.replace("0.1.1.omxext", "other.omxext");
      if (fault === "size") f.release.archive.bytes++;
      if (fault === "target") f.release.targets = ["linux-arm64"];
      if (fault === "version") f.release.version = "0.1.0";
      f.updateBody();
      const observer = f.startProduction();
      await expect(f.invoke("catalog-refresh")).rejects.toThrow();
      observer.stop();
    },
  );
  it("detaches pending observation without rewriting a late handler result", async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    const original = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    f.handlers.set("omxterm:extensions", original);
    const observer = f.start();
    const pending = f.invoke("catalog-refresh");
    observer.stop();
    resolve({ late: true });
    await expect(pending).resolves.toEqual({ late: true });
    expect(f.handlers.get("omxterm:extensions")).toBe(original);
    expect(() => observer.verifyTrust(trust())).toThrow(/stopped/);
  });
});

describe("update driver controls", () => {
  it("binds the focused scenario Surface and rejects replacing only its canvas", () => {
    document.body.innerHTML = `<div class="terminal-surface" hidden><canvas id="baseline"></canvas></div><div class="terminal-surface"><textarea></textarea><canvas id="scenario"></canvas></div>`;
    const textarea = document.querySelector("textarea")!;
    const canvas = document.querySelector<HTMLCanvasElement>("#scenario")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ width: 300, height: 200 }),
    });
    expect(document.querySelector(".terminal-surface canvas")?.id).toBe(
      "baseline",
    );
    textarea.focus();
    const retained = selectedScenarioCanvas(document);
    expect(retained.canvas.id).toBe("scenario");
    const baseline = document.querySelector("#baseline");
    expect(baseline).toBeTruthy();
    expect(baseline).not.toBe(retained.canvas);
    const oldScenario = document.querySelector("#scenario")!;
    const replacement = oldScenario.cloneNode() as HTMLCanvasElement;
    Object.defineProperty(replacement, "getBoundingClientRect", {
      value: () => ({ width: 300, height: 200 }),
    });
    oldScenario.replaceWith(replacement);
    expect(document.querySelector("#baseline")).toBe(baseline);
    expect(selectedScenarioCanvas(document).canvas).toBe(replacement);
    expect(() => selectedScenarioCanvas(document, retained)).toThrow(/changed/);
  });
  it("executes the four owned phases in order and stops on failure", async () => {
    const calls: string[] = [];
    const steps = Object.fromEntries(
      [
        "installBaseline",
        "activateBaseline",
        "publicUpdate",
        "activateUpdateAndCheckTerminal",
      ].map((name) => [
        name,
        async () => {
          calls.push(name);
        },
      ]),
    );
    expect(await runUpdateSteps(steps)).toHaveLength(4);
    expect(calls).toEqual([
      "installBaseline",
      "activateBaseline",
      "publicUpdate",
      "activateUpdateAndCheckTerminal",
    ]);
    calls.length = 0;
    steps.publicUpdate = async () => {
      calls.push("publicUpdate");
      throw Error("cancelled");
    };
    await expect(runUpdateSteps(steps)).rejects.toThrow("cancelled");
    expect(calls).toEqual([
      "installBaseline",
      "activateBaseline",
      "publicUpdate",
    ]);
  });
  it("selects only the exact visible Update and generation", () => {
    document.body.innerHTML = `<div class="extensions-panel"><section><h3>Snippets · 0.1.0</h3><p>omxterm.snippets · generation 1 · enabled · local active · other instances unknown</p></section><div class="extension-catalog-card"><h4>${name} · 0.1.1</h4><button>Update</button></div></div>`;
    const doc = document;
    const button = doc.querySelector("button")!;
    button.getClientRects = () => ({ length: 1 }) as DOMRectList;
    expect(selectUpdate(doc)).toBe(button);
    expect(namedButton(doc, "button", ["Update"])).toBe(button);
    button.disabled = true;
    expect(namedButton(doc, "button", ["Update"])).toBeNull();
    button.disabled = false;
    expect(managementState(doc, "0.1.0", 1, "active")).toBe(true);
    expect(managementState(doc, "0.1.0", 2, "active")).toBe(false);
    const heading = doc.querySelector<HTMLElement>("h4")!;
    heading.style.display = "none";
    expect(() => selectUpdate(doc)).toThrow(/hidden/);
    heading.style.display = "";
    button.style.visibility = "hidden";
    expect(() => selectUpdate(doc)).toThrow(/hidden/);
    button.style.visibility = "visible";
    button.textContent = "Install";
    expect(() => selectUpdate(doc)).toThrow(/Snippets Update unavailable/);
  });
});

describe("captureIsUniform", () => {
  const image = (width: number, height: number, paint?: [number, number]) => {
    const bitmap = Buffer.alloc(width * height * 4);
    bitmap.fill(0xff);
    if (paint) {
      const [x, y] = paint;
      bitmap.writeUInt32BE(0x10203040, (y * width + x) * 4);
    }
    return { getSize: () => ({ width, height }), toBitmap: () => bitmap };
  };

  it("rejects a capture that never painted", () => {
    expect(captureIsUniform(image(960, 640))).toBe(true);
  });

  it("rejects a missing or degenerate surface", () => {
    expect(captureIsUniform(image(0, 0))).toBe(true);
  });

  it("accepts a capture with any varied pixel", () => {
    expect(captureIsUniform(image(960, 640, [10, 10]))).toBe(false);
    expect(captureIsUniform(image(960, 640, [400, 320]))).toBe(false);
    expect(captureIsUniform(image(960, 640, [958, 638]))).toBe(false);
  });

  it("fails closed on an incomplete frame", () => {
    expect(
      captureIsUniform({
        getSize: () => ({ width: 4, height: 4 }),
        toBitmap: () => Buffer.alloc(8),
      }),
    ).toBe(true);
  });
});
