import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { startSshPublicObservation, sealPublicObservation } =
  require("../fixtures/public-catalog-observer.cjs") as {
    sealPublicObservation: (
      observation: unknown,
      expected: unknown,
      restore: () => void,
      check?: () => void,
    ) => void;
    startSshPublicObservation: (options: unknown) => {
      verifyTrust(prompt: unknown): void;
      summary(): unknown;
      beginQuit(): void;
      stop(options?: { allowRemoved?: boolean }): void;
    };
  };
const endpoint =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
const archiveUrl =
  "https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.3.1/ssh-0.3.1.omxext";
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const archive = Buffer.alloc(11606, 42);
const selection = "a".repeat(36);
const official =
  "Official means project-maintained, not sandboxed or harmless. Extensions run trusted code with access to files, programs and networks. HTTPS and the catalog hash bind the selected bytes; they are not an independent publisher signature. Third-party authors remain responsible for their extensions.";
const prompt = (generation: number) => ({
  type: "warning",
  title: "Trust extension code?",
  message: "Install SSH Connect 0.3.1?",
  detail: `This is trusted local code, not a sandbox. It can read/change files, run programs and use the network with your user permissions. Third-party authors are responsible for their extensions. Only install packages you trust. Installation is dormant until you invoke its action.\n\nPackage: omxterm.ssh\nSHA-256: ${sha(archive)}\nCurrent generation: ${generation}\n\n${official}`,
  buttons: ["Cancel", "Trust and install"],
  defaultId: 0,
  cancelId: 0,
});

type Request = { operation: string; selection?: string };
type Listener = (message: unknown) => void;
function fixture() {
  const release = {
    id: "omxterm.ssh",
    name: "SSH Connect",
    version: "0.3.1",
    targets: ["linux-arm64"],
    archive: { url: archiveUrl, sha256: sha(archive), bytes: archive.length },
  };
  const card: {
    id: string;
    name: string;
    version: string;
    selection: string;
    compatible: boolean;
    action: string;
    installedVersion: string | null;
  } = {
    id: release.id,
    name: release.name,
    version: release.version,
    selection,
    compatible: true,
    action: "install",
    installedVersion: null,
  };
  const handlers = new Map<
    string,
    (event: unknown, request: Request, ...extra: unknown[]) => Promise<unknown>
  >();
  const ipcMain = {
    _invokeHandlers: handlers,
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (
      channel: string,
      handler: (
        event: unknown,
        request: Request,
        ...extra: unknown[]
      ) => Promise<unknown>,
    ) => handlers.set(channel, handler),
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
  const delivered: Buffer[] = [];
  let catalogBody = Buffer.from(
    JSON.stringify({ schemaVersion: 1, entries: [release] }),
  );
  let archiveBody: Buffer = archive;
  let consent = prompt;
  let authorized = true;
  let archiveRedirect: { location: string; actual: string } | undefined;
  const response = (
    url: string,
    body: Buffer,
    statusCode = 200,
    headers: Record<string, string> = {},
  ) => {
    const parsed = new URL(url);
    const request = {
      protocol: parsed.protocol,
      host: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      getHeader: () => parsed.host,
    };
    diagnostics.publish("http.client.request.start", { request });
    const incoming = Object.assign(
      Readable.from([body.subarray(0, 3), body.subarray(3)]),
      {
        statusCode,
        headers,
        socket: { encrypted: true, authorized },
      },
    );
    diagnostics.publish("http.client.response.finish", {
      request,
      response: incoming,
    });
    return incoming;
  };
  const fetch = vi.fn(async (url: string) => {
    let actual = url;
    if (url === archiveUrl && archiveRedirect) {
      response(url, Buffer.alloc(0), 302, {
        location: archiveRedirect.location,
      }).destroy();
      actual = archiveRedirect.actual;
    }
    const body = url === endpoint ? catalogBody : archiveBody;
    for await (const chunk of response(actual, body))
      delivered.push(Buffer.from(chunk as Uint8Array));
  });
  let observer: ReturnType<typeof startSshPublicObservation>;
  let generation = 0;
  const host = async (_event: unknown, value: Request, ...extra: unknown[]) => {
    if (extra.length) throw Error("unexpected extra arguments");
    await fetch(
      value.operation === "catalog-refresh" ? endpoint : release.archive.url,
    );
    if (value.operation === "catalog-install") {
      observer.verifyTrust(consent(generation));
      generation++;
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
    host,
    handlers,
    listeners,
    removeHandler: () => ipcMain.removeHandler("omxterm:extensions"),
    changeCatalog: () => {
      catalogBody = Buffer.from(
        JSON.stringify({ schemaVersion: 1, entries: [release] }),
      );
    },
    changeArchive: (value: Buffer) => {
      archiveBody = value;
    },
    changeConsent: (value: typeof prompt) => {
      consent = value;
    },
    setAuthorized: (value: boolean) => {
      authorized = value;
    },
    setArchiveRedirect: (location: string, actual = location) => {
      archiveRedirect = { location, actual };
    },
    start: (expectedCatalogSha256 = sha(catalogBody)) => {
      observer = startSshPublicObservation({
        ipcMain,
        diagnostics,
        catalogSha256: expectedCatalogSha256,
        archiveSha256: sha(archive),
      });
      return observer;
    },
    invoke: (value: Request, ...extra: unknown[]) =>
      handlers.get("omxterm:extensions")!({}, value, ...extra),
  };
}

it("passively ties unchanged HTTPS response streams, snapshot selection and consent to one catalog generation", async () => {
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
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(observer.summary()).toMatchObject({
    catalogGeneration: 1,
    selection,
    archiveSha256: sha(archive),
    approvals: 1,
    installed: 1,
  });
  observer.stop();
  expect(f.handlers.get("omxterm:extensions")).toBe(f.host);
  expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
});

it("observes the candidate macOS target without accepting unrelated targets", async () => {
  const f = fixture();
  f.release.targets = ["linux-arm64", "darwin-arm64"];
  f.changeCatalog();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  await f.invoke({ operation: "catalog-install", selection });
  expect(observer.summary()).toMatchObject({
    offer: { targets: ["linux-arm64", "darwin-arm64"] },
    installed: 1,
  });
  observer.stop();

  const wrong = fixture();
  wrong.release.targets = ["linux-arm64", "win32-arm64"];
  wrong.changeCatalog();
  const rejected = wrong.start();
  await expect(wrong.invoke({ operation: "catalog-refresh" })).rejects.toThrow(
    /release targets/,
  );
  rejected.stop();
});

it("records each actual download and consent against the same selection and catalog generation", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  await f.invoke({ operation: "catalog-install", selection });
  await f.invoke({ operation: "catalog-install", selection });
  expect(observer.summary()).toMatchObject({
    catalogGeneration: 1,
    approvals: 2,
    installed: 2,
    attempts: [
      {
        selection,
        catalogGeneration: 1,
        expectedGeneration: 0,
        sha256: sha(archive),
        bytes: archive.length,
      },
      {
        selection,
        catalogGeneration: 1,
        expectedGeneration: 1,
        sha256: sha(archive),
        bytes: archive.length,
      },
    ],
  });
  observer.stop();
});

it("rejects a different archive URL or size even when the catalog digest matches", async () => {
  for (const change of [
    { url: archiveUrl.replace("ext-ssh-v0.3.1", "ext-ssh-original-0.3.1") },
    { bytes: 11607 },
  ]) {
    const f = fixture();
    Object.assign(f.release.archive, change);
    f.changeCatalog();
    const observer = f.start();
    await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow(
      /release archive (URL|size)/,
    );
    observer.stop();
  }
});

it("follows the production archive redirect only when the observed HTTPS chain matches", async () => {
  const location =
    "https://release-assets.githubusercontent.com/immutable-asset?signature=synthetic";
  const good = fixture();
  good.setArchiveRedirect(location);
  const observer = good.start();
  await good.invoke({ operation: "catalog-refresh" });
  await good.invoke({ operation: "catalog-install", selection });
  expect(observer.summary()).toMatchObject({ approvals: 1, installed: 1 });
  expect(JSON.stringify(observer.summary())).not.toContain(
    "signature=synthetic",
  );
  observer.stop();

  const wrong = fixture();
  wrong.setArchiveRedirect(location, "https://other.example.invalid/asset");
  const failed = wrong.start();
  await wrong.invoke({ operation: "catalog-refresh" });
  const mismatch = await wrong
    .invoke({ operation: "catalog-install", selection })
    .catch((error: Error) => error);
  expect(mismatch).toBeInstanceOf(Error);
  expect((mismatch as Error).message).toMatch(
    /redirect or initial URL mismatch/,
  );
  expect((mismatch as Error).message).not.toContain("signature=synthetic");
  expect(() => failed.summary()).toThrow(/unexpected/);
  failed.stop();
});

it.each(["check", "summary", "stop"] as const)(
  "restores hooks and withholds the receipt if Quit %s fails",
  (fault) => {
    const receipt = vi.fn();
    const restore = vi.fn();
    const stop = vi.fn(() => {
      if (fault === "stop") throw Error("stop failure");
    });
    const summary = vi.fn(() => {
      if (fault === "summary") throw Error("summary failure");
      return { result: 1 };
    });
    const check = vi.fn(() => {
      if (fault === "check") throw Error("check failure");
    });
    expect(() => {
      sealPublicObservation({ summary, stop }, { result: 1 }, restore, check);
      receipt();
    }).toThrow(/Public observation shutdown failed/);
    expect(check).toHaveBeenCalledOnce();
    expect(summary).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledWith({ allowRemoved: true });
    expect(restore).toHaveBeenCalledOnce();
    expect(receipt).not.toHaveBeenCalled();
  },
);

it("accepts only explicitly expected production handler removal at joined Quit", () => {
  const f = fixture();
  const observer = f.start();
  observer.beginQuit();
  f.removeHandler();
  expect(() => observer.stop({ allowRemoved: true })).not.toThrow();
  expect(f.handlers.has("omxterm:extensions")).toBe(false);
  expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);

  const early = fixture();
  const beforeQuit = early.start();
  early.removeHandler();
  expect(() => beforeQuit.beginQuit()).toThrow();
  expect(() => beforeQuit.stop({ allowRemoved: true })).toThrow(/hook changed/);
});

it("removes diagnostics listeners without overwriting a changed IPC owner even at Quit", () => {
  const f = fixture();
  const observer = f.start();
  observer.beginQuit();
  const replacement = async () => ({});
  f.handlers.set("omxterm:extensions", replacement);
  expect(() => observer.stop({ allowRemoved: true })).toThrow(/hook changed/);
  expect(f.handlers.get("omxterm:extensions")).toBe(replacement);
  expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
});

it("rejects replacement later removed by production shutdown", () => {
  const f = fixture();
  const observer = f.start();
  observer.beginQuit();
  f.handlers.set("omxterm:extensions", async () => ({}));
  f.removeHandler();
  expect(() => observer.summary()).toThrow();
  expect(() => observer.stop({ allowRemoved: true })).toThrow(/hook changed/);
});

it("preserves production IPC argument validation rather than dropping extra arguments", async () => {
  const f = fixture();
  const observer = f.start();
  await expect(
    f.invoke({ operation: "catalog-refresh" }, "extra"),
  ).rejects.toThrow(/extra arguments/);
  expect(f.fetch).not.toHaveBeenCalled();
  observer.stop();
});

it.each(["install", "install-link"])(
  "refuses %s instead of falling back from the public catalog",
  async (operation) => {
    const f = fixture();
    const observer = f.start();
    await expect(f.invoke({ operation })).rejects.toThrow(/fallback/);
    expect(f.fetch).not.toHaveBeenCalled();
    observer.stop();
  },
);

it("refuses another refresh rather than silently changing the captured catalog generation", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow(
    /unexpected catalog refresh/,
  );
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(() => observer.summary()).toThrow(/unexpected/);
  observer.stop();
});

it("refuses a changed captured selection before the app can download or approve", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  await expect(
    f.invoke({ operation: "catalog-install", selection: "b".repeat(36) }),
  ).rejects.toThrow(/selection mismatch/);
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(() => observer.summary()).toThrow(/unexpected/);
  observer.stop();
});

it.each(["id", "name", "version", "target", "hash"] as const)(
  "rejects a catalog offer with the wrong %s",
  async (fault) => {
    const f = fixture();
    if (fault === "id") f.release.id = "other.ssh";
    if (fault === "name") f.release.name = "Other";
    if (fault === "version") f.release.version = "0.3.0";
    if (fault === "target") f.release.targets = ["darwin-arm64"];
    if (fault === "hash") f.release.archive.sha256 = "b".repeat(64);
    f.changeCatalog();
    const observer = f.start();
    await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow();
    observer.stop();
  },
);

it("refuses an unauthorized TLS response even when the bytes match", async () => {
  const f = fixture();
  f.setAuthorized(false);
  const observer = f.start();
  await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow(
    /TLS/,
  );
  observer.stop();
});

it("refuses unexpected actual catalog bytes despite a valid-looking response", async () => {
  const f = fixture();
  const observer = f.start("a".repeat(64));
  await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow(
    /actual catalog byte hash/,
  );
  observer.stop();
});

it("refuses changed downloaded archive bytes before native trust", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  f.changeArchive(Buffer.alloc(archive.length, 120));
  await expect(
    f.invoke({ operation: "catalog-install", selection }),
  ).rejects.toThrow(/actual archive byte hash/);
  expect(() => observer.summary()).toThrow(/unexpected/);
  observer.stop();
});

it("refuses a different installation generation at actual consent", async () => {
  const f = fixture();
  const observer = f.start();
  await f.invoke({ operation: "catalog-refresh" });
  f.changeConsent(() => prompt(1));
  await expect(
    f.invoke({ operation: "catalog-install", selection }),
  ).rejects.toThrow(/generation mismatch/);
  expect(() => observer.summary()).toThrow(/unexpected/);
  observer.stop();
});

it("refuses an initially captured SSH card whose action or installed state is not a fresh install", async () => {
  for (const change of [
    { action: "reinstall" },
    { installedVersion: "0.3.0" },
  ]) {
    const f = fixture();
    Object.assign(f.card, change);
    const observer = f.start();
    await expect(f.invoke({ operation: "catalog-refresh" })).rejects.toThrow();
    observer.stop();
  }
});
