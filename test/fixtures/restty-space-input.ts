function spaceKey(
  input: HTMLTextAreaElement,
  type: "keydown" | "keyup",
  modifiers: KeyboardEventInit = {},
): boolean {
  return input.dispatchEvent(
    new KeyboardEvent(type, {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
      ...modifiers,
    }),
  );
}

// Replay the observed DOM ordering, not an assumed native substitution trigger.
// Browser default actions do not run after a cancelled keydown/beforeinput.
function pressSpace(
  input: HTMLTextAreaElement,
  hasNativeText: boolean,
  modifiers: KeyboardEventInit = {},
): void {
  if (spaceKey(input, "keydown", modifiers) && hasNativeText) {
    const text = { data: " ", inputType: "insertText", bubbles: true };
    if (
      input.dispatchEvent(
        new InputEvent("beforeinput", { ...text, cancelable: true }),
      )
    )
      input.dispatchEvent(new InputEvent("input", text));
  }
  spaceKey(input, "keyup", modifiers);
}

export function exerciseResttySpaceInput(
  input: HTMLTextAreaElement,
  output: (data: string) => void,
  capture: (exercise: () => void) => readonly string[],
): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  // The report contains five separate presses but only the first beforeinput.
  // Replay the missing-event condition independently of each protocol/reset;
  // this does not assert that the controls cause native text-event loss.
  for (const [mode, sequence] of [
    ["legacy", "\u001b[=0u"],
    ["modifyOff", "\u001b[>4;0m"],
    ["modifyOn", "\u001b[>4;2m"],
    ["kitty124", "\u001b[=7u"],
    ["ris", "\u001bc"],
    ["softReset", "\u001b[!p"],
    ["xtermReset", "\u001bc\u001b[!p\u001b[?3;4l\u001b[4l\u001b>"],
    ["tmuxReset", "\u001bc\u001b[?1000l\u001b[?25h"],
  ] as const) {
    output("\u001b[=0u");
    output(sequence);
    result[mode] = capture(() => {
      for (let index = 0; index < 5; index += 1) pressSpace(input, index === 0);
    });
  }
  output("\u001b[=0u");
  result.normal = capture(() => {
    for (let index = 0; index < 5; index += 1) pressSpace(input, true);
  });
  result.held = capture(() => {
    // A real held key has one initial down, repeat downs, then one release.
    spaceKey(input, "keydown");
    for (let index = 0; index < 4; index += 1)
      spaceKey(input, "keydown", { repeat: true });
    spaceKey(input, "keyup");
  });
  result.shift = capture(() => pressSpace(input, false, { shiftKey: true }));
  result.control = capture(() => pressSpace(input, false, { ctrlKey: true }));
  result.nativeOption = capture(() =>
    pressSpace(input, true, { altKey: true }),
  );
  result.composition = capture(() => {
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    pressSpace(input, false);
    pressSpace(input, false, { isComposing: true });
    input.dispatchEvent(
      new CompositionEvent("compositionend", { data: "漢", bubbles: true }),
    );
    input.dispatchEvent(
      new InputEvent("input", {
        data: "漢",
        inputType: "insertText",
        bubbles: true,
      }),
    );
  });
  result.composingEvent = capture(() =>
    pressSpace(input, false, { isComposing: true }),
  );
  result.otherInput = capture(() => {
    const other = document.createElement("textarea");
    document.body.append(other);
    other.focus();
    pressSpace(other, true);
    other.remove();
    input.focus();
  });
  // Report-all mode deliberately encodes Space presses, repeats and releases.
  output("\u001b[=15u");
  result.kittyAll = capture(() => {
    spaceKey(input, "keydown");
    spaceKey(input, "keydown", { repeat: true });
    spaceKey(input, "keyup");
  });
  output("\u001b[=0u");
  return result;
}

// Fedora/XWayland commits dead keys through insertText without composition events.
// Preserve native default-action ordering: cancelling Space prevents the accent.
export function exerciseResttyDeadKeySpaceInput(
  input: HTMLTextAreaElement,
  output: (data: string) => void,
  capture: (exercise: () => void) => readonly string[],
): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  const key = (
    type: string,
    value: string,
    code: string,
    modifiers: KeyboardEventInit = {},
  ) =>
    input.dispatchEvent(
      new KeyboardEvent(type, {
        key: value,
        code,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      }),
    );
  const text = (data: string) => {
    const event = { data, inputType: "insertText", bubbles: true };
    if (
      input.dispatchEvent(
        new InputEvent("beforeinput", { ...event, cancelable: true }),
      )
    )
      input.dispatchEvent(new InputEvent("input", event));
  };
  const dead = () => {
    key("keydown", "Dead", "Quote");
    key("keyup", "Dead", "Quote");
  };
  const commit = (data: string) => {
    if (spaceKey(input, "keydown")) text(data);
    spaceKey(input, "keyup");
  };
  for (const [name, mode] of [
    ["legacy", "\u001b[=0u\u001b[>4;0m"],
    ["modifyOtherKeys", "\u001b[=0u\u001b[>4;2m"],
    ["kitty124", "\u001b[>4;0m\u001b[=7u"],
    ["kittyAll", "\u001b[=15u"],
  ] as const) {
    output(mode);
    result[name] = capture(() => {
      for (const accent of ["'", '"', "`", "~"]) {
        dead();
        commit(accent);
      }
    });
    result[`${name}FollowingSpace`] = capture(() => pressSpace(input, true));
    result[`${name}Alt`] = capture(() => {
      dead();
      pressSpace(input, true, { altKey: true });
    });
  }
  output("\u001b[=0u");
  result.modifier = capture(() => {
    dead();
    key("keydown", "Shift", "ShiftLeft", { shiftKey: true });
    key("keyup", "Shift", "ShiftLeft");
    commit("'");
  });
  result.letter = capture(() => {
    dead();
    if (key("keydown", "e", "KeyE")) text("é");
    key("keyup", "e", "KeyE");
    pressSpace(input, false);
  });
  result.doubleDead = capture(() => {
    dead();
    if (key("keydown", "Dead", "Quote")) text("´");
    key("keyup", "Dead", "Quote");
    pressSpace(input, false);
  });
  result.cancel = capture(() => {
    dead();
    key("keydown", "Escape", "Escape");
    key("keyup", "Escape", "Escape");
    pressSpace(input, false);
  });
  result.control = capture(() => {
    dead();
    pressSpace(input, false, { ctrlKey: true });
    pressSpace(input, false);
  });
  result.focus = capture(() => {
    dead();
    const other = document.createElement("textarea");
    document.body.append(other);
    other.focus();
    // Hidden macOS fixture windows change activeElement without dispatching blur.
    input.dispatchEvent(new FocusEvent("blur"));
    other.remove();
    input.focus();
    pressSpace(input, false);
  });
  result.windowBlur = capture(() => {
    dead();
    window.dispatchEvent(new Event("blur"));
    pressSpace(input, false);
  });
  result.compositionCancel = capture(() => {
    dead();
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    input.dispatchEvent(
      new CompositionEvent("compositionend", { data: "", bubbles: true }),
    );
    pressSpace(input, false);
  });
  output("\u001b[=15u");
  result.heldCommit = capture(() => {
    dead();
    if (spaceKey(input, "keydown")) text("'");
    if (spaceKey(input, "keydown", { repeat: true })) text(" ");
    spaceKey(input, "keyup");
  });
  result.heldModified = capture(() => {
    dead();
    if (spaceKey(input, "keydown")) text("'");
    key("keydown", "Control", "ControlLeft", { ctrlKey: true });
    spaceKey(input, "keydown", { repeat: true, ctrlKey: true });
    spaceKey(input, "keyup", { ctrlKey: true });
    key("keyup", "Control", "ControlLeft");
  });
  result.afterHeld = capture(() => pressSpace(input, true));
  output("\u001b[=0u");
  return result;
}
