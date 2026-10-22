import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSavedSessionService,
  type SessionLaunchBase,
} from "../../src/main/saved-sessions";
import {
  isTerminalLaunchSpec,
  workingDirectoryFromReport,
} from "../../src/shared/terminal-launch";
import { findExecutable } from "../../src/main/executable-lookup";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-sessions-"));
  roots.push(root);
  return root;
}

const base = {
  shell: "/bin/bash",
  platform: "linux",
  homeDirectory: "/home/me",
  applicationVersionProvider: { getVersion: () => "1" },
  environment: {},
  onOutput: () => {},
  onExit: () => {},
} satisfies SessionLaunchBase;

async function service() {
  const root = await directory();
  const sessions = createSavedSessionService({
    directory: root,
    homeDirectory: root,
    platform: "linux",
    sshExecutable: () => "/usr/bin/ssh",
    now: () => 1_700_000_000_000,
    readSshConfig: async () => [
      { alias: "web", forwardX11: true },
      { alias: "existing" },
    ],
  });
  await sessions.load();
  return { sessions, root };
}

describe("Saved Session service", () => {
  it("assigns ids, persists definitions and notifies subscribers", async () => {
    const { sessions, root } = await service();
    const listener = vi.fn();
    sessions.subscribe(listener);
    const saved = await sessions.saveSession({
      kind: "ssh",
      name: "Prod",
      host: "prod.example.com",
      authentication: "agent",
    });
    expect(saved.id).toMatch(/^[A-Za-z0-9_-]{12}$/u);
    expect(listener).toHaveBeenCalledOnce();
    const reloaded = createSavedSessionService({
      directory: root,
      homeDirectory: root,
      platform: "linux",
      sshExecutable: () => "ssh",
    });
    await reloaded.load();
    expect(reloaded.current().sessions).toEqual([saved]);
    await expect(
      sessions.saveSession({ kind: "ssh", name: "x" }),
    ).rejects.toThrow();
  });

  it("deletes folders with their subfolders and sessions", async () => {
    const { sessions } = await service();
    const parent = await sessions.saveFolder({ name: "Prod" });
    const child = await sessions.saveFolder({
      name: "DB",
      parentId: parent.id,
    });
    await sessions.saveSession({
      kind: "local",
      name: "In child",
      folderId: child.id,
    });
    await sessions.saveSession({ kind: "local", name: "Root" });
    await sessions.deleteFolder(parent.id);
    expect(sessions.current().folders).toEqual([]);
    expect(sessions.current().sessions.map((session) => session.name)).toEqual([
      "Root",
    ]);
  });

  it("builds ssh launches as literal argv for the system client", async () => {
    const { sessions } = await service();
    const saved = await sessions.saveSession({
      kind: "ssh",
      name: "Prod",
      host: "prod.example.com",
      user: "deploy",
      authentication: "agent",
    });
    const launch = sessions.launchOptions(saved.id, base);
    expect(launch.title).toBe("Prod");
    expect(launch.launchRequest).toEqual({
      kind: "explicit-command",
      executable: "/usr/bin/ssh",
      arguments: expect.arrayContaining([
        "-l",
        "deploy",
        "prod.example.com",
      ]) as unknown as string[],
    });
    await vi.waitFor(() =>
      expect(sessions.current().sessions[0]!.lastUsedAt).toBe(
        1_700_000_000_000,
      ),
    );
    expect(() => sessions.launchOptions("missing", base)).toThrow(
      /no longer exists/u,
    );
  });

  it("starts local sessions in their directory with literal program arguments", async () => {
    const { sessions, root } = await service();
    const saved = await sessions.saveSession({
      kind: "local",
      name: "Logs",
      workingDirectory: root,
      program: "/usr/bin/tail",
      arguments: ["-f", "file with spaces.log"],
      initialInput: "echo ready\necho done",
    });
    const launch = sessions.launchOptions(saved.id, base);
    expect(launch.workingDirectory).toBe(root);
    expect(launch.launchRequest).toEqual({
      kind: "explicit-command",
      executable: "/usr/bin/tail",
      arguments: ["-f", "file with spaces.log"],
    });
    expect(launch.initialInput).toBe("echo ready\recho done\r");
    const missing = await sessions.saveSession({
      kind: "local",
      name: "Gone",
      workingDirectory: path.join(root, "nope"),
    });
    expect(() => sessions.launchOptions(missing.id, base)).toThrow(
      /does not exist/u,
    );
  });

  it("imports ssh_config hosts once, keeping the alias as destination", async () => {
    const { sessions } = await service();
    await sessions.saveSession({
      kind: "ssh",
      name: "Existing",
      host: "existing",
      authentication: "agent",
    });
    expect(await sessions.importSshConfig()).toEqual({ added: 1 });
    expect(sessions.current().sessions[1]).toMatchObject({
      name: "web",
      host: "web",
      x11: true,
    });
    expect(await sessions.importSshConfig()).toEqual({ added: 0 });
  });

  it("round-trips exports and remaps colliding ids on import", async () => {
    const { sessions } = await service();
    const folder = await sessions.saveFolder({ name: "Team" });
    await sessions.saveSession({
      kind: "local",
      name: "A",
      folderId: folder.id,
    });
    const exported = JSON.parse(sessions.exportDocument()) as Record<
      string,
      unknown
    >;
    expect(exported.format).toBe("omxterm-sessions");
    const result = await sessions.importDocument({
      folders: exported.folders,
      sessions: exported.sessions,
    });
    expect(result).toEqual({ added: 1 });
    const document = sessions.current();
    expect(document.folders).toHaveLength(2);
    expect(new Set(document.sessions.map((session) => session.id)).size).toBe(
      2,
    );
    expect(document.sessions[1]!.folderId).toBe(document.folders[1]!.id);
  });

  it("creates validated, unsaved Quick Connect definitions", async () => {
    const { sessions } = await service();
    expect(sessions.quickConnect("ops@db:2200")).toMatchObject({
      kind: "ssh",
      name: "ops@db:2200",
      host: "db",
      user: "ops",
      port: 2200,
    });
    expect(sessions.quickConnect("-oProxyCommand=x")).toBeUndefined();
    expect(sessions.current().sessions).toEqual([]);
  });
});

describe("terminal launch requests", () => {
  it("accepts only intent-shaped launch specs", () => {
    expect(isTerminalLaunchSpec({ kind: "inherit", sessionId: "s1" })).toBe(
      true,
    );
    expect(isTerminalLaunchSpec({ kind: "saved-session", id: "abc" })).toBe(
      true,
    );
    expect(isTerminalLaunchSpec({ kind: "quick-ssh", target: "h" })).toBe(true);
    expect(
      isTerminalLaunchSpec({ kind: "saved-session", id: "abc", program: "x" }),
    ).toBe(false);
    expect(isTerminalLaunchSpec({ kind: "exec", program: "/bin/sh" })).toBe(
      false,
    );
    expect(isTerminalLaunchSpec({ kind: "saved-session", id: "../x" })).toBe(
      false,
    );
  });

  it("trusts OSC 7 directories only from this machine", () => {
    expect(workingDirectoryFromReport("file:///home/me/src", [])).toBe(
      "/home/me/src",
    );
    expect(
      workingDirectoryFromReport("file://laptop/home/a%20b", ["Laptop"]),
    ).toBe("/home/a b");
    expect(workingDirectoryFromReport("file://localhost/tmp", [])).toBe("/tmp");
    expect(
      workingDirectoryFromReport("file://server/etc", ["laptop"]),
    ).toBeUndefined();
    expect(workingDirectoryFromReport("http://x/y", [])).toBeUndefined();
    expect(workingDirectoryFromReport("file:///C:/Users/me", [])).toBe(
      "C:\\Users\\me",
    );
    expect(workingDirectoryFromReport("file:///a%00b", [])).toBeUndefined();
  });
});

describe.skipIf(process.platform === "win32")("executable lookup", () => {
  it("searches PATH without a shell and checks the execute bit", async () => {
    const root = await directory();
    const bin = path.join(root, "bin");
    await mkdir(bin);
    await writeFile(path.join(bin, "tool"), "#!/bin/sh\n");
    await chmod(path.join(bin, "tool"), 0o755);
    await writeFile(path.join(bin, "data"), "x");
    const environment = { PATH: `/nonexistent:${bin}` };
    expect(findExecutable("tool", environment, "linux")).toBe(
      path.join(bin, "tool"),
    );
    expect(findExecutable("data", environment, "linux")).toBeUndefined();
    expect(findExecutable("../bin/tool", environment, "linux")).toBeUndefined();
    expect(findExecutable(path.join(bin, "tool"), {}, "linux")).toBe(
      path.join(bin, "tool"),
    );
  });
});
