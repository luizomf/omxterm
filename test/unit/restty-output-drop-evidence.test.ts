import type { BrowserWindow } from "electron";
import { createHeadlessTerminal } from "restty/headless";
import { createInputHandler } from "restty/internal";
import { expect, it } from "vitest";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { IpcEvent, IpcListener } from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { createOutputStressHarness } from "../fixtures/restty-host-output-stress";
import { assertOutputDropRejection } from "../fixtures/restty-output-drop-evidence";
import {
  outputCheckpointMarker,
  outputCheckpointText,
  outputRecord,
} from "../fixtures/restty-output-checkpoint";

async function selectCopiedCheckpoint(delivered: string) {
  const core = await createHeadlessTerminal({
    cols: 80,
    rows: 24,
    replay: false,
  });
  const filter = createInputHandler({ sendReply() {} });
  try {
    for (let offset = 0; offset < delivered.length; offset += 8192)
      core.write(filter.filterOutput(delivered.slice(offset, offset + 8192)));
    core.renderUpdate();
    const total = core.wasm.exports.restty_scrollbar_total!(core.handle);
    const scroll = core.wasm.exports.restty_scrollbar_offset!(core.handle);
    return core.wasm.getSelectionText(
      core.handle,
      -scroll,
      0,
      total - scroll - 1,
      79,
    );
  } finally {
    core.dispose();
  }
}

// Only Electron/PTY I/O is substituted. The source observer, original ACK route,
// real filter/core selection and actual copied-destination caller remain real.
async function exerciseCopiedCheckpoint(copied: string) {
  const harness = createOutputStressHarness({
    sessionIndex: 0,
    checkpoints: 1,
  });
  const source = outputCheckpointText(0);
  const ready = "\x1b[?25l__OMXTERM_OUTPUT_READY__";
  const end = Buffer.byteLength(ready + source);
  let acknowledge: IpcListener | undefined;
  harness
    .ipcPort({
      handle() {},
      removeHandler() {},
      removeListener() {},
      on(_channel, listener) {
        acknowledge = listener;
      },
    })
    .on(terminalIpc.outputAck, () => undefined);
  const event: IpcEvent = {
    sender: { mainFrame: {}, isDestroyed: () => false, send() {} },
    senderFrame: null,
  };
  const resizes = [[{ cols: 80, rows: 24 }]];
  const window = {
    getBounds: () => ({ width: 920 }),
    setBounds: () => {
      resizes[0]!.push({ cols: 78, rows: 24 });
    },
    webContents: {
      executeJavaScript: (script: string) =>
        Promise.resolve(script.includes("configuration()") ? 10_000 : null),
      send(channel: string, action: string) {
        if (channel === terminalIpc.clipboardAction && action === "copy")
          harness.observeClipboard(copied);
      },
    },
  } as unknown as BrowserWindow;
  const terminal = {
    write(input: string) {
      if (input === "g") {
        harness.observeOutput(0, source);
        acknowledge!(event, { sessionId: "s1", end });
      }
      if (input === "x") harness.observeExit(0, { exitCode: 0, signal: 0 });
    },
    outputFlowMetrics: () => ({
      pendingBytes: 0,
      pauseCount: 1,
      resumeCount: 1,
    }),
  } as unknown as LocalTerminalSession;
  harness.observeOutput(0, ready);
  return harness.exercise({
    window,
    terminals: [terminal],
    resizes,
    launchKinds: ["explicit-command"],
    existingSession: true,
    async waitFor(predicate, label) {
      if (!(await predicate()))
        throw new Error(`Unresolved external I/O: ${label}`);
    },
  });
}

async function rejectCopiedCheckpoint(delivered: string): Promise<string> {
  const copied = await selectCopiedCheckpoint(delivered);
  try {
    await exerciseCopiedCheckpoint(copied);
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw cause;
  }
  throw new Error("Expected the actual copied destination to be rejected");
}

it("reports missing record 100 from the actual copied destination when a dropped body has one extra synthetic character", async () => {
  const delivered = outputCheckpointText(0)
    .replace(outputRecord(100), "")
    .replace(
      outputCheckpointMarker(0, true),
      "?" + outputCheckpointMarker(0, true),
    );
  const copied = await selectCopiedCheckpoint(delivered);
  await expect(exerciseCopiedCheckpoint(copied)).rejects.toThrow(
    'copied checkpoint={"bodyCodeUnits":131041,"lineFeeds":0,"carriageReturns":0,"recordIndex":100,"recordPresent":false,"neighborsAdjacent":true}',
  );
});

it("accepts the intended missing-record rejection with a 131041-unit actual copied body", async () => {
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0)
      .replace(outputRecord(100), "")
      .replace(
        outputCheckpointMarker(0, true),
        "?" + outputCheckpointMarker(0, true),
      ),
  );
  expect(() => assertOutputDropRejection(stderr)).not.toThrow();
});

it("refuses a same-length drop of another record when record 100 remains in the actual copy", async () => {
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0).replace(outputRecord(99), ""),
  );
  expect(stderr).toContain("Destination checkpoint 0 record length 131040");
  expect(() => assertOutputDropRejection(stderr)).toThrow("record 100");
});

it("refuses a replaced record 100 and a different dropped record without the observed 99-to-101 gap", async () => {
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0)
      .replace(outputRecord(100), "99999999:xxxxxxxxxxxxxxxxxxxxxxx")
      .replace(outputRecord(200), ""),
  );
  expect(stderr).toContain('"recordPresent":false');
  expect(() => assertOutputDropRejection(stderr)).toThrow("neighbors");
});

it("accepts the intended 131040-unit copied drop while original source and ACK progress remain valid", async () => {
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0).replace(outputRecord(100), ""),
  );
  expect(stderr).toContain(
    "source checkpoints=1, source records=4096, pending=0, ACK=131152/131152",
  );
  expect(() => assertOutputDropRejection(stderr)).not.toThrow();
});

it("fails the negative control when the mutation is omitted and the actual copied destination is intact", async () => {
  const copied = await selectCopiedCheckpoint(outputCheckpointText(0));
  const result = await exerciseCopiedCheckpoint(copied);
  expect(result.destination).toMatchObject({
    records: 4096,
    recordBytes: 131072,
    endSeen: true,
  });
  expect(() => assertOutputDropRejection("")).toThrow("rejection evidence");
});

it("does not mistake a copied hard break within intact record 100 for the intended missing record", async () => {
  const record = outputRecord(100);
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0).replace(
      record,
      record.slice(0, 16) + "\r\n" + record.slice(16),
    ),
  );
  expect(stderr).toContain('"lineFeeds":1');
  expect(stderr).toContain('"recordPresent":true');
  expect(() => assertOutputDropRejection(stderr)).toThrow("record 100");
});

it("requires wrong-length rejection even when record 100 is missing and its neighbors join", async () => {
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0)
      .replace(outputRecord(100), "")
      .replace(
        outputCheckpointMarker(0, true),
        "x".repeat(32) + outputCheckpointMarker(0, true),
      ),
  );
  expect(stderr).toContain("Destination checkpoint 0 order at 100");
  expect(() => assertOutputDropRejection(stderr)).toThrow("rejection evidence");
});

it("refuses an unannotated length diagnostic that cannot prove the actual missing record", () => {
  expect(() =>
    assertOutputDropRejection(
      "Destination checkpoint 0 record length 131040 (END present: true)",
    ),
  ).toThrow("rejection evidence");
});

it("requires the diagnostic length to agree with the actual copied-body metadata", async () => {
  const stderr = await rejectCopiedCheckpoint(
    outputCheckpointText(0).replace(outputRecord(100), ""),
  );
  expect(() =>
    assertOutputDropRejection(
      stderr.replace('"bodyCodeUnits":131040', '"bodyCodeUnits":131041'),
    ),
  ).toThrow("wrong-length");
});
