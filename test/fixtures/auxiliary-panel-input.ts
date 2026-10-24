import assert from "node:assert/strict";
import type { AuxiliaryPanelScenario } from "./auxiliary-panel-exercise";
import { expectFixtureInputReply } from "./fixture-session-input";

type PanelInputScene = Pick<
  AuxiliaryPanelScenario,
  "wait" | "input" | "sessionInput"
> & {
  readonly options: Pick<
    AuxiliaryPanelScenario["options"],
    "inputReady" | "captureInput" | "output"
  >;
};

export async function capturePanelInput(s: PanelInputScene) {
  // Only these two ready children belong to the oracle. A later peer retains
  // its native input owner, including startup DA replies and focus reporting.
  await s.wait(
    () => [0, 1].every((index) => s.options.inputReady(index)),
    "panel native children ready",
  );
  const releases: Array<() => void> = [];
  const setup = ["", ""];
  let observing = false;
  const release = () => {
    for (const dispose of releases) dispose();
    // Return the fixture cores to their reporting-enabled baseline only after
    // relinquishing input; the native owner receives any subsequent reports.
    for (const index of [0, 1]) s.options.output(index, "\u001b[?1004h");
  };
  try {
    for (const index of [0, 1])
      releases.push(
        s.options.captureInput(index, (data) => {
          if (observing) {
            s.input.push(data);
            s.sessionInput[index]!.push(data);
          } else setup[index] += data;
        }),
      );
    for (const index of [0, 1])
      await expectFixtureInputReply({
        input: () => {
          assert.ok(
            s.options.inputReady(index),
            "Panel native input owner lost",
          );
          return setup[index]!;
        },
        output: (data) => s.options.output(index, data),
        request: "\u001b[?1004l\u001b[?u",
        reply: "\u001b[?0u",
        waitFor: s.wait,
        label: `panel session ${index} focus isolation`,
      });
    assert.deepEqual(setup, ["\u001b[?0u", "\u001b[?0u"]);
    observing = true;
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
