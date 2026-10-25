import { expect, it } from "vitest";
import { createWorkingDirectoryTracker } from "../../src/main/terminal-working-directories";

const cancellations = ["\x18", "\x1a"];
const cases = cancellations.flatMap((cancel) =>
  [false, true].flatMap((oversized) =>
    ["\x07", "\x1b\\"].map((ending) => ({ cancel, oversized, ending })),
  ),
);

it("inherits the following valid cwd after CAN cancels the OSC 7 in the review probe", () => {
  const tracker = createWorkingDirectoryTracker({
    platform: "linux",
    hostName: () => "local",
    isDirectory: () => true,
  });
  tracker.observe("s1", "\x1b]7;file:///old\x07");
  tracker.observe("s1", "\x1b]7;file:///cancelled\x18\x1b]7;file:///new\x07");
  expect(tracker.inherited("s1")).toBe("/new");
});

it.each(cancellations)(
  "cancellation %j preserves a completed cwd unless the cancelled report already exceeded its bound",
  (cancel) => {
    for (const oversized of [false, true]) {
      const body = oversized
        ? `file://remote/${"a".repeat(5000)}`
        : "file:///cancelled";
      for (const chunks of [
        [`\x1b]7;${body}${cancel}`],
        [`\x1b]7;${body}`, cancel],
      ]) {
        const tracker = createWorkingDirectoryTracker({
          platform: "linux",
          hostName: () => "local",
          isDirectory: () => true,
        });
        tracker.observe("s1", "\x1b]7;file:///old\x07");
        for (const chunk of chunks) tracker.observe("s1", chunk);
        expect(tracker.inherited("s1")).toBe(oversized ? undefined : "/old");
      }
    }
  },
);

it.each(cases)(
  "resynchronizes cancellation across chunks: %j",
  ({ cancel, oversized, ending }) => {
    const body = oversized
      ? `file://remote/${"a".repeat(5000)}`
      : "file:///cancelled";
    const cancelled = `\x1b]7;${body}`;
    const output = `${cancelled}${cancel}\x1b]7;file:///new${ending}`;
    const cuts = new Set([
      0,
      1,
      2,
      3,
      4,
      4099,
      4100,
      4101,
      output.length - 2,
      output.length - 1,
      output.length,
    ]);
    for (let at = cancelled.length - 1; at <= cancelled.length + 6; at += 1)
      cuts.add(at);
    if (!oversized) for (let at = 0; at <= output.length; at += 1) cuts.add(at);
    for (const cut of cuts) {
      if (cut < 0 || cut > output.length) continue;
      const tracker = createWorkingDirectoryTracker({
        platform: "linux",
        hostName: () => "local",
        isDirectory: () => true,
      });
      tracker.observe("s1", "\x1b]7;file:///old\x07");
      tracker.observe("s1", output.slice(0, cut));
      tracker.observe("s1", output.slice(cut));
      expect(tracker.inherited("s1"), `split at ${cut}`).toBe("/new");
    }
    const tracker = createWorkingDirectoryTracker({
      platform: "linux",
      hostName: () => "local",
      isDirectory: () => true,
    });
    // A cancelled body, split new introducer and split ST each own their chunk.
    for (const chunk of [
      cancelled,
      cancel,
      "\x1b",
      "]",
      "7",
      ";file:///new",
      ...ending,
    ])
      tracker.observe("s1", chunk);
    expect(tracker.inherited("s1")).toBe("/new");
  },
);

it.each(cancellations)(
  "cancellation %j releases an exact-bound pending ST and an incomplete introducer",
  (cancel) => {
    const tracker = createWorkingDirectoryTracker({
      platform: "linux",
      hostName: () => "local",
      isDirectory: () => true,
    });
    const uri = `file:///${"a".repeat(4088)}`;
    expect(uri.length).toBe(4096);
    for (const chunk of [
      `\x1b]7;${uri}\x1b`,
      cancel,
      "\x1b]7",
      cancel,
      "\x1b]7;file:///new\x07",
    ])
      tracker.observe("s1", chunk);
    expect(tracker.inherited("s1")).toBe("/new");
  },
);
