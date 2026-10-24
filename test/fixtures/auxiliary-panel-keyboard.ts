import assert from "node:assert/strict";
import type { AuxiliaryPanelScenario } from "./auxiliary-panel-exercise";
import { expectFixtureInputReply } from "./fixture-session-input";

const shown = "!document.querySelector('#snippets-sidebar').hidden";
const searchFocused =
  "document.activeElement === document.querySelector('#snippets-sidebar input')";
const terminalFocused =
  "document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)";

export async function exercisePanelKeyboard(s: AuxiliaryPanelScenario) {
  const { until, wait, evaluate, key, input, contents } = s;
  const escape = "\u001b[27;1:1u\u001b[27;1:3u";
  // The outer panel capture already owns focus isolation on both cores.
  // Only session 0 receives this mode request; session 1 must not acknowledge it.
  const receipt = async (before: number, expected = "") => {
    // A fresh terminal Escape's complete response is an ordered input-IPC
    // receipt barrier; a DOM update or RAF cannot prove the release arrived.
    key("Escape");
    await wait(
      () => input.join("").length >= before + expected.length + escape.length,
      "panel terminal control receipt",
    );
    assert.equal(input.join("").slice(before), expected + escape);
  };
  try {
    await expectFixtureInputReply({
      input: () => s.sessionInput[0]!.join(""),
      output: (data) => s.options.output(0, data),
      request: "\u001b[>3u\u001b[?u",
      reply: "\u001b[?3u",
      waitFor: wait,
      label: "panel Kitty mode handshake",
    });
    key("S", ["control", "alt"]);
    await until(`!(${shown})`);
    for (const keyCode of ["Escape", "Enter"]) {
      key("S", ["control", "alt"]);
      await until(searchFocused);
      if (keyCode === "Enter")
        await evaluate(
          "document.querySelector('.auxiliary-header button').focus()",
        );
      const before = input.join("").length;
      contents.sendInputEvent({ type: "keyDown", keyCode });
      await until(`!(${shown}) && ${terminalFocused}`);
      contents.sendInputEvent({
        type: "keyDown",
        keyCode,
        modifiers: ["isautorepeat"],
      });
      contents.sendInputEvent({ type: "keyUp", keyCode });
      await receipt(before);
    }
    s.options.output(0, "\u001b[?2004l");
    for (const [index, execute] of [
      [0, false],
      [1, true],
    ] as const) {
      key("S", ["control", "alt"]);
      await until(searchFocused);
      await until("!!document.querySelector('#snippets-sidebar li button')");
      await evaluate(
        `document.querySelectorAll('#snippets-sidebar li button')[${index}].focus()`,
      );
      const before = input.join("").length;
      contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      // Enter's native button activation needs its keypress/char, as in the
      // About fixture. This is not printable text injection into shortcuts.
      contents.sendInputEvent({ type: "char", keyCode: "\r" });
      await until(terminalFocused);
      contents.sendInputEvent({
        type: "keyDown",
        keyCode: "Enter",
        modifiers: ["isautorepeat"],
      });
      contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      await receipt(before, ` synthetic  snippet ${execute ? "\r" : ""}`);
      key("S", ["control", "alt"]);
      await until(`!(${shown})`);
    }
    const beforeX = input.join("").length;
    // sendInputEvent does not synthesize OS character events for printable X.
    // Keep this local: shortcut/special-key helpers must not inject text.
    for (const type of ["keyDown", "char", "keyUp"] as const)
      contents.sendInputEvent({ type, keyCode: "X" });
    await wait(
      () => input.join("").length >= beforeX + 1,
      "fresh terminal key remains input",
    );
    assert.equal(input.join("").slice(beforeX), "X");
    await receipt(beforeX, "X");
    key("S", ["control", "alt"]);
    await until(searchFocused);
    await until(
      "document.querySelectorAll('#snippets-sidebar li button').length > 1",
    );
    const beforeSnippet = input.join("").length;
    await evaluate(
      "document.querySelectorAll('#snippets-sidebar li button')[1].click(); document.querySelector('.auxiliary-header button').click()",
    );
    await wait(
      () => input.join("").slice(beforeSnippet).endsWith("\r"),
      "accepted snippet survives panel hide",
    );
    assert.equal(input.join("").slice(beforeSnippet), " synthetic  snippet \r");
    await until(terminalFocused);
  } finally {
    s.options.output(0, "\u001b[<u");
  }
}
