import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { expectFixtureInputReply } from "./fixture-session-input";

export interface ResttySearchEvidence {
  readonly openedFocused: boolean;
  readonly asciiStatus: string;
  readonly selectedStatus: string;
  readonly pastedQuery: string;
  readonly unicodeStatus: string;
  readonly themed: boolean;
  readonly counterMatchesField: boolean;
  readonly terminalKeysWhileOpen: boolean;
  readonly openAfterTerminalKeys: boolean;
  readonly closed: boolean;
  readonly focusReturned: boolean;
  readonly queryReachedPty: boolean;
  readonly kittyEscapeWrites: string;
}

const searchState = `(() => {
  const surface = [
    ...document.querySelectorAll(".restty-terminal-surface"),
  ].find((element) => !element.hidden);
  const root = surface?.querySelector('[role="search"]');
  const input = root?.querySelector("input");
  const status = root?.querySelector(".restty-pane-search-status");
  const active = document.activeElement;
  const canvas = surface?.querySelector("canvas")?.getBoundingClientRect();
  return {
    open: root?.dataset.open === "1",
    status: status?.textContent ?? "",
    query: input?.value ?? "",
    inputFocused: active instanceof HTMLInputElement && !!root?.contains(active),
    terminalFocused: !!surface?.contains(active) && !root?.contains(active),
    themed:
      !!surface &&
      getComputedStyle(surface)
        .getPropertyValue("--restty-search-ui-background")
        .trim() ===
        surface.style.getPropertyValue("--terminal-background").trim(),
    counterMatchesField:
      !!status &&
      !!input &&
      getComputedStyle(status).backgroundColor ===
        getComputedStyle(input).backgroundColor &&
      getComputedStyle(status).backgroundColor !== "rgb(37, 37, 37)",
    terminalPoint: canvas
      ? { x: Math.round(canvas.left + 40), y: Math.round(canvas.top + canvas.height / 2) }
      : undefined,
  };
})()`;

type SearchState = {
  readonly open: boolean;
  readonly status: string;
  readonly query: string;
  readonly inputFocused: boolean;
  readonly terminalFocused: boolean;
  readonly themed: boolean;
  readonly counterMatchesField: boolean;
  readonly terminalPoint:
    { readonly x: number; readonly y: number } | undefined;
};

// Drives Find through main IPC, real typing, real mouse and Enter/Escape key
// events and the application clipboard path against the production window
// host, Restty search bar and pinned core. The fixture clipboard reads
// "private".
export async function exerciseResttyScrollbackSearch(options: {
  readonly window: BrowserWindow;
  readonly deliverOutput: (data: string) => void;
  readonly inputs: readonly string[];
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}): Promise<ResttySearchEvidence> {
  const { window, waitFor } = options;
  const state = () =>
    window.webContents.executeJavaScript(
      searchState,
      true,
    ) as Promise<SearchState>;
  const key = (keyCode: string) => {
    window.webContents.sendInputEvent({ type: "keyDown", keyCode });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode });
  };
  const until = async (
    predicate: (current: SearchState) => boolean,
    label: string,
  ) => {
    let current!: SearchState;
    await waitFor(async () => predicate((current = await state())), label);
    return current;
  };
  const ptyInput = () => options.inputs.join("");

  const lines: string[] = [];
  for (let index = 0; index < 300; index += 1)
    lines.push(index % 30 === 0 ? `needle-${index}` : `hay-${index}`);
  lines.push("日本語の端末");
  options.deliverOutput(`\r\n${lines.join("\r\n")}\r\n`);

  window.webContents.send(terminalIpc.find);
  const opened = await until(
    (current) => current.open && current.inputFocused,
    "search bar opened with focus",
  );

  await window.webContents.insertText("needle");
  const ascii = await until((c) => c.status === "10", "ten ASCII matches");
  key("Enter");
  const selected = await until(
    (c) => /^\d+\/10$/.test(c.status),
    "a selected ASCII match",
  );

  // Application Paste and Select All edit the focused query, not the PTY.
  window.webContents.send(terminalIpc.clipboardAction, "paste");
  const pasted = await until(
    (c) => c.query === "needleprivate",
    "clipboard pasted into the query",
  );
  window.webContents.send(terminalIpc.clipboardAction, "select-all");
  await window.webContents.insertText("日本語");
  const unicode = await until(
    (c) => c.query === "日本語" && c.status === "1",
    "one Unicode match",
  );

  // With the bar open but the terminal focused, keys stay terminal input.
  const point = unicode.terminalPoint!;
  for (const type of ["mouseDown", "mouseUp"] as const)
    window.webContents.sendInputEvent({
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
  await until(
    (c) => c.open && c.terminalFocused,
    "terminal focused with the bar open",
  );
  const before = ptyInput().length;
  key("Enter");
  key("Escape");
  await waitFor(
    () => ptyInput().slice(before).includes("\r\u001b"),
    "Enter and Escape reached the PTY",
  );
  const afterTerminalKeys = await state();
  // Complete the shell's pending Meta sequence so fixture teardown can end it.
  key("Enter");
  await waitFor(
    () => ptyInput().slice(before).includes("\r\u001b\r"),
    "shell Meta sequence completed",
  );

  window.webContents.send(terminalIpc.find);
  await until((c) => c.inputFocused, "refocused query");
  key("Escape");
  const closed = await until((c) => !c.open, "search bar closed");

  // Under Kitty event reporting (flags 3), the Escape that closes the bar
  // must leave no release for the terminal, while a terminal-owned Escape
  // still reports its press and release. Isolate focus reports in the same
  // ordered output, then require a fresh exact reply from this session's core.
  let kittyEscapeWrites: string;
  try {
    await expectFixtureInputReply({
      input: ptyInput,
      output: options.deliverOutput,
      request: "\u001b[?1004l\u001b[>3u\u001b[?u",
      reply: "\u001b[?3u",
      waitFor,
      label: "Kitty flags 3 active with focus reporting isolated",
    });
    window.webContents.send(terminalIpc.find);
    await until((c) => c.inputFocused, "query focused under Kitty flags");
    const kittyStart = ptyInput().length;
    key("Escape");
    await until((c) => !c.open && c.terminalFocused, "bar closed by Escape");
    key("Escape");
    await waitFor(
      () => ptyInput().slice(kittyStart).includes("\u001b[27;1:3u"),
      "terminal-owned Escape release",
    );
    kittyEscapeWrites = ptyInput().slice(kittyStart);
  } finally {
    // Return to the fixture's reporting-enabled baseline even on a failed
    // handshake/key assertion; do not leave the Kitty stack pushed.
    options.deliverOutput("\u001b[<u\u001b[?1004h");
  }

  return {
    openedFocused: opened.open && opened.inputFocused,
    asciiStatus: ascii.status,
    selectedStatus: selected.status,
    pastedQuery: pasted.query,
    unicodeStatus: unicode.status,
    themed: opened.themed,
    counterMatchesField: unicode.counterMatchesField,
    terminalKeysWhileOpen: true,
    openAfterTerminalKeys:
      afterTerminalKeys.open && afterTerminalKeys.status === "1",
    closed: !closed.open,
    focusReturned: closed.terminalFocused,
    queryReachedPty: /needle|日本語|private/.test(ptyInput()),
    kittyEscapeWrites,
  };
}
