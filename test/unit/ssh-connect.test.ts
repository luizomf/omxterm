import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  symlink,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  captureSshTarget,
  parseSshTarget,
  sshArguments,
} from "../../src/shared/ssh-target";
import { discoverAliases } from "../../extensions/ssh/discovery";
import { activate } from "../../extensions/ssh/backend";
import { captureValue } from "../../src/extension-runtime/protocol";
import {
  createSshTerminalLaunch,
  findSsh,
} from "../../src/main/ssh-terminal-launch";

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ssh-index-"));
  roots.push(root);
  await mkdir(path.join(root, ".ssh"));
  return root;
}
const signal = () => new AbortController().signal;

describe("SSH semantic target", () => {
  it.each([
    ["alias_name", ["--", "alias_name"]],
    [" user@host:00022 ", ["-l", "user", "-p", "22", "--", "host"]],
    [
      "user@[2001:db8::1]:2222",
      ["-l", "user", "-p", "2222", "--", "2001:db8::1"],
    ],
    ["[::ffff:192.0.2.1]", ["--", "::ffff:192.0.2.1"]],
  ])("constructs literal argv for %s", (input, argv) =>
    expect(sshArguments(parseSshTarget(input as string))).toEqual(argv),
  );
  it.each([
    "-oProxyCommand=x",
    "host echo bad",
    "ssh://host",
    "a@b@c",
    "host:0",
    "host:65536",
    "host:+22",
    "::1",
    "[abcd]",
    "[1::2::3]",
    "[fe80::1%eth0]",
    "host\n",
    "\thost",
    "host;id",
    "h".repeat(254),
  ])("rejects %s", (input) => expect(() => parseSshTarget(input)).toThrow());
  it("copies exact semantic input and rejects extra authority", () => {
    const target = { host: "host", port: 22 };
    const captured = captureSshTarget(target);
    target.host = "changed";
    expect(captured.host).toBe("host");
    expect(() =>
      captureSshTarget({ host: "host", executable: "/bin/sh" }),
    ).toThrow();
    expect(() => captureSshTarget({ host: "host", user: undefined })).toThrow();
  });
});

describe("bounded static index", () => {
  it("shares inline condition state, anchors includes at .ssh and never evaluates Match", async () => {
    const home = await fixture();
    const ssh = path.join(home, ".ssh");
    await mkdir(path.join(ssh, "parts"));
    const config =
      'Include parts/a\nInclude skipped\nMatch exec "touch forbidden"\nHost later\nHost *\nInclude nested\n';
    await writeFile(path.join(ssh, "config"), config);
    await writeFile(path.join(ssh, "parts/a"), "Include nested\nHost child\n");
    await writeFile(path.join(ssh, "nested"), "Host base\n");
    await writeFile(path.join(ssh, "skipped"), "Host forbidden\n");
    const before = await stat(path.join(ssh, "config"));
    const result = await discoverAliases(home, signal());
    expect(result.aliases).toEqual(["base", "child", "later"]);
    expect(result.reasons.conditional).toBe(1);
    expect(await readFile(path.join(ssh, "config"), "utf8")).toBe(config);
    expect((await stat(path.join(ssh, "config"))).mtimeMs).toBe(before.mtimeMs);
  });
  it("reads a Windows-edited config with CRLF lines and skips backslash includes", async () => {
    const home = await fixture();
    await writeFile(
      path.join(home, ".ssh/config"),
      "Include conf.d\\extra\r\nHost work\r\n  HostName 192.0.2.1\r\nHost home-box\r\n",
    );
    const result = await discoverAliases(home, signal());
    expect(result.aliases).toEqual(["work", "home-box"]);
    // Backslashes aren't parsed; the list just reports itself incomplete.
    expect(result.incomplete).toBe(true);
  });
  it("sorts globs, permits symlink configs and detects active-stack cycles", async () => {
    const home = await fixture();
    const ssh = path.join(home, ".ssh");
    await writeFile(path.join(ssh, "source"), "Include *.part\nHost final\n");
    await symlink("source", path.join(ssh, "config"));
    await writeFile(path.join(ssh, "b.part"), "Host b\nHost *\n");
    await writeFile(
      path.join(ssh, "a.part"),
      "Include config\nHost a\nHost *\n",
    );
    const result = await discoverAliases(home, signal());
    expect(result.aliases).toEqual(["a", "b", "final"]);
    expect(result.reasons.cycle).toBe(1);
  });
  it("keeps 256 maximum-length aliases through both real capture hops", async () => {
    const home = await fixture();
    const aliases = Array.from({ length: 257 }, (_, i) =>
      `${i}`.padEnd(253, "a"),
    );
    await writeFile(
      path.join(home, ".ssh/config"),
      aliases.map((alias) => `Host ${alias}`).join("\n"),
    );
    const result = await discoverAliases(home, signal());
    expect(result.aliases).toEqual(aliases.slice(0, 256));
    expect(result.reasons["alias-limit"]).toBe(1);
    expect(captureValue(captureValue(result))).toEqual(result);
  });
  it("reports malformed/unsupported/oversized input and treats missing config as normal", async () => {
    const home = await fixture();
    expect(await discoverAliases(home, signal())).toEqual({
      aliases: [],
      incomplete: false,
      reasons: {},
    });
    await writeFile(
      path.join(home, ".ssh/config"),
      'Include ${HOME}/config\nHost "bad\nHost valid\n' + "x".repeat(4097),
    );
    const result = await discoverAliases(home, signal());
    expect(result.aliases).toEqual(["valid"]);
    expect(result.reasons).toMatchObject({
      unsupported: 1,
      syntax: 1,
      "line-limit": 1,
    });
    await writeFile(path.join(home, ".ssh/config"), "x".repeat(256 * 1024 + 1));
    expect((await discoverAliases(home, signal())).reasons["byte-limit"]).toBe(
      1,
    );
  });
  it("holds all eight actual discovery slots after caller cancellation", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const backend = activate({ signal: signal() }, async () => {
      await gate;
      return { aliases: [], incomplete: false, reasons: {} };
    });
    const caller = new AbortController();
    const work = Array.from({ length: 8 }, () =>
      backend.invoke({ operation: "aliases" }, caller.signal),
    );
    caller.abort();
    expect(await backend.invoke({ operation: "aliases" }, signal())).toEqual({
      ok: false,
      error: "busy",
    });
    finish();
    await Promise.all(work);
    expect(
      await backend.invoke({ operation: "aliases" }, signal()),
    ).toMatchObject({ ok: true });
  });
});

it("resolves only executable regular files under absolute application PATH entries", async () => {
  const home = await fixture();
  await writeFile(path.join(home, "client"), "not executed", { mode: 0o700 });
  await symlink("client", path.join(home, "ssh"));
  expect(
    await findSsh(
      { PATH: ["", ".", "relative", home].join(path.delimiter) },
      "linux",
    ),
  ).toBe(path.join(home, "ssh"));
  expect(
    await findSsh(
      { PATH: ["", ".", "relative"].join(path.delimiter) },
      "linux",
    ),
  ).toBeUndefined();
});

it("looks for ssh.exe only on Windows and never for an ssh directory", async () => {
  const home = await fixture();
  await writeFile(path.join(home, "ssh.exe"), "not executed", { mode: 0o700 });
  const environment = { PATH: home, PATHEXT: ".EXE;.CMD" };
  expect(await findSsh(environment, "linux")).toBeUndefined();
  expect(await findSsh(environment, "win32")).toBe(path.join(home, "ssh.exe"));
  await mkdir(path.join(home, "ssh"));
  expect(await findSsh(environment, "linux")).toBeUndefined();
  await rm(path.join(home, "ssh"), { recursive: true });
  await writeFile(path.join(home, "ssh"), "not executed", { mode: 0o700 });
  expect(await findSsh(environment, "linux")).toBe(path.join(home, "ssh"));
});

it("transfers to the original core owner once, independently of later extension revocation", async () => {
  const a = {},
    b = {},
    view = {};
  const messages: { owner: object; token: string }[] = [];
  let live = true;
  const launcher = createSshTerminalLaunch({
    lookup: async () => "/usr/bin/ssh",
    alive: () => live,
    notify(owner: object, message) {
      messages.push({ owner, token: message.token });
    },
  });
  const opening = launcher.open(
    a,
    view,
    "view-a",
    { host: "alias", port: 22 },
    async (commit) => commit(),
  );
  await Promise.resolve();
  await Promise.resolve();
  const token = messages[0]!.token;
  expect(messages[0]!.owner).toBe(a);
  expect(() => launcher.consume(b, token)).toThrow();
  launcher.acknowledge(a, token, true);
  expect(await opening).toEqual({ ok: true, status: "accepted" });
  expect(launcher.consume(a, token)).toEqual({
    request: {
      kind: "explicit-command",
      executable: "/usr/bin/ssh",
      arguments: ["-p", "22", "--", "alias"],
    },
    title: "SSH · alias",
  });
  expect(() => launcher.consume(a, token)).toThrow();
  live = false;
  await expect(
    launcher.open(a, view, "view-a", { host: "alias" }, async (commit) =>
      commit(),
    ),
  ).rejects.toThrow();
  launcher.dispose();
});

it.each(["expiry", "quit"])(
  "bounds pending launches and revokes outstanding tokens on %s",
  async (ending) => {
    vi.useFakeTimers();
    const owner = {},
      view = {};
    const tokens: string[] = [];
    const launcher = createSshTerminalLaunch({
      lookup: async () => "/ssh",
      alive: () => true,
      notify(_owner: object, message) {
        tokens.push(message.token);
      },
    });
    const open = (source: object) =>
      launcher.open(owner, source, "view", { host: "alias" }, async (commit) =>
        commit(),
      );
    const first = open(view);
    await Promise.resolve();
    await expect(open(view)).rejects.toThrow("busy");
    const remaining = Array.from({ length: 31 }, () => open({}));
    await Promise.resolve();
    expect(tokens).toHaveLength(32);
    await expect(open({})).rejects.toThrow("busy");
    if (ending === "expiry") vi.advanceTimersByTime(60_000);
    else launcher.dispose();
    expect(await Promise.all([first, ...remaining])).toEqual(
      Array.from({ length: 32 }, () => ({
        ok: false,
        error: "outcome-unknown",
      })),
    );
    for (const token of tokens)
      expect(() => launcher.consume(owner, token)).toThrow();
    if (ending === "quit")
      await expect(open({})).rejects.toThrow("unavailable");
    launcher.dispose();
  },
);

it("local pre-transfer revocation refuses; core cancellation and Quit revoke unused tokens", async () => {
  const owner = {};
  let token = "";
  const launcher = createSshTerminalLaunch({
    lookup: async () => "/ssh",
    alive: () => true,
    notify(_owner: object, message) {
      token = message.token;
    },
  });
  await expect(
    launcher.open(owner, {}, "view", { host: "alias" }, async () => {
      throw new Error("revoked");
    }),
  ).rejects.toThrow("revoked");
  expect(token).toBe("");
  const opening = launcher.open(
    owner,
    {},
    "view",
    { host: "alias" },
    async (commit) => commit(),
  );
  await Promise.resolve();
  await Promise.resolve();
  launcher.cancel(owner, token);
  expect(await opening).toMatchObject({ error: "outcome-unknown" });
  expect(() => launcher.consume(owner, token)).toThrow();
  launcher.dispose();
});
