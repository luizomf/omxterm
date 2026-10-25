import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetHostKey,
  knownHostsName,
  registerHostKeyIpc,
  userKnownHostsFile,
} from "../../src/main/ssh-known-hosts";
import { findExecutable } from "../../src/main/executable-lookup";
import { sessionIpc } from "../../src/shared/session-ipc";
import {
  diagnoseSshFailure,
  isUserKnownHostsFile,
} from "../../src/shared/ssh-failure";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

// The exact message a user saw after the other computer was reinstalled.
const CHANGED = [
  "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
  "@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @",
  "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
  "IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!",
  "Someone could be eavesdropping on you right now (man-in-the-middle attack)!",
  "It is also possible that a host key has just been changed.",
  "The fingerprint for the ED25519 key sent by the remote host is",
  "SHA256:ciXGnVCNSj+wvn+AqFpb5fVZ5J2cvthQfeHIWwQTeOA.",
  "Please contact your system administrator.",
  "Add correct host key in /home/ruscher/.ssh/known_hosts to get rid of this message.",
  "Offending ECDSA key in /home/ruscher/.ssh/known_hosts:148",
  "Host key for 192.168.0.121 has changed and you have requested strict checking.",
  "Host key verification failed.",
  "",
].join("\r\n");

describe("SSH failure diagnosis", () => {
  it("reads a changed host key with its fingerprint and offending entry", () => {
    expect(diagnoseSshFailure(CHANGED)).toEqual({
      kind: "host-key-changed",
      fingerprint: "SHA256:ciXGnVCNSj+wvn+AqFpb5fVZ5J2cvthQfeHIWwQTeOA",
      knownHostsFile: "/home/ruscher/.ssh/known_hosts",
      line: 148,
    });
    expect(diagnoseSshFailure(`\u001b[31m${CHANGED}\u001b[0m`).kind).toBe(
      "host-key-changed",
    );
  });

  it.each([
    ["Host key verification failed.", "host-key-unverified"],
    ["deploy@db: Permission denied (publickey).", "authentication"],
    ["ssh: connect to host db port 22: Connection refused", "refused"],
    ["ssh: connect to host db port 22: Connection timed out", "timeout"],
    ["ssh: connect to host db port 22: No route to host", "unreachable"],
    [
      "ssh: Could not resolve hostname db: Name or service not known",
      "unknown-host",
    ],
  ] as const)("recognizes %j", (output, kind) => {
    expect(diagnoseSshFailure(`${output}\r\n`).kind).toBe(kind);
  });

  it("keeps a bounded last line for anything else", () => {
    expect(
      diagnoseSshFailure("first\r\nkex_exchange_identification: read\r\n\r\n"),
    ).toEqual({
      kind: "unknown",
      detail: "kex_exchange_identification: read",
    });
    expect(diagnoseSshFailure("")).toEqual({ kind: "unknown" });
    const long = diagnoseSshFailure("x".repeat(1000));
    expect(long.kind === "unknown" && long.detail?.length).toBe(300);
  });

  it("offers cleaning only the user's own known_hosts", () => {
    expect(isUserKnownHostsFile("/home/me/.ssh/known_hosts")).toBe(true);
    expect(isUserKnownHostsFile("C:\\Users\\me\\.ssh\\known_hosts")).toBe(true);
    expect(isUserKnownHostsFile("/etc/ssh/ssh_known_hosts")).toBe(false);
  });
});

describe("Forgetting a host key", () => {
  it("names the host as ssh-keygen does", () => {
    expect(knownHostsName({ host: "192.168.0.121" })).toBe("192.168.0.121");
    expect(knownHostsName({ host: "db", port: 22 })).toBe("db");
    expect(knownHostsName({ host: "db", port: 2222 })).toBe("[db]:2222");
    expect(knownHostsName({ host: "[::1]", port: 2222 })).toBe("[::1]:2222");
    expect(userKnownHostsFile("/home/me", "linux")).toBe(
      "/home/me/.ssh/known_hosts",
    );
  });

  const sshKeygen = findExecutable("ssh-keygen", process.env, process.platform);
  it.skipIf(!sshKeygen || process.platform === "win32")(
    "removes only that host with the real ssh-keygen and keeps a backup",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "omx-known-"));
      roots.push(root);
      const keyFile = path.join(root, "key");
      execFileSync(sshKeygen!, [
        "-q",
        "-t",
        "ed25519",
        "-N",
        "",
        "-f",
        keyFile,
      ]);
      const key = (await readFile(`${keyFile}.pub`, "utf8"))
        .split(" ")
        .slice(0, 2)
        .join(" ");
      const knownHostsFile = path.join(root, "known_hosts");
      await writeFile(
        knownHostsFile,
        `192.168.0.121 ${key}\nother.example ${key}\n[192.168.0.121]:2222 ${key}\n`,
      );
      expect(
        await forgetHostKey(
          { host: "192.168.0.121" },
          { sshKeygen: sshKeygen!, knownHostsFile },
        ),
      ).toBe(true);
      const remaining = await readFile(knownHostsFile, "utf8");
      expect(remaining).not.toMatch(/^192\.168\.0\.121 /mu);
      expect(remaining).toContain("other.example");
      expect(remaining).toContain("[192.168.0.121]:2222");
      expect(await readFile(`${knownHostsFile}.old`, "utf8")).toContain(
        "192.168.0.121 ",
      );
      expect(
        await forgetHostKey(
          { host: "192.168.0.121" },
          { sshKeygen: sshKeygen!, knownHostsFile },
        ),
      ).toBe(false);
    },
  );

  it("resolves the host from the session in main, never from the renderer", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => unknown
    >();
    const sender = { mainFrame: {} };
    const trusted = { sender, senderFrame: sender.mainFrame };
    const run = vi.fn(async () => ({
      stdout: "# Host 192.168.0.121 found: line 148\n",
    }));
    registerHostKeyIpc(
      {
        handle: (channel: string, handler: unknown) =>
          handlers.set(channel, handler as never),
        removeHandler: (channel: string) => handlers.delete(channel),
      } as never,
      () => true,
      {
        resolve: (reference) =>
          reference.kind === "saved-session" && reference.id === "box"
            ? {
                id: "box",
                kind: "ssh",
                name: "Box",
                host: "192.168.0.121",
                authentication: "agent",
              }
            : reference.kind === "saved-session" && reference.id === "logs"
              ? { id: "logs", kind: "local", name: "Logs" }
              : undefined,
        sshKeygen: () => "/usr/bin/ssh-keygen",
        knownHostsFile: "/home/me/.ssh/known_hosts",
        run,
      },
    );
    const forget = (payload: unknown) =>
      Promise.resolve().then(() =>
        handlers.get(sessionIpc.forgetHostKey)!(trusted, payload),
      );
    await expect(forget({ kind: "saved-session", id: "box" })).resolves.toEqual(
      { removed: true },
    );
    expect(run).toHaveBeenCalledExactlyOnceWith("/usr/bin/ssh-keygen", [
      "-R",
      "192.168.0.121",
      "-f",
      "/home/me/.ssh/known_hosts",
    ]);
    await expect(forget({ kind: "saved-session", id: "logs" })).rejects.toThrow(
      "not an SSH session",
    );
    await expect(
      forget({ kind: "saved-session", id: "box", host: "evil" }),
    ).rejects.toThrow("Invalid session reference");
    await expect(forget({ kind: "inherit", sessionId: "s1" })).rejects.toThrow(
      "Invalid session reference",
    );
    expect(run).toHaveBeenCalledOnce();
  });
});
