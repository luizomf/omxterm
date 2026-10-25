import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Script } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCredentialStore,
  type SecretCipher,
} from "../../src/main/credential-store";
import {
  createSavedSessionService,
  type SessionLaunchBase,
} from "../../src/main/saved-sessions";
import {
  createSessionPasswords,
  registerSessionPasswordIpc,
} from "../../src/main/session-passwords";
import {
  ASKPASS_HELPER_SOURCE,
  ASKPASS_TOKEN_LIFETIME_MS,
  askpassLauncher,
  startSshAskpass,
  type SshAskpass,
} from "../../src/main/ssh-askpass";
import {
  isSessionPassword,
  isSessionPasswordChange,
  sessionIpc,
} from "../../src/shared/session-ipc";

const roots: string[] = [];
const disposers: (() => void)[] = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function directory() {
  // Short names: a Unix socket path is limited to about 104 bytes.
  const root = await mkdtemp(path.join(tmpdir(), "omx-pw-"));
  roots.push(root);
  return root;
}

function fakeCipher(available = true): SecretCipher {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: (text) =>
      Buffer.from([...Buffer.from(text)].map((b) => b ^ 0x5a)),
    decryptString: (bytes) =>
      Buffer.from([...bytes].map((b) => b ^ 0x5a)).toString("utf8"),
  };
}

// Sends a token to the askpass socket the way the helper does.
function ask(socketPath: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let answer = "";
    const client = connect(socketPath, () => client.write(`${token}\n`));
    client.setEncoding("utf8");
    client.on("data", (data: string) => (answer += data));
    client.on("close", () => resolve(answer));
    client.on("error", reject);
  });
}

async function broker(
  lookup = async (id: string) =>
    id === "session:db" ? "s3cret pass" : undefined,
  now = () => 1_000,
) {
  const root = await directory();
  const askpass = await startSshAskpass({
    directory: root,
    executable: "/opt/OMX Term/omxterm",
    lookup,
    now,
  });
  disposers.push(() => askpass.dispose());
  return { askpass, root };
}

// Stored passwords use a Unix socket; Windows keeps ssh's own prompt.
const unixOnly = process.platform === "win32";

describe("SSH askpass broker", () => {
  it.skipIf(unixOnly)(
    "answers one password per launch token and nothing else",
    async () => {
      let time = 1_000;
      const { askpass, root } = await broker(undefined, () => time);
      const environment = askpass.environment("session:db");
      expect(Object.keys(environment).sort()).toEqual([
        "OMXTERM_ASKPASS_SOCKET",
        "OMXTERM_ASKPASS_TOKEN",
        "SSH_ASKPASS",
        "SSH_ASKPASS_REQUIRE",
      ]);
      expect(environment.SSH_ASKPASS_REQUIRE).toBe("force");
      expect(JSON.stringify(environment)).not.toContain("s3cret");
      const socketPath = environment.OMXTERM_ASKPASS_SOCKET!;
      expect((await stat(socketPath)).mode & 0o777).toBe(0o600);
      expect((await stat(path.join(root, "askpass"))).mode & 0o777).toBe(0o700);

      const token = environment.OMXTERM_ASKPASS_TOKEN!;
      expect(await ask(socketPath, "forged")).toBe("");
      expect(await ask(socketPath, token)).toBe("s3cret pass");
      // A retry after a wrong password is typed at the terminal instead.
      expect(await ask(socketPath, token)).toBe("");
      expect(
        await ask(
          socketPath,
          askpass.environment("session:other").OMXTERM_ASKPASS_TOKEN!,
        ),
      ).toBe("");

      const late = askpass.environment("session:db").OMXTERM_ASKPASS_TOKEN!;
      time += ASKPASS_TOKEN_LIFETIME_MS + 1;
      expect(await ask(socketPath, late)).toBe("");
    },
  );

  it("quotes the launcher's paths as literals", () => {
    expect(askpassLauncher("/opt/it's/omxterm", "/run/a b/askpass.cjs")).toBe(
      [
        "#!/bin/sh",
        "# OMXTerm SSH_ASKPASS launcher; see ssh-askpass.ts.",
        `ELECTRON_RUN_AS_NODE=1 exec '/opt/it'\\''s/omxterm' '/run/a b/askpass.cjs' "$@"`,
        "",
      ].join("\n"),
    );
    expect(() => new Script(ASKPASS_HELPER_SOURCE)).not.toThrow();
  });

  it.skipIf(unixOnly)(
    "runs the helper: main answers a password prompt, other prompts never get it",
    async () => {
      const { askpass, root } = await broker();
      const helper = path.join(root, "askpass.cjs");
      expect(await readFile(helper, "utf8")).toBe(ASKPASS_HELPER_SOURCE);
      const environment = {
        ...process.env,
        ...askpass.environment("session:db"),
      };
      // The helper runs detached, without a controlling terminal, so its
      // terminal fallback cancels instead of waiting for input.
      const run = (prompt: string) =>
        new Promise<{ status: number | null; stdout: string }>((resolve) => {
          const child = spawn(process.execPath, [helper, prompt], {
            env: environment,
            stdio: ["ignore", "pipe", "ignore"],
            detached: true,
          });
          let stdout = "";
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (data: string) => (stdout += data));
          child.on("close", (status) => resolve({ status, stdout }));
        });
      const hostKey = await run(
        "Are you sure you want to continue connecting (yes/no/[fingerprint])? ",
      );
      expect(hostKey.stdout).not.toContain("s3cret");
      expect(await run("deploy@db.internal's password: ")).toEqual({
        status: 0,
        stdout: "s3cret pass\n",
      });
    },
  );
});

describe("Stored session passwords", () => {
  async function setup(
    options: { askpass?: boolean; available?: boolean } = {},
  ) {
    const root = await directory();
    const credentials = createCredentialStore(
      fakeCipher(options.available ?? true),
      root,
      "linux",
    );
    const askpass: SshAskpass = {
      environment: vi.fn((id: string) => ({
        OMXTERM_ASKPASS_TOKEN: `t-${id}`,
      })),
      dispose: vi.fn(),
    };
    const passwords = await createSessionPasswords(
      credentials,
      options.askpass === false ? undefined : askpass,
    );
    return { root, credentials, passwords, askpass };
  }

  it("keeps passwords in the keyring store and reports only whether one is saved", async () => {
    const { root, credentials, passwords } = await setup();
    expect(await passwords.state(undefined)).toEqual({
      storage: "available",
      saved: false,
    });
    await passwords.set("db", "s3cret pass");
    expect(await passwords.state("db")).toEqual({
      storage: "available",
      saved: true,
    });
    expect(
      await readFile(path.join(root, "credentials.json"), "utf8"),
    ).not.toContain("s3cret");
    expect(passwords.environment("db")).toEqual({
      OMXTERM_ASKPASS_TOKEN: "t-session:db",
    });
    expect(passwords.environment("web")).toBeUndefined();

    // A new process finds the stored password again.
    const again = await createSessionPasswords(credentials, {
      environment: () => ({}),
      dispose: () => {},
    });
    expect((await again.state("db")).saved).toBe(true);

    await passwords.reconcile({
      folders: [],
      sessions: [
        {
          id: "db",
          kind: "ssh",
          name: "DB",
          host: "db",
          authentication: "agent",
        },
      ],
    });
    expect(await credentials.has("session:db")).toBe(false);
    expect(passwords.environment("db")).toBeUndefined();
  });

  it("reports why storing is unavailable", async () => {
    expect(
      await (await setup({ available: false })).passwords.state(undefined),
    ).toEqual({ storage: "unavailable", saved: false });
    const unsupported = await setup({ askpass: false });
    expect(await unsupported.passwords.state(undefined)).toEqual({
      storage: "unsupported",
      saved: false,
    });
    await expect(unsupported.passwords.set("db", "x")).rejects.toThrow();
  });

  it("serves only exact changes for password sessions over trusted IPC", async () => {
    const { passwords, credentials } = await setup();
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => unknown
    >();
    const sender = { mainFrame: {} };
    const trusted = { sender, senderFrame: sender.mainFrame };
    registerSessionPasswordIpc(
      {
        handle: (channel: string, handler: unknown) =>
          handlers.set(channel, handler as never),
        removeHandler: (channel: string) => handlers.delete(channel),
      } as never,
      () => true,
      passwords,
      () => ({
        folders: [],
        sessions: [
          {
            id: "db",
            kind: "ssh",
            name: "DB",
            host: "db",
            authentication: "password",
          },
          {
            id: "web",
            kind: "ssh",
            name: "Web",
            host: "web",
            authentication: "agent",
          },
        ],
      }),
    );
    const set = (payload: unknown) =>
      Promise.resolve().then(() =>
        handlers.get(sessionIpc.setPassword)!(trusted, payload),
      );
    await expect(set({ id: "web", password: "x" })).rejects.toThrow(
      "does not use a password",
    );
    await expect(set({ id: "db", password: "a\nb" })).rejects.toThrow(
      "Invalid",
    );
    await expect(set({ id: "db", password: "x", extra: 1 })).rejects.toThrow(
      "Invalid",
    );
    await set({ id: "db", password: "s3cret pass" });
    expect(await credentials.get("session:db")).toBe("s3cret pass");
    const state = await handlers.get(sessionIpc.passwordState)!(trusted, "db");
    expect(state).toEqual({ storage: "available", saved: true });
    expect(JSON.stringify(state)).not.toContain("s3cret");
    await set({ id: "db", password: null });
    expect(await credentials.has("session:db")).toBe(false);
  });

  it("validates passwords and changes exactly", () => {
    expect(isSessionPassword("with space and ünïcode")).toBe(true);
    for (const bad of ["", "a\rb", "a\0b", "x".repeat(1025), 5])
      expect(isSessionPassword(bad)).toBe(false);
    expect(isSessionPasswordChange({ id: "db", password: null })).toBe(true);
    expect(isSessionPasswordChange({ id: "a b", password: "x" })).toBe(false);
  });
});

describe("Credential Store writes", () => {
  it("serializes concurrent writes and lists ids", async () => {
    const credentials = createCredentialStore(
      fakeCipher(),
      await directory(),
      "linux",
    );
    await Promise.all([
      credentials.set("session:a", "1"),
      credentials.set("session:b", "2"),
      credentials.set("ai:groq", "3"),
    ]);
    expect([...(await credentials.ids())].sort()).toEqual([
      "ai:groq",
      "session:a",
      "session:b",
    ]);
  });
});

describe("Password session launch", () => {
  const base = {
    shell: "/bin/bash",
    platform: "linux",
    homeDirectory: "/home/me",
    applicationVersionProvider: { getVersion: () => "1" },
    environment: {},
    extraEnvironment: { COLORTERM: "truecolor" },
    onOutput: () => {},
    onExit: () => {},
  } satisfies SessionLaunchBase;

  it("adds the askpass environment only to a password session with a stored password", async () => {
    const root = await directory();
    await writeFile(path.join(root, "placeholder"), "");
    const passwordEnvironment = vi.fn((id: string) =>
      id === "db" ? { SSH_ASKPASS_REQUIRE: "force" } : undefined,
    );
    const sessions = createSavedSessionService({
      directory: root,
      homeDirectory: root,
      platform: "linux",
      sshExecutable: () => "/usr/bin/ssh",
      passwordEnvironment,
    });
    await sessions.load();
    const db = await sessions.saveSession({
      id: "db",
      kind: "ssh",
      name: "DB",
      host: "db.internal",
      authentication: "password",
    });
    const web = await sessions.saveSession({
      id: "web",
      kind: "ssh",
      name: "Web",
      host: "web.internal",
      authentication: "agent",
    });
    expect(sessions.launchOptions(db.id, base).extraEnvironment).toEqual({
      COLORTERM: "truecolor",
      SSH_ASKPASS_REQUIRE: "force",
    });
    expect(sessions.launchOptions(web.id, base).extraEnvironment).toEqual({
      COLORTERM: "truecolor",
    });
    expect(passwordEnvironment).toHaveBeenCalledExactlyOnceWith("db");
  });
});
