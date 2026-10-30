import { writeFile } from "node:fs/promises";
import { extensionInvocationTarget } from "../../src/main/extension-invocation-target";
import type { IpcEvent } from "../../src/main/terminal-ipc-types";
import type { ExtensionsResult } from "../../src/shared/extensions";
export type Handler = (
  event: IpcEvent,
  ...args: unknown[]
) => Promise<ExtensionsResult>;
import { expect, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { startApplicationExtensions } from "../../src/main/application-extensions";
import type { ExtensionViewHostOptions } from "../../src/main/extension-view-host";
import { packageArchive } from "./extension-package-archive";
import type { Backend } from "../../src/extension-runtime/runtime";
import { InstalledPackages } from "../../src/installed-packages/installed-packages";
import path from "node:path";

export async function applicationBackend(
  root: string,
  signal: AbortSignal,
): Promise<Backend> {
  const packages = await InstalledPackages.open({
    root: path.join(root, "extensions"),
    runtime: { appVersion: "0.23.0-dev.5", apiVersion: "0.1.0" },
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  const entry = (await packages.snapshot())[0]!;
  return {
    epoch: "controlled-application-backend",
    signal,
    selection: {
      id: entry.id,
      generation: entry.generation,
      digest: entry.digest!,
    },
    state: () => "active",
    call: vi.fn(async () => ({ ok: true })),
    retire: vi.fn<Backend["retire"]>(),
  };
}
export const manifest = {
  format: 1,
  id: "example.files",
  name: "Files",
  version: "1.0.0",
  engines: { omxterm: ">=0.23.0-0", api: "0.1.x" },
  backend: "backend.mjs",
  view: { entry: "index.html", action: "example.files.open", title: "Files" },
};
export function bytes(version = "1.0.0") {
  return packageArchive([
    { name: "extension.json", data: JSON.stringify({ ...manifest, version }) },
    { name: "backend.mjs", data: "" },
    { name: "index.html", data: "<h1>Files</h1>" },
  ]);
}
export async function exerciseCompanionRouting(
  context: Pick<
    Parameters<typeof exerciseSshRouting>[1],
    "archive" | "window" | "service" | "request"
  >,
  adapters: {
    hosts: {
      open: ReturnType<typeof vi.fn>;
      reveal: ReturnType<typeof vi.fn>;
      retire: ReturnType<typeof vi.fn>;
      options: ExtensionViewHostOptions;
    }[];
    activate: ReturnType<typeof vi.fn>;
  },
) {
  const { archive, window, service, request } = context;
  await writeFile(
    archive,
    packageArchive([
      {
        name: "extension.json",
        data: JSON.stringify({
          ...manifest,
          id: "omxterm.files",
          view: { ...manifest.view, action: "omxterm.files.open" },
        }),
      },
      { name: "backend.mjs", data: "" },
      { name: "index.html", data: "<h1>Files</h1>" },
    ]),
  );
  await request({ operation: "install" });
  const targets = extensionInvocationTarget(window);
  targets.started("s1");
  targets.selected("s1");
  service.registerWindow(window, (source, context) =>
    targets.capture(() => "/original", source, context),
  );
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  const host = adapters.hosts[0]!;
  expect(host.open).toHaveBeenCalledWith({
    entryResource: "index.html",
    title: "Files",
    presentation: "panel",
  });
  targets.ended("s1");
  expect(host.retire).not.toHaveBeenCalled();
  expect(
    await host.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/original" });
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(host.reveal).toHaveBeenCalledOnce());
  expect(adapters.hosts).toHaveLength(1);
  expect(adapters.activate).toHaveBeenCalledOnce();
  window.emit("closed");
  expect(host.retire).toHaveBeenCalledOnce();
}

export async function exerciseSshRouting(
  declared: boolean,
  context: {
    archive: string;
    window: BrowserWindow;
    service: Awaited<ReturnType<typeof startApplicationExtensions>>;
    request(value: unknown): Promise<unknown>;
    hosts: {
      open: ReturnType<typeof vi.fn>;
      options: ExtensionViewHostOptions;
    }[];
    sshOpen: ReturnType<
      typeof vi.fn<
        Parameters<typeof startApplicationExtensions>[0]["ssh"]["open"]
      >
    >;
  },
) {
  const { archive, window, service, request, hosts, sshOpen } = context;
  await writeFile(
    archive,
    packageArchive([
      {
        name: "extension.json",
        data: JSON.stringify({
          ...manifest,
          ...(declared ? { capabilities: ["terminal.openSsh.v1"] } : {}),
        }),
      },
      { name: "backend.mjs", data: "" },
      { name: "index.html", data: "<h1>SSH</h1>" },
    ]),
  );
  await request({ operation: "install" });
  service.contextMenu(window, "s1", () => true)[0]!.click();
  await vi.waitFor(() => expect(hosts[0]?.open).toHaveBeenCalled());
  const viewRequest = (
    value: Parameters<NonNullable<ExtensionViewHostOptions["onRequest"]>>[0],
    signal: AbortSignal,
  ) =>
    hosts[0]!.options.onRequest!(value, signal, {
      id: "hosted-view",
      isCurrentVisible: () => true,
    });
  const signal = new AbortController().signal;
  expect(await viewRequest({ operation: "host.capabilities" }, signal)).toEqual(
    { capabilities: declared ? ["terminal.openSsh.v1"] : [] },
  );
  const committed = vi.fn();
  sshOpen.mockImplementation(async (_owner, _view, _source, _target, admit) => {
    await admit(committed);
    return { ok: true, status: "accepted" };
  });
  const launching = viewRequest(
    { operation: "terminal.openSsh.v1", target: { host: "alias" } },
    signal,
  );
  if (declared) {
    expect(await launching).toEqual({ ok: true, status: "accepted" });
    expect(sshOpen).toHaveBeenCalledWith(
      window,
      expect.any(Object),
      "hosted-view",
      { host: "alias" },
      expect.any(Function),
    );
    expect(committed).toHaveBeenCalledOnce();
  } else {
    await expect(launching).rejects.toThrow("unavailable");
    expect(sshOpen).not.toHaveBeenCalled();
  }
}
