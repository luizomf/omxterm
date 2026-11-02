// Synthetic IPC and streams exercise the passive observer; no public request runs.
import { createHash } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { expect, it, vi } from "vitest";
import { translatorFor } from "../../src/shared/i18n";

vi.mock("electron", () => ({}));
const require = createRequire(import.meta.url);
const { startPublicCatalogObservation, startFilesPublicObservation } =
  require("../fixtures/public-catalog-observer.cjs") as {
    startFilesPublicObservation(
      options: unknown,
    ): ReturnType<typeof startPublicCatalogObservation>;
    startPublicCatalogObservation(options: unknown): {
      verifyTrust(prompt: unknown): void;
      summary(): Record<string, unknown>;
      stop(): void;
    };
  };
const { verifyFilesConsent } = require("../fixtures/files-packaged.cjs") as {
  verifyFilesConsent(prompt: unknown, options: unknown, approval: number): void;
};
const endpoint =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
const archiveUrl =
  "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.6.0/files-0.6.0.omxext";
const archive = Buffer.from("synthetic Files download");
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const selection = "a".repeat(36);
const t = translatorFor("en-US");
function trust(generation: number) {
  return {
    type: "warning",
    title: t.t("extensions.trustTitle"),
    message: t.t("extensions.trustMessage", {
      name: "Files — ARM64 preview",
      version: "0.6.0",
    }),
    detail:
      t.t("extensions.trustDetail", {
        id: "omxterm.files",
        digest: sha(archive),
        generation,
      }) +
      "\n\n" +
      t.t("extensions.catalogTrust"),
    buttons: [t.t("common.cancel"), t.t("extensions.trustInstall")],
    defaultId: 0,
    cancelId: 0,
  };
}
type Request = { operation: string; selection?: string };
type Listener = (message: unknown) => void;
function fixture() {
  const release = {
    id: "omxterm.files",
    name: "Files — ARM64 preview",
    version: "0.6.0",
    targets: ["linux-arm64"],
    archive: { url: archiveUrl, sha256: sha(archive), bytes: archive.length },
  };
  const card = {
    id: release.id,
    name: release.name,
    version: release.version,
    selection,
    compatible: true,
    action: "install",
    installedVersion: null as string | null,
  };
  const handlers = new Map<
    string,
    (_event: unknown, request: Request) => Promise<unknown>
  >();
  const ipcMain = {
    _invokeHandlers: handlers,
    removeHandler: (key: string) => handlers.delete(key),
    handle: (
      key: string,
      handler: (_event: unknown, request: Request) => Promise<unknown>,
    ) => handlers.set(key, handler),
  };
  const listeners = new Map<string, Set<Listener>>();
  const diagnostics = {
    subscribe: (name: string, listener: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    unsubscribe: (name: string, listener: Listener) =>
      listeners.get(name)?.delete(listener),
    publish: (name: string, message: unknown) =>
      listeners.get(name)?.forEach((listener) => listener(message)),
  };
  let catalogBody = Buffer.from(
    JSON.stringify({ schemaVersion: 1, entries: [release] }),
  );
  let archiveBody: Buffer = archive;
  let currentTrust = trust;
  let ordinal = 0;
  const delivered: Buffer[] = [];
  const fetch = vi.fn(async (url: string) => {
    const parsed = new URL(url);
    const request = {
      protocol: parsed.protocol,
      path: parsed.pathname + parsed.search,
      method: "GET",
      getHeader: () => parsed.host,
    };
    diagnostics.publish("http.client.request.start", { request });
    const body = url === endpoint ? catalogBody : archiveBody;
    const response = Object.assign(
      Readable.from([body.subarray(0, 3), body.subarray(3)]),
      {
        statusCode: 200,
        headers: {},
        socket: { encrypted: true, authorized: true },
      },
    );
    diagnostics.publish("http.client.response.finish", { request, response });
    for await (const chunk of response)
      delivered.push(Buffer.from(chunk as Uint8Array));
  });
  let observer: ReturnType<typeof startPublicCatalogObservation>;
  const host = async (_event: unknown, request: Request) => {
    await fetch(
      request.operation === "catalog-refresh" ? endpoint : release.archive.url,
    );
    if (request.operation === "catalog-install") {
      observer.verifyTrust(currentTrust([0, 1, 5][ordinal]!));
      ordinal++;
      card.action = "reinstall";
      card.installedVersion = release.version;
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
    delivered,
    fetch,
    handlers,
    listeners,
    host,
    updateCatalog: () => {
      catalogBody = Buffer.from(
        JSON.stringify({ schemaVersion: 1, entries: [release] }),
      );
    },
    changeArchive: (value: Buffer) => {
      archiveBody = value;
    },
    changeTrust: (value: typeof trust) => {
      currentTrust = value;
    },
    start: (catalogSha256 = sha(catalogBody)) => {
      observer = startPublicCatalogObservation({
        ipcMain,
        diagnostics,
        catalogSha256,
        archiveSha256: sha(archive),
        release: {
          id: "omxterm.files",
          name: "Files — ARM64 preview",
          version: "0.6.0",
          targets: ["linux-arm64"],
          archiveUrl,
          archiveBytes: archive.length,
          generations: [0, 1, 5],
          label: "Files",
          forbidFallback: true,
          verifyTrust: (prompt: unknown, digest: string, index: number) =>
            verifyFilesConsent(
              prompt,
              {
                publicCatalog: endpoint,
                extensionVersion: "0.6.0",
                archiveSha256: digest,
              },
              index,
            ),
        },
      });
      return observer;
    },
    startProduction: (archiveSha256: string) => {
      observer = startFilesPublicObservation({
        ipcMain,
        diagnostics,
        catalogSha256: sha(catalogBody),
        archiveSha256,
        verifyTrust: (prompt: unknown, digest: string, index: number) =>
          verifyFilesConsent(
            prompt,
            {
              publicCatalog: endpoint,
              extensionVersion: "0.6.0",
              archiveSha256: digest,
            },
            index,
          ),
      });
      return observer;
    },
    invoke: (request: Request) =>
      handlers.get("omxterm:extensions")!({}, request),
  };
}

it("loads the Files observer without an SSH header helper", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "files-public-observer-"));
  try {
    const file = path.join(root, "observer.cjs");
    await cp("test/fixtures/public-catalog-observer.cjs", file);
    const isolated = createRequire(file)(file) as {
      startFilesPublicObservation: unknown;
    };
    expect(typeof isolated.startFilesPublicObservation).toBe("function");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("uses the fixed public Files release profile and never substitutes synthetic archive bytes", async () => {
  const digest =
    "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143";
  const f = fixture();
  expect(() => f.startProduction("b".repeat(64))).toThrow(/original Files/);
  f.release.archive.sha256 = digest;
  f.release.archive.bytes = 17331;
  f.updateCatalog();
  const observer = f.startProduction(digest);
  await f.invoke({ operation: "catalog-refresh" });
  f.changeArchive(Buffer.alloc(17331));
  await expect(
    f.invoke({ operation: "catalog-install", selection }),
  ).rejects.toThrow(/archive byte hash/);
  expect(() => observer.summary()).toThrow(/unexpected/);
  await expect(f.invoke({ operation: "install-link" })).rejects.toThrow(
    /fallback/,
  );
  observer.stop();
});

it.each(["url", "size", "target"] as const)(
  "the production Files profile rejects a substituted %s",
  async (fault) => {
    const digest =
      "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143";
    const f = fixture();
    f.release.archive.sha256 = digest;
    f.release.archive.bytes = 17331;
    if (fault === "url")
      f.release.archive.url = archiveUrl.replace(
        "0.6.0.omxext",
        "other.omxext",
      );
    if (fault === "size") f.release.archive.bytes++;
    if (fault === "target") f.release.targets = ["darwin-arm64"];
    f.updateCatalog();
    const observer = f.startProduction(digest);
    await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow();
    observer.stop();
  },
);

it("binds the observed Files response, snapshot, download and Official consent without changing bytes", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  await f.invoke({ operation: "catalog-install", selection });
  expect(Buffer.concat(f.delivered)).toEqual(
    Buffer.concat([
      Buffer.from(JSON.stringify({ schemaVersion: 1, entries: [f.release] })),
      archive,
    ]),
  );
  expect(observer.summary()).toMatchObject({
    catalogGeneration: 1,
    selection,
    approvals: 1,
    installed: 1,
    attempts: [
      { expectedGeneration: 0, sha256: sha(archive), bytes: archive.length },
    ],
  });
  observer.stop();
  expect(f.handlers.get("omxterm:extensions")).toBe(f.host);
  expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
});

it("binds all three downloads to one selection and captured generations 0, 1 and 5", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  for (let i = 0; i < 3; i++)
    await f.invoke({ operation: "catalog-install", selection });
  expect(observer.summary()).toMatchObject({
    approvals: 3,
    installed: 3,
    attempts: [0, 1, 5].map((expectedGeneration) => ({
      selection,
      catalogGeneration: 1,
      expectedGeneration,
      sha256: sha(archive),
      bytes: archive.length,
    })),
  });
  await expect(
    f.invoke({ operation: "catalog-install", selection }),
  ).rejects.toThrow(/additional/);
  observer.stop();
});

it.each(["id", "name", "version", "target", "url", "size", "digest"] as const)(
  "rejects a Files offer with the wrong %s",
  async (fault) => {
    const f = fixture();
    if (fault === "id") f.release.id = "other.files";
    if (fault === "name") f.release.name = "Other Files";
    if (fault === "version") f.release.version = "0.5.0";
    if (fault === "target") f.release.targets = ["darwin-arm64"];
    if (fault === "url")
      f.release.archive.url = archiveUrl.replace(
        "ext-files-v0.6.0",
        "ext-files-other",
      );
    if (fault === "size") f.release.archive.bytes++;
    if (fault === "digest") f.release.archive.sha256 = "b".repeat(64);
    f.updateCatalog();
    const observer = f.start();
    await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow();
    observer.stop();
  },
);

it.each([
  "id",
  "name",
  "version",
  "compatible",
  "action",
  "installedVersion",
  "selection",
] as const)("rejects a wrong Files card %s", async (fault) => {
  const f = fixture();
  if (fault === "id") f.card.id = "other.files";
  if (fault === "name") f.card.name = "Other Files";
  if (fault === "version") f.card.version = "0.5.0";
  if (fault === "compatible") f.card.compatible = false;
  if (fault === "action") f.card.action = "reinstall";
  if (fault === "installedVersion") f.card.installedVersion = "0.6.0";
  if (fault === "selection") f.card.selection = "not-a-selection";
  const observer = f.start();
  await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow();
  observer.stop();
});

it("rejects a different selected snapshot before archive download", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  await expect(
    f.invoke({ operation: "catalog-install", selection: "b".repeat(36) }),
  ).rejects.toThrow(/selection mismatch/);
  expect(f.fetch).toHaveBeenCalledTimes(1);
  observer.stop();
});

it("rejects a wrong actual catalog digest or archive bytes", async () => {
  const catalog = fixture();
  const first = catalog.start("b".repeat(64));
  await expect(
    catalog.invoke({ operation: "catalog-refresh" }),
  ).rejects.toThrow(/catalog byte hash/);
  first.stop();
  const files = fixture();
  const second = files.start();
  await files.invoke({ operation: "catalog-refresh" });
  files.changeArchive(Buffer.alloc(archive.length, 120));
  await expect(
    files.invoke({ operation: "catalog-install", selection }),
  ).rejects.toThrow(/archive byte hash/);
  expect(() => second.summary()).toThrow(/unexpected/);
  second.stop();
});

it.each(["Official", "generation", "identity", "digest"] as const)(
  "refuses wrong %s at Files consent",
  async (fault) => {
    const f = fixture();
    const observer = f.start();
    await f.invoke({ operation: "catalog-refresh" });
    f.changeTrust((generation) => {
      const prompt = trust(generation);
      if (fault === "Official")
        prompt.detail = prompt.detail.replace(
          "Official means",
          "Third party means",
        );
      if (fault === "generation")
        prompt.detail = prompt.detail.replace(
          "Current generation: 0",
          "Current generation: 1",
        );
      if (fault === "identity")
        prompt.detail = prompt.detail.replace("omxterm.files", "other.files");
      if (fault === "digest")
        prompt.detail = prompt.detail.replace(sha(archive), "b".repeat(64));
      return prompt;
    });
    await expect(
      f.invoke({ operation: "catalog-install", selection }),
    ).rejects.toThrow();
    expect(() => observer.summary()).toThrow(/unexpected/);
    observer.stop();
  },
);

it.each(["install", "install-link"])(
  "refuses and remembers an unapproved %s fallback",
  async (operation) => {
    const f = fixture();
    const observer = f.start();
    await f.invoke({ operation: "catalog-refresh" });
    await expect(f.invoke({ operation })).rejects.toThrow(/fallback/);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(() => observer.summary()).toThrow(/unexpected/);
    observer.stop();
  },
);
