import { execFileSync } from "node:child_process";
import path from "node:path";
import { createHeadlessTerminal } from "restty/headless";
import { createInputHandler } from "restty/internal";
import { expect, it, vi } from "vitest";
import { snapshotLocalImageCoreCells } from "../fixtures/restty-local-image-core-probe";
import {
  hasSiblingResponse,
  siblingResponseCommand,
  waitForSiblingResponse,
} from "../fixtures/restty-sibling-response";

it.each(["linux", "darwin"] as const)(
  "%s sibling response requires execution, not submitted command echo",
  (platform) => {
    const command = siblingResponseCommand(platform);
    expect(command).toBe(
      "printf '%s%s\\n' '__UNAFFECTED_' 'AFTER_BACKEND_LOSS__'",
    );
    expect(hasSiblingResponse(command)).toBe(false);
    expect(hasSiblingResponse(`$ ${command}\r\n$ `)).toBe(false);
  },
);

it("PowerShell sibling response requires execution, not submitted command echo", () => {
  const command = siblingResponseCommand("win32");
  expect(command).toBe("Write-Output ('__UNAFFECTED_'+'AFTER_BACKEND_LOSS__')");
  expect(hasSiblingResponse(command)).toBe(false);
  expect(hasSiblingResponse(`PS> ${command}\r\nPS> `)).toBe(false);
});

// This deterministic one-observation wait exposes the helper's reason label;
// the observations themselves come from real OutputFilter/core execution.
async function observeOnce(
  predicate: () => boolean | Promise<boolean>,
  label: string,
) {
  if (!(await predicate())) throw new Error(`Timed out waiting for ${label}`);
}

it("rejects destination echo even when the sibling source executed successfully", async () => {
  const core = await createHeadlessTerminal({
    cols: 80,
    rows: 24,
    replay: false,
  });
  const input = createInputHandler({ sendReply() {} });
  const echo = `$ ${siblingResponseCommand("linux")}\r\n`;
  try {
    // Source response is observed first, then suppressed only on delivery.
    // Echo still traverses the actual OutputFilter and actual Ghostty core.
    core.write(input.filterOutput(echo));
    const source = `${echo}__UNAFFECTED_AFTER_BACKEND_LOSS__\r\n`;
    expect(hasSiblingResponse(source)).toBe(true);
    const cells = snapshotLocalImageCoreCells(core.wasm, core.handle)!;
    expect(cells.text).toContain("printf");
    expect(hasSiblingResponse(cells.text)).toBe(false);
    await expect(
      waitForSiblingResponse({
        sourceOutput: () => source,
        destinationText: () =>
          snapshotLocalImageCoreCells(core.wasm, core.handle)!.text,
        waitFor: observeOnce,
      }),
    ).rejects.toThrow(
      "sibling destination response in surviving Surface core after backend loss (source executed response observed)",
    );
  } finally {
    core.dispose();
  }
});

it.each(["linux", "win32"] as const)(
  "%s echo-only core fails; an executed response in that same real core passes",
  async (platform) => {
    // A narrow viewport also checks that core-proven soft wraps cannot turn
    // the split command's echo into a contiguous execution token.
    const core = await createHeadlessTerminal({
      cols: 20,
      rows: 24,
      replay: false,
    });
    const handler = createInputHandler({ sendReply() {} });
    let source = "";
    const coreText = () =>
      snapshotLocalImageCoreCells(core.wasm, core.handle)!.text;
    const deliver = (data: string) => {
      source += data;
      core.write(handler.filterOutput(data));
    };
    try {
      const handle = core.handle;
      const echo = `${platform === "win32" ? "PS> " : "$ "}${siblingResponseCommand(platform)}\r\n`;
      // Exercise split output/control reads, not a fake completed selection.
      for (const character of `\u001b[32m${echo}\u001b[0m`) deliver(character);
      expect(coreText()).toContain(
        platform === "win32" ? "Write-Output" : "printf",
      );
      expect(hasSiblingResponse(source)).toBe(false);
      expect(hasSiblingResponse(coreText())).toBe(false);
      await expect(
        waitForSiblingResponse({
          sourceOutput: () => source,
          destinationText: coreText,
          waitFor: observeOnce,
        }),
      ).rejects.toThrow("sibling source executed response after backend loss");
      // Platform-independent output contract only; this does not claim native
      // PowerShell execution. Real Unix execution is covered separately below.
      deliver("__UNAFFECTED_AFTER_");
      deliver("BACKEND_LOSS__\r\n");
      expect(coreText()).toContain("__UNAFFECTED_AFTER_BACKEND_LOSS__");
      expect(core.handle).toBe(handle);
      await expect(
        waitForSiblingResponse({
          sourceOutput: () => source,
          destinationText: coreText,
          waitFor: observeOnce,
        }),
      ).resolves.toEqual({
        executedResponse: true,
        responseInSurvivingSurface: true,
      });
    } finally {
      core.dispose();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "executes the Unix split command in a real shell and observes its real core response",
  async () => {
    const command = siblingResponseCommand("linux");
    const source = execFileSync("/bin/sh", ["-c", command], {
      cwd: path.resolve(import.meta.dirname, "../.."),
      encoding: "utf8",
      timeout: 3_000,
    });
    expect(source).toBe("__UNAFFECTED_AFTER_BACKEND_LOSS__\n");
    expect(hasSiblingResponse(command)).toBe(false);
    const core = await createHeadlessTerminal({
      cols: 80,
      rows: 24,
      replay: false,
    });
    const handler = createInputHandler({ sendReply() {} });
    try {
      core.write(handler.filterOutput(source));
      await expect(
        waitForSiblingResponse({
          sourceOutput: () => source,
          destinationText: () =>
            snapshotLocalImageCoreCells(core.wasm, core.handle)!.text,
          waitFor: observeOnce,
        }),
      ).resolves.toEqual({
        executedResponse: true,
        responseInSurvivingSurface: true,
      });
    } finally {
      core.dispose();
    }
  },
);

it("bounds focused source diagnostics without leaving an orphaned wait loop", async () => {
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValueOnce(0)
    .mockReturnValue(3_000);
  try {
    await expect(
      waitForSiblingResponse({
        sourceOutput: () => "echo only",
        destinationText: () => "",
        waitFor: observeOnce,
        diagnosticTimeoutMs: 3_000,
      }),
    ).rejects.toThrow("sibling source executed response after backend loss");
  } finally {
    clock.mockRestore();
  }
});

it("bounds focused destination diagnostics while identifying successful source execution", async () => {
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValue(3_000);
  try {
    await expect(
      waitForSiblingResponse({
        sourceOutput: () => "__UNAFFECTED_AFTER_BACKEND_LOSS__\r\n",
        destinationText: () => "echo only",
        waitFor: observeOnce,
        diagnosticTimeoutMs: 3_000,
      }),
    ).rejects.toThrow(
      "sibling destination response in surviving Surface core after backend loss (source executed response observed)",
    );
  } finally {
    clock.mockRestore();
  }
});
