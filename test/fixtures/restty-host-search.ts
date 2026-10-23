import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";

export interface ResttySearchEvidence {
  readonly openedFocused: boolean;
  readonly asciiStatus: string;
  readonly selectedStatus: string;
  readonly unicodeStatus: string;
  readonly themed: boolean;
  readonly closed: boolean;
  readonly focusReturned: boolean;
  readonly queryReachedPty: boolean;
}

const searchState = `(() => {
  const surface = [
    ...document.querySelectorAll(".restty-terminal-surface"),
  ].find((element) => !element.hidden);
  const root = surface?.querySelector('[role="search"]');
  const active = document.activeElement;
  return {
    open: root?.dataset.open === "1",
    status: root?.querySelector(".restty-pane-search-status")?.textContent ?? "",
    inputFocused: active instanceof HTMLInputElement && !!root?.contains(active),
    terminalFocused: !!surface?.contains(active) && !root?.contains(active),
    themed:
      !!surface &&
      getComputedStyle(surface)
        .getPropertyValue("--restty-search-ui-background")
        .trim() ===
        surface.style.getPropertyValue("--terminal-background").trim(),
  };
})()`;

type SearchState = {
  readonly open: boolean;
  readonly status: string;
  readonly inputFocused: boolean;
  readonly terminalFocused: boolean;
  readonly themed: boolean;
};

// Drives Find through main IPC, real typing and real Enter/Escape key events
// against the production window host, Restty search bar and pinned core.
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
  const statusOf = async (
    expected: (status: string) => boolean,
    label: string,
  ) => {
    let status = "";
    await waitFor(
      async () => expected((status = (await state()).status)),
      label,
    );
    return status;
  };

  const lines: string[] = [];
  for (let index = 0; index < 300; index += 1)
    lines.push(index % 30 === 0 ? `needle-${index}` : `hay-${index}`);
  lines.push("日本語の端末");
  options.deliverOutput(`\r\n${lines.join("\r\n")}\r\n`);

  window.webContents.send(terminalIpc.find);
  await waitFor(async () => {
    const current = await state();
    return current.open && current.inputFocused;
  }, "search bar opened with focus");
  const opened = await state();

  await window.webContents.insertText("needle");
  const asciiStatus = await statusOf((s) => s === "10", "ten ASCII matches");
  key("Enter");
  const selectedStatus = await statusOf(
    (s) => /^\d+\/10$/.test(s),
    "a selected ASCII match",
  );

  window.webContents.send(terminalIpc.find);
  await waitFor(async () => (await state()).inputFocused, "refocused query");
  await window.webContents.insertText("日本語");
  const unicodeStatus = await statusOf((s) => s === "1", "one Unicode match");

  key("Escape");
  await waitFor(async () => !(await state()).open, "search bar closed");
  const closed = await state();

  return {
    openedFocused: opened.open && opened.inputFocused,
    asciiStatus,
    selectedStatus,
    unicodeStatus,
    themed: opened.themed,
    closed: !closed.open,
    focusReturned: closed.terminalFocused,
    queryReachedPty: /needle|日本語/.test(options.inputs.join("")),
  };
}
