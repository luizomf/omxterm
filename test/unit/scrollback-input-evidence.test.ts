// @vitest-environment jsdom
import { expect, it } from "vitest";
import { observeScrollbackNativeInput } from "../fixtures/scrollback-native-input";
import { scrollbackInputEvidence } from "../fixtures/scrollback-input-evidence";

it("retains only bounded classifications and rejects unexpected input even when it matches a later stimulus", () => {
  const evidence = scrollbackInputEvidence();
  evidence.write("x");
  evidence.write("private unexpected input");
  evidence.write("\u001b[12;34R");
  evidence.expect("character");
  expect(evidence.accepted("character")).toBe(false);
  evidence.write("x");
  expect(evidence.accepted("character")).toBe(true);
  evidence.expect("injection");
  evidence.write("injected");
  expect(evidence.snapshot()).toEqual({
    character: 1,
    injection: 1,
    replies: 1,
    unexpectedWrites: 2,
  });
  expect(JSON.stringify(evidence.snapshot())).not.toContain("private");
  evidence.write("x");
  expect(evidence.snapshot().unexpectedWrites).toBe(3);
});

it("preserves unexpected character classifications across phase resets without claiming their physical source", () => {
  document.body.innerHTML =
    '<canvas></canvas><textarea></textarea><div class="restty-native-scroll-host"></div>';
  try {
    const canvas = document.querySelector("canvas")!;
    const input = document.querySelector("textarea")!;
    const evidence = scrollbackInputEvidence();
    const observer = observeScrollbackNativeInput(
      canvas,
      input,
      () => false,
      () => evidence.accepted("character"),
      evidence,
    );
    const character = (data: string) =>
      input.dispatchEvent(
        new InputEvent("beforeinput", {
          data,
          inputType: "insertText",
        }),
      );
    character("x"); // Even the eventual fixture value is unexpected before arming.
    character("private typing");
    observer.reset();
    expect(observer.snapshot().unexpected).toEqual({
      characters: 2,
      writes: 0,
    });
    evidence.expect("character");
    character("x");
    evidence.write("x");
    const observation = observer.snapshot();
    expect(observation.character).toEqual({ trusted: false, input: true });
    expect(observation.accepted).toBe(true);
    expect(observation.unexpected).toEqual({ characters: 2, writes: 0 });
    expect(JSON.stringify(observation)).not.toContain("private typing");
  } finally {
    document.body.replaceChildren();
  }
});
