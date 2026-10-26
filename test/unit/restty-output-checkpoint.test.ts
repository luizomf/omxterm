import { createHeadlessTerminal } from "restty/headless";
import { createInputHandler } from "restty/internal";
import { expect, it } from "vitest";
import { createHostOracleSourceControl } from "../fixtures/restty-host-oracle-controls";
import { siblingResponseToken } from "../fixtures/restty-sibling-response";
import {
  assertOutputCheckpoint,
  outputCheckpointText,
  outputRecord,
  createOutputSourceObserver,
  outputCheckpointMarker,
} from "../fixtures/restty-output-checkpoint";

it.each(["--reorder-output", "--omit-sibling-response"])(
  "releases unrelated protocol and prompt output immediately for %s without a future read",
  (flag) => {
    const control = createHostOracleSourceControl([flag]);
    const text = "\u001b[6n\u001b[c\u001b[?25hPS> ready ";
    expect(control.transform(0, text)).toBe(text);
    expect(control.evidence()).toMatchObject({
      applied: false,
      retainedCodeUnits: 0,
    });
  },
);

it("mutates once across every split, releasing mismatches and preserving overlapping prefixes and other sessions", () => {
  for (const omit of [false, true]) {
    const args = [omit ? "--omit-sibling-response" : "--reorder-output"];
    const needle = omit
      ? siblingResponseToken
      : outputRecord(100) + outputRecord(101);
    const replacement = omit ? "" : outputRecord(101) + outputRecord(100);
    for (let split = 0; split <= needle.length; split++) {
      const control = createHostOracleSourceControl(args);
      const before = control.transform(0, "prompt> " + needle.slice(0, split));
      if (split < needle.length) {
        expect(before).toBe("prompt> ");
        expect(control.evidence().retainedCodeUnits).toBe(split);
      }
      const after = control.transform(0, needle.slice(split) + "!" + needle);
      expect(before + after).toBe("prompt> " + replacement + "!" + needle);
      expect(control.evidence()).toMatchObject({
        applied: true,
        retainedCodeUnits: 0,
      });
      expect(control.transform(0, needle)).toBe(needle);
    }
    const control = createHostOracleSourceControl(args);
    expect(control.transform(1, needle)).toBe(needle);
    const partial = needle.slice(0, 5);
    expect(control.transform(0, partial)).toBe("");
    expect(control.transform(1, "other output")).toBe("other output");
    expect(control.transform(0, "!" + needle.slice(0, 3))).toBe(partial + "!");
    expect(control.evidence().retainedCodeUnits).toBe(3);
    expect(control.transform(0, needle.slice(3) + "tail")).toBe(
      replacement + "tail",
    );
    expect(createHostOracleSourceControl([]).transform(0, needle)).toBe(needle);
  }
});

it("rejects source-control reorder at record 100 despite valid raw source and END in the actual core", async () => {
  const core = await createHeadlessTerminal({
    cols: 20,
    rows: 24,
    replay: false,
  });
  const filter = createInputHandler({ sendReply() {} });
  const source = outputCheckpointText(0);
  const observer = createOutputSourceObserver(1);
  const control = createHostOracleSourceControl(["--reorder-output"]);
  let destination = "";
  for (let at = 0; at < source.length; at += 17) {
    const chunk = source.slice(at, at + 17);
    observer.observe(chunk); // Same raw-before-mutation ordering as the host.
    destination += control.transform(0, chunk);
  }
  expect(observer.finalize()).toMatchObject({
    endSeen: true,
    framedBytes: 131_122,
  });
  expect(Buffer.byteLength(destination)).toBe(observer.evidence().bytes);
  expect(control.evidence()).toMatchObject({
    applied: true,
    retainedCodeUnits: 0,
  });
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
    expect(() => assertOutputCheckpoint(source, 0)).not.toThrow();
    expect(copied).toContain("__OMXTERM_BATCH_00_END__");
    expect(() => assertOutputCheckpoint(copied, 0)).toThrow(
      /destination checkpoint 0 order at 100/iu,
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
      expect(source.finalize()).toMatchObject({
        framedBytes: 2_097_952,
        envelopeBytes: 0,
        records: 65_536,
        recordBytes: 2_097_152,
        checkpoints: 16,
        endSeen: true,
        bufferedCodeUnits: 0,
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

it("accounts exact frames separately from arbitrary original envelope through finalization", () => {
  const source = createOutputSourceObserver(1);
  source.observe("startup 🦊\u001b[6n");
  source.observe(outputCheckpointText(0) + "\u001b[?1004l\u001b[?9001l");
  source.observe("different printable envelope\u0007");
  const result = source.finalize();
  expect(result).toMatchObject({
    framedBytes: 131_122,
    envelopeBytes: 61,
    bufferedCodeUnits: 0,
    finalized: true,
    checkpoints: 1,
  });
  expect(result.framedBytes + result.envelopeBytes).toBe(result.bytes);
});

it("keeps marker/body/envelope accounting invariant across splits without retaining the envelope", () => {
  const frame = outputCheckpointText(0);
  const reset = "\u001b[?1004l\u001b[?9001l";
  const splits = [
    ...Array.from({ length: 27 }, (_, i) => i),
    27,
    65_613,
    frame.length - 25,
    ...Array.from({ length: 25 }, (_, i) => frame.length - 24 + i),
    ...Array.from({ length: reset.length + 1 }, (_, i) => frame.length + i),
  ];
  for (const split of splits) {
    const source = createOutputSourceObserver(1);
    source.observe("?".repeat(100_000));
    expect(source.evidence().bufferedCodeUnits).toBe(0);
    // Original callbacks count lone surrogate fragments as three bytes each.
    source.observe("\ud83e");
    source.observe("\udd8a");
    const text = frame + reset;
    source.observe(text.slice(0, split));
    expect(source.evidence().bufferedCodeUnits).toBeLessThan(32);
    source.observe(text.slice(split));
    expect(source.finalize()).toMatchObject({
      bytes: 231_144,
      framedBytes: 131_122,
      envelopeBytes: 100_022,
      bufferedCodeUnits: 0,
      finalized: true,
    });
  }
});

it("rejects corrupt literal frames and reserved framing rather than resynchronizing", () => {
  const frame = outputCheckpointText(0);
  const bodyAt = outputCheckpointMarker(0).length;
  const corrupt = [
    frame.slice(bodyAt), // missing BEGIN
    frame.replace(outputRecord(100), ""),
    frame.replace(outputRecord(100), outputRecord(100).repeat(2)),
    frame.replace(outputRecord(100), outputRecord(101)),
    frame.slice(0, bodyAt + 7) + "\u001b[0m" + frame.slice(bodyAt + 7),
    frame.replace("_END__", "_END_!"),
    frame.slice(0, -1),
    frame + outputCheckpointMarker(0, true),
    frame + outputCheckpointMarker(0),
    frame + "__OMXTERM_BATCH_",
    frame + "__OMXTERM_BAT",
    "__OMXTERM_BATCH_01_BEGIN__" + frame,
    "__OMXTERM_BATCH_bad__" + frame,
  ];
  for (const text of corrupt) {
    const source = createOutputSourceObserver(1);
    expect(() => {
      for (let at = 0; at < text.length; at += 17)
        source.observe(text.slice(at, at + 17));
      source.finalize();
    }).toThrow(/Source output/);
    // A caught parse error cannot later be promoted by more valid output.
    expect(() => source.finalize()).toThrow(/Source output/);
  }
  const source = createOutputSourceObserver(2);
  source.observe(frame);
  expect(() => source.observe(outputCheckpointMarker(0, true))).toThrow(
    /reserved framing/,
  );
  const missing = createOutputSourceObserver(2);
  missing.observe(frame);
  expect(() => missing.finalize()).toThrow(/incomplete framing/);
});

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
    bufferedCodeUnits: 0,
  });
});
