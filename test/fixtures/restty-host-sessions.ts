import path from "node:path";
import {
  createLocalTerminalSession,
  type LocalTerminalSession,
  type LocalTerminalSessionOptions,
  type SpawnPty,
} from "../../src/main/local-terminal-session";

interface FixtureApp {
  on(event: "window-all-closed", listener: () => void): unknown;
  on(
    event: "before-quit",
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
  exit(code: number): void;
}

interface FixtureWindow {
  isDestroyed(): boolean;
  destroy(): void;
}

interface OwnedSession {
  session?: LocalTerminalSession;
  readonly exited: Promise<void>;
  ready: boolean;
}

const isolatedMarker = "__OMXTERM_RESTTY_SHELL_ISOLATED__";
const powerShellSetup = Buffer.from(
  `
$ErrorActionPreference='Stop'
Import-Module PSReadLine
Set-PSReadLineOption -HistorySavePath $env:OMXTERM_RESTTY_HISTORY -HistorySaveStyle SaveNothing
Set-PSReadLineKeyHandler -Chord 'Ctrl+v' -BriefDescription 'FixtureNoClipboard' -ScriptBlock {}
$binding=Get-PSReadLineKeyHandler | Where-Object Key -eq 'Ctrl+v'
$history=Get-PSReadLineOption
if($binding.Function -ne 'FixtureNoClipboard'){throw 'Fixture CtrlV isolation failed'}
if($history.HistorySaveStyle -ne 'SaveNothing' -or $history.HistorySavePath -ne $env:OMXTERM_RESTTY_HISTORY){throw 'Fixture history isolation failed'}
[Console]::WriteLine('${isolatedMarker}')
`,
  "utf16le",
).toString("base64");

export function createResttyHostSessions(options: {
  readonly spawn: SpawnPty;
  readonly app: FixtureApp;
  readonly windows: () => readonly FixtureWindow[];
  readonly signals: {
    on(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  };
  readonly reportError: (message: string) => void;
}) {
  const sessions = new Set<OwnedSession>();
  let completion: Promise<void> | undefined;
  let exitCode = 0;
  // Own Electron's default last-window quit, including on fixture failure.
  options.app.on("window-all-closed", () => {});
  options.app.on("before-quit", (event) => {
    event.preventDefault();
    finishInBackground(1);
  });
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    // The supervisor treats fixture-interrupted IPC as immediate forced
    // cleanup. Let it observe our native exit instead; its original deadline
    // still owns fallback when an actual PTY exit never arrives.
    options.signals.on(signal, () => finishInBackground(code));
  }
  const shellsReady = () => [...sessions].every((record) => record.ready);
  const fixture = {
    async waitFor(predicate: () => boolean | Promise<boolean>, label: string) {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        // Test input phases require every owned shell's executed setup first.
        // Native protocol replies remain live while PowerShell initializes.
        if (shellsReady() && (await predicate()) && shellsReady()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(
        `Timed out waiting for ${label}${shellsReady() ? "" : " (owned PowerShell isolation not acknowledged)"}`,
      );
    },
    createSession(sessionOptions: LocalTerminalSessionOptions) {
      if (completion) throw new Error("Restty fixture is completing");
      const isolate =
        sessionOptions.platform === "win32" &&
        sessionOptions.launchRequest?.kind !== "explicit-command";
      let finish!: () => void;
      let acknowledgement = "";
      const record: OwnedSession = {
        ready: !isolate,
        exited: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      };
      sessions.add(record);
      try {
        const spawn: SpawnPty = (file, args, ptyOptions) =>
          options.spawn(
            file,
            isolate
              ? [
                  "-NoLogo",
                  "-NoProfile",
                  "-NoExit",
                  "-EncodedCommand",
                  powerShellSetup,
                ]
              : args,
            isolate
              ? {
                  ...ptyOptions,
                  env: {
                    ...ptyOptions.env,
                    OMXTERM_RESTTY_HISTORY: path.win32.join(
                      sessionOptions.homeDirectory,
                      "restty-history.txt",
                    ),
                  },
                }
              : ptyOptions,
          );
        record.session = createLocalTerminalSession(spawn, {
          ...sessionOptions,
          onOutput(data) {
            if (!record.ready) {
              acknowledgement += data;
              record.ready = acknowledgement.includes(isolatedMarker);
              acknowledgement = acknowledgement.slice(
                -(isolatedMarker.length - 1),
              );
            }
            sessionOptions.onOutput(data);
          },
          onExit(exit, kind) {
            finish();
            sessionOptions.onExit(exit, kind);
          },
        });
      } catch (error) {
        sessions.delete(record);
        finish();
        throw error;
      }
      if (completion) close(record);
      return record.session;
    },
    complete(code: number): Promise<void> {
      if (code !== 0 && exitCode !== 130 && exitCode !== 143) exitCode = code;
      if (completion) return completion;
      let begin!: () => void;
      // Publish the latch and shared promise before close can reenter or exit.
      completion = new Promise<void>((resolve, reject) => {
        begin = () => {
          void drain().then(resolve, reject);
        };
      });
      begin();
      return completion;
    },
  };
  return fixture;

  function finishInBackground(code: number) {
    void fixture.complete(code).catch(() => {
      options.reportError("Restty fixture completion failed");
    });
  }

  function close(record: OwnedSession) {
    try {
      record.session?.close();
    } catch {
      if (exitCode === 0) exitCode = 1;
      options.reportError("Restty fixture session close failed");
    }
  }

  async function drain() {
    for (const record of sessions) close(record);
    await Promise.all([...sessions].map((record) => record.exited));
    if (!shellsReady()) {
      if (exitCode === 0) exitCode = 1;
      options.reportError("Owned PowerShell isolation was not acknowledged");
    }
    for (const window of options.windows())
      if (!window.isDestroyed()) window.destroy();
    options.app.exit(exitCode);
  }
}
