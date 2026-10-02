import { buildFixture, resultPrefix } from "../fixtures/restty-rendering-build";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";

const electronExecutable = createRequire(import.meta.url)("electron") as string;

interface FixtureResult {
  readonly available: {
    readonly backend?: string;
    readonly font?: string;
    readonly ptyStarts: number;
    readonly clipboardReads?: number;
    readonly clipboardWrites?: number;
    readonly terminalReplies?: number;
    readonly optionInput?: readonly string[];
    readonly compositionInput?: Readonly<Record<string, readonly string[]>>;
    readonly spaceInput?: Readonly<Record<string, readonly string[]>>;
    readonly deadKeySpaceInput?: Readonly<Record<string, readonly string[]>>;
    readonly resize?: { readonly cols: number; readonly rows: number };
  };
  readonly unavailable: {
    readonly error?: string;
    readonly fatal?: string;
    readonly ptyStarts: number;
  };
  readonly textRenderingEvidence: boolean;
  readonly textCaptureSize: { readonly width: number; readonly height: number };
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

function expectDeadKeySpaceInput(result: FixtureResult | undefined): void {
  const kittySpace = ["\u001b[32;1:1u", "\u001b[32;1:3u"];
  const altSpace = process.platform === "darwin" ? [" "] : ["\u001b "];
  const kittyAltSpace =
    process.platform === "darwin"
      ? [" "]
      : ["\u001b[32;3:1u", "\u001b[32;3:3u"];
  expect(result?.available.deadKeySpaceInput).toEqual({
    legacy: ["'", '"', "`", "~"],
    legacyFollowingSpace: [" "],
    legacyAlt: altSpace,
    modifyOtherKeys: ["'", '"', "`", "~"],
    modifyOtherKeysFollowingSpace: [" "],
    modifyOtherKeysAlt: altSpace,
    kitty124: ["'", '"', "`", "~"],
    kitty124FollowingSpace: [" "],
    kitty124Alt: kittyAltSpace,
    kittyAll: ["'", '"', "`", "~"],
    kittyAllFollowingSpace: kittySpace,
    kittyAllAlt: kittyAltSpace,
    modifier: ["'"],
    letter: ["é", " "],
    doubleDead: ["´", " "],
    cancel: ["\u001b", " "],
    control: process.platform === "darwin" ? [" "] : ["\u0000", " "],
    focus: [" "],
    windowBlur: [" "],
    compositionCancel: [" "],
    heldCommit: ["'", " "],
    heldModified: ["'"],
    afterHeld: kittySpace,
  });
}

describe("Restty under production Electron policy", () => {
  it("renders Terminal Font Stack text and refuses to start a PTY without a backend", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-restty-electron-"));
    await buildFixture(root);
    try {
      const execution = await runFixture(root);
      const line = execution.stdout
        .split("\n")
        .find((entry) => entry.startsWith(resultPrefix));
      const result = line
        ? (JSON.parse(line.slice(resultPrefix.length)) as FixtureResult)
        : undefined;
      const evidencePath = process.env["OMXTERM_RESTTY_EVIDENCE_PATH"];
      if (evidencePath && result)
        await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);

      expect(
        execution.exitCode,
        `Restty fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(
        result,
        `Restty fixture produced no result.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBeDefined();
      expect(result?.available).toMatchObject({
        backend: "webgl2",
        font: "FiraCode Nerd Font Mono",
        ptyStarts: 1,
        clipboardReads: 0,
        clipboardWrites: 0,
        terminalReplies: process.platform === "darwin" ? 11 : 10,
        startupReplies: ["\u001b[?1;2c", "\u001b[>0;0;0c"],
        // Physical Option-to-ASCII mapping is macOS-only. Elsewhere the
        // synthetic non-ASCII Alt keys retain their literal browser values;
        // a dead key itself emits no text before composition completes.
        optionInput:
          process.platform === "darwin"
            ? [
                "å",
                "é",
                "∫",
                "\u001ba",
                "∫",
                "å",
                "\u001bb",
                "\u001ba",
                "\u001bb",
                "\u001be",
                "\u001bA",
              ]
            : [
                "å",
                "é",
                "∫",
                "\u001bå",
                "∫",
                "å",
                "\u001b∫",
                "\u001bå",
                "\u001b∫",
                "\u001bÅ",
              ],
      });
      const fiveSpaces = [" ", " ", " ", " ", " "];
      expect(result?.available.spaceInput).toEqual({
        legacy: fiveSpaces,
        modifyOff: fiveSpaces,
        modifyOn: fiveSpaces,
        kitty124: fiveSpaces,
        ris: fiveSpaces,
        softReset: fiveSpaces,
        xtermReset: fiveSpaces,
        tmuxReset: fiveSpaces,
        normal: fiveSpaces,
        held: fiveSpaces,
        shift: [" "],
        ...(process.platform === "darwin"
          ? { control: [], nativeOption: [" "] }
          : { control: ["\u0000"], nativeOption: ["\u001b "] }),
        composition: ["漢"],
        composingEvent: [],
        otherInput: [],
        kittyAll: ["\u001b[32;1:1u", "\u001b[32;1:2u", "\u001b[32;1:3u"],
      });
      expectDeadKeySpaceInput(result);
      const compositionInput = result?.available.compositionInput;
      expect(compositionInput).toBeDefined();
      for (const mode of [
        "legacy",
        "modifyOtherKeys",
        "kitty1",
        "kitty2",
        "kitty4",
        "kitty124",
      ]) {
        expect(compositionInput?.[`${mode}Commit`]).toEqual([
          "ser",
          "á",
          " s",
          "ó",
          " av",
          "ó",
        ]);
        expect(compositionInput?.[`${mode}Cancel`]).toEqual([]);
        expect(compositionInput?.[`${mode}LiteralApostrophe`]).toEqual(["'"]);
      }
      expect(compositionInput?.kitty124Modified).toEqual([
        "\u001b[99;5:1u",
        "\u001b[99;5:3u",
        "\u001b[1;5:1D",
        "\u001b[1;5:3D",
      ]);
      expect(result?.available.resize?.cols).toBeGreaterThan(1);
      expect(result?.available.resize?.rows).toBeGreaterThan(0);
      expect(result?.textRenderingEvidence).toBe(true);
      expect(result?.unavailable.error).toBe(
        "Failed to mount the OMXTerm Terminal Surface",
      );
      expect(result?.unavailable.fatal).toContain("rendering backend");
      expect(result?.unavailable.ptyStarts).toBe(0);
      expect(result?.security).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      // Windows can retain Chromium profile handles briefly after child exit.
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  }, 90_000);
});

async function runFixture(root: string): Promise<{
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const chromiumArguments = supportedFixtureChromiumArguments();
  const child = spawn(electronExecutable, [...chromiumArguments, root], {
    cwd: root,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      HOME: path.join(root, "home"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.on("data", (chunk: string) => (stderr += chunk));
  const timeout = setTimeout(() => {
    if (process.platform !== "win32" && child.pid)
      process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  }, 80_000);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  return { exitCode, stderr, stdout };
}
