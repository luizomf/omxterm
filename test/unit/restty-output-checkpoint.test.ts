import { createHeadlessTerminal } from "restty/headless";
import { createInputHandler } from "restty/internal";
import { expect, it } from "vitest";
import {
  assertOutputCheckpoint,
  outputCheckpointText,
  outputRecord,
  createOutputSourceObserver,
  outputCheckpointMarker,
} from "../fixtures/restty-output-checkpoint";

it("rejects reordered destination records despite valid source and END in the actual core", async () => {
  const core = await createHeadlessTerminal({
    cols: 20,
    rows: 24,
    replay: false,
  });
  const filter = createInputHandler({ sendReply() {} });
  const source = outputCheckpointText(7);
  const destination = source.replace(
    outputRecord(28_772) + outputRecord(28_773),
    outputRecord(28_773) + outputRecord(28_772),
  );
  try {
    for (let offset = 0; offset < destination.length; offset += 8_192)
      core.write(
        filter.filterOutput(destination.slice(offset, offset + 8_192)),
      );
    core.renderUpdate();
    const total = core.wasm.exports.restty_scrollbar_total!(core.handle);
    const scroll = core.wasm.exports.restty_scrollbar_offset!(core.handle);
    const copied = core.wasm.getSelectionText(
      core.handle,
      -scroll,
      0,
      total - scroll - 1,
      19,
    );
    expect(() => assertOutputCheckpoint(source, 7)).not.toThrow();
    expect(copied).toContain("__OMXTERM_BATCH_07_END__");
    expect(() => assertOutputCheckpoint(copied, 7)).toThrow(
      /destination checkpoint 7 order at 28772/iu,
    );
  } finally {
    core.dispose();
  }
});

it.each([20, 80, 132, 430])(
  "validates all paced 2 MiB at %i columns through real filter/core selection without history clears",
  async (initialCols) => {
    const core = await createHeadlessTerminal({
      cols: initialCols,
      rows: 24,
      replay: false,
    });
    const filter = createInputHandler({ sendReply() {} });
    const setLimits = core.wasm.exports["restty_set_scrollback_limits"] as (
      handle: number,
      lines: number,
      bytes: number,
    ) => number;
    setLimits(core.handle, 10_000, 10_000_000);
    const source = createOutputSourceObserver();
    const accepted = [];
    try {
      for (let batch = 0; batch < 16; batch++) {
        const text = outputCheckpointText(batch);
        for (let offset = 0; offset < text.length; offset += 8_192) {
          const chunk = text.slice(offset, offset + 8_192);
          source.observe(chunk);
          core.write(filter.filterOutput(chunk));
          if (batch === 0 && offset === 65_536)
            core.resize(initialCols + 5, 24);
        }
        core.renderUpdate();
        const total = core.wasm.exports.restty_scrollbar_total!(core.handle);
        const scroll = core.wasm.exports.restty_scrollbar_offset!(core.handle);
        const copied = core.wasm.getSelectionText(
          core.handle,
          -scroll,
          0,
          total - scroll - 1,
          core.cols - 1,
        );
        accepted.push(assertOutputCheckpoint(copied, batch));
      }
      expect(source.evidence()).toMatchObject({
        records: 65_536,
        recordBytes: 2_097_152,
        checkpoints: 16,
        endSeen: true,
        remainderCodeUnits: 0,
      });
      expect(accepted).toHaveLength(16);
      expect(accepted[0]).toMatchObject({
        first: 0,
        last: 4_095,
        recordBytes: 131_072,
      });
      expect(accepted.at(-1)).toMatchObject({ first: 61_440, last: 65_535 });
    } finally {
      core.dispose();
    }
  },
);

it.each([
  "drop",
  "duplicate",
  "wrong-index",
  "missing-begin",
  "duplicate-frame",
] as const)(
  "rejects %s at the actual core destination while source and END remain valid",
  async (mutation) => {
    const core = await createHeadlessTerminal({
      cols: 80,
      rows: 24,
      replay: false,
    });
    const filter = createInputHandler({ sendReply() {} });
    const original = outputCheckpointText(7);
    const source = createOutputSourceObserver(8);
    for (let batch = 0; batch < 8; batch++)
      source.observe(outputCheckpointText(batch));
    let destination = original;
    if (mutation === "drop")
      destination = destination.replace(outputRecord(28_772), "");
    if (mutation === "duplicate")
      destination = destination.replace(
        outputRecord(28_772),
        outputRecord(28_772) + outputRecord(28_772),
      );
    if (mutation === "wrong-index")
      destination = destination.replace(
        outputRecord(28_772),
        "99999999:xxxxxxxxxxxxxxxxxxxxxxx",
      );
    if (mutation === "missing-begin")
      destination = destination.replace(outputCheckpointMarker(7), "");
    if (mutation === "duplicate-frame")
      destination += outputCheckpointMarker(7, true);
    try {
      for (let offset = 0; offset < destination.length; offset += 8_192)
        core.write(
          filter.filterOutput(destination.slice(offset, offset + 8_192)),
        );
      core.renderUpdate();
      const total = core.wasm.exports.restty_scrollbar_total!(core.handle);
      const scroll = core.wasm.exports.restty_scrollbar_offset!(core.handle);
      const copied = core.wasm.getSelectionText(
        core.handle,
        -scroll,
        0,
        total - scroll - 1,
        79,
      );
      expect(source.evidence()).toMatchObject({
        records: 32_768,
        checkpoints: 8,
        endSeen: true,
      });
      expect(copied).toContain("__OMXTERM_BATCH_07_END__");
      expect(() => assertOutputCheckpoint(copied, 7)).toThrow(
        /Destination checkpoint 7/,
      );
    } finally {
      core.dispose();
    }
  },
);

it("keeps independently specified 32-byte global record framing across source chunk splits", () => {
  expect(outputRecord(0)).toBe("00000000:xxxxxxxxxxxxxxxxxxxxxxx");
  expect(outputRecord(65_535)).toBe("00065535:xxxxxxxxxxxxxxxxxxxxxxx");
  const source = createOutputSourceObserver(1);
  const text = "__OMXTERM_OUTPUT_READY__" + outputCheckpointText(0);
  for (let offset = 0; offset < text.length; offset += 17)
    source.observe(text.slice(offset, offset + 17));
  expect(source.ready()).toBe(true);
  expect(source.evidence()).toMatchObject({
    records: 4_096,
    recordBytes: 131_072,
    checkpoints: 1,
    remainderCodeUnits: 0,
  });
});
