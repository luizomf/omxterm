import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatForward,
  isValidHost,
  isValidJumpHosts,
  parseForwardLine,
  parseSshTarget,
  validateSession,
  validateSessionDocument,
  validateSshOption,
} from "../../src/shared/saved-sessions";
import { sshArguments, sshDisplayTarget } from "../../src/main/ssh-command";
import {
  readSshConfigHosts,
  tokenize,
  type SshConfigReader,
} from "../../src/main/ssh-config-import";

const ssh = (fields: Record<string, unknown>) =>
  validateSession({
    id: "s1",
    kind: "ssh",
    name: "Server",
    host: "example.com",
    authentication: "agent",
    ...fields,
  });

describe("Saved Session validation", () => {
  it("rejects hosts that ssh would parse as options or that contain spaces", () => {
    expect(isValidHost("example.com")).toBe(true);
    expect(isValidHost("10.0.0.1")).toBe(true);
    expect(isValidHost("[2001:db8::1]")).toBe(true);
    expect(isValidHost("my_alias")).toBe(true);
    expect(isValidHost("-oProxyCommand=evil")).toBe(false);
    expect(isValidHost("a b")).toBe(false);
    expect(isValidHost("host;rm")).toBe(false);
    expect(isValidHost("")).toBe(false);
  });

  it("parses Quick Connect targets", () => {
    expect(parseSshTarget("deploy@db.internal:2222")).toEqual({
      user: "deploy",
      host: "db.internal",
      port: 2222,
    });
    expect(parseSshTarget("host")).toEqual({ host: "host" });
    expect(parseSshTarget("root@[2001:db8::1]:22")).toEqual({
      user: "root",
      host: "[2001:db8::1]",
      port: 22,
    });
    expect(parseSshTarget("host:99999")).toBeUndefined();
    expect(parseSshTarget("-J evil")).toBeUndefined();
    expect(parseSshTarget("a@b c")).toBeUndefined();
    expect(isValidJumpHosts("bastion,ops@hop:2200")).toBe(true);
    expect(isValidJumpHosts("bastion,-x")).toBe(false);
  });

  it("refuses ssh options that run local programs or weaken host checks", () => {
    expect(validateSshOption("ServerAliveCountMax=3")).toBe(
      "ServerAliveCountMax=3",
    );
    for (const option of [
      "ProxyCommand=nc %h %p",
      "LocalCommand=touch /tmp/x",
      "PermitLocalCommand=yes",
      "StrictHostKeyChecking=no",
      "UserKnownHostsFile=/dev/null",
      "KnownHostsCommand=x",
    ])
      expect(() => validateSshOption(option), option).toThrow();
    expect(() => validateSshOption("NoValue")).toThrow();
    expect(() => validateSshOption("Bad Name=x")).toThrow();
  });

  it("parses and formats port forwarding lines", () => {
    expect(parseForwardLine("L 8080:localhost:80")).toEqual({
      kind: "local",
      listenPort: 8080,
      host: "localhost",
      hostPort: 80,
    });
    expect(parseForwardLine("R 0.0.0.0:9000:db:5432")).toEqual({
      kind: "remote",
      bindAddress: "0.0.0.0",
      listenPort: 9000,
      host: "db",
      hostPort: 5432,
    });
    expect(parseForwardLine("D 1080")).toEqual({
      kind: "dynamic",
      listenPort: 1080,
    });
    expect(parseForwardLine("L [::1]:8080:localhost:80")).toMatchObject({
      bindAddress: "[::1]",
    });
    expect(parseForwardLine("L 8080:localhost")).toBeUndefined();
    expect(parseForwardLine("X 1:2:3")).toBeUndefined();
    expect(parseForwardLine("L 0:host:80")).toBeUndefined();
    for (const line of [
      "L 8080:localhost:80",
      "R 1.2.3.4:9000:db:5432",
      "D 1080",
    ])
      expect(formatForward(parseForwardLine(line)!)).toBe(line);
  });

  it("validates whole documents including folder references and cycles", () => {
    expect(
      validateSessionDocument({
        folders: [{ id: "f1", name: "Prod" }],
        sessions: [{ id: "a", kind: "local", name: "Shell", folderId: "f1" }],
      }).sessions,
    ).toHaveLength(1);
    expect(() =>
      validateSessionDocument({
        folders: [],
        sessions: [{ id: "a", kind: "local", name: "Shell", folderId: "nope" }],
      }),
    ).toThrow(/missing folder/u);
    expect(() =>
      validateSessionDocument({
        folders: [
          { id: "a", name: "A", parentId: "b" },
          { id: "b", name: "B", parentId: "a" },
        ],
        sessions: [],
      }),
    ).toThrow(/cycle/u);
    expect(() =>
      validateSessionDocument({
        folders: [],
        sessions: [
          { id: "a", kind: "local", name: "1" },
          { id: "a", kind: "local", name: "2" },
        ],
      }),
    ).toThrow(/duplicate/u);
    expect(() => ssh({ password: "secret" })).toThrow(/unknown/u);
    expect(() => ssh({ color: "red" })).toThrow(/color/u);
  });
});

describe("ssh argument vector", () => {
  const options = {
    platform: "linux",
    homeDirectory: "/home/me",
    controlDirectory: "/run/user/1000/omxterm/ssh",
  };

  it("keeps every value a separate literal argument", () => {
    const { arguments: argv, multiplexed } = sshArguments(
      ssh({
        user: "deploy",
        port: 2222,
        authentication: "key",
        identityFile: "~/.ssh/id_ed25519",
        compression: true,
        options: ["ServerAliveCountMax=5"],
        multiplex: false,
      }) as never,
      options,
    );
    expect(multiplexed).toBe(false);
    expect(argv).toEqual([
      "-o",
      "ConnectTimeout=30",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      "-o",
      "ServerAliveCountMax=5",
      "-i",
      "/home/me/.ssh/id_ed25519",
      "-o",
      "IdentitiesOnly=yes",
      "-C",
      "-p",
      "2222",
      "-l",
      "deploy",
      "example.com",
    ]);
  });

  it("shares connections unless a session turns it off", () => {
    expect(sshArguments(ssh({}) as never, options).multiplexed).toBe(true);
    expect(
      sshArguments(ssh({ multiplex: false }) as never, options).multiplexed,
    ).toBe(false);
  });

  it("multiplexes only when no forward, X11 or jump host needs a fresh connection", () => {
    const shared = sshArguments(ssh({ multiplex: true }) as never, options);
    expect(shared.multiplexed).toBe(true);
    expect(shared.arguments).toContain(
      "ControlPath=/run/user/1000/omxterm/ssh/%C",
    );
    expect(
      sshArguments(ssh({ multiplex: true, x11: true }) as never, options)
        .multiplexed,
    ).toBe(false);
    expect(
      sshArguments(ssh({ multiplex: true }) as never, {
        ...options,
        platform: "win32",
      }).multiplexed,
    ).toBe(false);
    const forwarded = sshArguments(
      ssh({
        multiplex: true,
        forwards: [
          { kind: "local", listenPort: 8080, host: "localhost", hostPort: 80 },
          { kind: "dynamic", bindAddress: "127.0.0.1", listenPort: 1080 },
        ],
        proxyJump: "bastion",
      }) as never,
      options,
    );
    expect(forwarded.multiplexed).toBe(false);
    expect(forwarded.arguments).toEqual(
      expect.arrayContaining([
        "ExitOnForwardFailure=yes",
        "-J",
        "bastion",
        "-L",
        "8080:localhost:80",
        "-D",
        "127.0.0.1:1080",
      ]),
    );
  });

  it("never disables host key verification and keeps OpenSSH's prompt by default", () => {
    const argv = sshArguments(ssh({}) as never, options).arguments;
    expect(
      argv.some((value) => value.startsWith("StrictHostKeyChecking")),
    ).toBe(false);
    expect(
      sshArguments(ssh({ hostKeyPolicy: "accept-new" }) as never, options)
        .arguments,
    ).toContain("StrictHostKeyChecking=accept-new");
  });

  it("runs a post-login command remotely and then a login shell", () => {
    const argv = sshArguments(
      ssh({ remoteCommand: "cd /srv && ls" }) as never,
      options,
    ).arguments;
    expect(argv.slice(-3)).toEqual([
      "-t",
      "example.com",
      'cd /srv && ls; exec "$SHELL" -l',
    ]);
  });

  it("prefers interactive password prompts for password sessions without storing them", () => {
    const argv = sshArguments(
      ssh({ authentication: "password" }) as never,
      options,
    ).arguments;
    expect(argv).toContain("PubkeyAuthentication=no");
    expect(argv.join(" ")).not.toMatch(/sshpass|password=/iu);
  });

  it("unbrackets IPv6 destinations and labels targets without secrets", () => {
    expect(
      sshArguments(
        ssh({ host: "[2001:db8::1]" }) as never,
        options,
      ).arguments.at(-1),
    ).toBe("2001:db8::1");
    expect(sshDisplayTarget({ host: "h", user: "u", port: 2200 })).toBe(
      "u@h:2200",
    );
    expect(sshDisplayTarget({ host: "h", port: 22 })).toBe("h");
  });
});

describe("ssh_config import", () => {
  // Real separators for the host OS: the importer resolves paths natively.
  const home = path.resolve("/home/me");
  const config = path.join(home, ".ssh", "config");
  const files: Record<string, string> = {
    [config]: [
      "# comment",
      "Host web prod-*",
      "  HostName web.example.com",
      "  User deploy",
      "  Port 2222",
      "  IdentityFile ~/.ssh/web",
      "  ForwardX11 yes",
      "Host db",
      "  HostName=db.internal",
      "  ProxyJump bastion",
      "  User first",
      "  User second",
      "Include conf.d/*.conf",
      "Match host other",
      "Host after-match",
    ].join("\n"),
    [path.join(home, ".ssh", "conf.d", "a.conf")]:
      'Host "quoted alias" extra\n  HostName extra.example.com',
    [path.join(home, ".ssh", "conf.d", "loop.conf")]: "Include ~/.ssh/config",
  };
  const reader: SshConfigReader = {
    async readFile(file) {
      if (!(file in files)) throw new Error("missing");
      return files[file]!;
    },
    async readdir() {
      return ["a.conf", "loop.conf", "ignored.txt"];
    },
  };

  it("imports concrete hosts, follows includes once and stops at Match", async () => {
    const hosts = await readSshConfigHosts(config, home, reader);
    expect(hosts.map((host) => host.alias).sort()).toEqual([
      "db",
      "extra",
      "quoted alias",
      "web",
    ]);
    expect(hosts[0]).toEqual({
      alias: "web",
      hostName: "web.example.com",
      user: "deploy",
      port: 2222,
      identityFile: "~/.ssh/web",
      forwardX11: true,
    });
    expect(hosts.find((host) => host.alias === "db")).toMatchObject({
      user: "first",
      proxyJump: "bastion",
    });
  });

  it("tokenizes quotes, equals signs and comments", () => {
    expect(tokenize('Host "a b" c # note')).toEqual(["Host", "a b", "c"]);
    expect(tokenize("HostName=x.example")).toEqual(["HostName", "x.example"]);
    expect(tokenize("   # only a comment")).toEqual([]);
  });
});
