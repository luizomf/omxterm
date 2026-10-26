import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type {
  TerminalContextMenuRequest,
  TerminalExportSaveRequest,
} from "../../src/shared/terminal-contract";

export interface ResttyExportEvidenceSink {
  readonly contextMenuRequests: Array<TerminalContextMenuRequest | undefined>;
  readonly exportMenuChoices: Array<(() => void) | undefined>;
  readonly exportRequests: Extract<
    TerminalExportSaveRequest,
    { text: string }
  >[];
  readonly clipboardTexts: string[];
}

// Shared by the host fixture's controller callbacks and the export oracle.
export const resttyExportEvidence: ResttyExportEvidenceSink = {
  contextMenuRequests: [],
  exportMenuChoices: [],
  exportRequests: [],
  clipboardTexts: [],
};

// Synthetic save seam only: no native chooser or filesystem operation.
export async function recordExport(
  request: TerminalExportSaveRequest,
): Promise<void> {
  if ("notice" in request) throw new Error("Unexpected over-limit export");
  resttyExportEvidence.exportRequests.push(request);
}

export interface ResttyExportEvidence {
  readonly contextMenuSelection: readonly (boolean | "field")[];
  readonly contentKind: string;
  readonly contentFirstRow: boolean;
  readonly contentLastRow: boolean;
  readonly contentUnicode: boolean;
  readonly contentRowsInOrder: boolean;
  readonly selectionKind: string;
  readonly selectionMatchesCopy: boolean;
  readonly selectionPreserved: boolean;
  readonly afterTabSwitchFromOriginalTab: boolean;
}

const ROWS = 300;
const UNICODE = "日本語の端末 café 👩‍💻";

// Exercises the production popup callback, application source-window/controller
// claim, preload, window host and prepared runtime, stopping at a synthetic save
// seam. Callback activation is programmatic; it does not qualify native widgets.
export async function exerciseResttyTerminalExport(options: {
  readonly window: BrowserWindow;
  readonly deliverOutput: (data: string) => void;
  readonly evidence: ResttyExportEvidenceSink;
  readonly switchTabAfterSnapshot: () => Promise<void>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}): Promise<ResttyExportEvidence> {
  const { window, waitFor, evidence } = options;
  const contextMenu = async () => {
    const count = evidence.contextMenuRequests.length;
    await window.webContents.executeJavaScript(
      `[...document.querySelectorAll(".restty-terminal-surface")]
        .find((element) => !element.hidden)
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))`,
      true,
    );
    await waitFor(
      () => evidence.contextMenuRequests.length === count + 1,
      "context menu request",
    );
  };
  const requestExport = async (kind: "selection" | "content") => {
    const count = evidence.exportRequests.length;
    const context = evidence.contextMenuRequests.at(-1);
    const chooseExport = evidence.exportMenuChoices.at(-1);
    if (
      !context ||
      context.hasSelection !== (kind === "selection") ||
      !chooseExport
    )
      throw new Error("Synthetic export must match its original context menu");
    chooseExport();
    await waitFor(
      () => evidence.exportRequests.length === count + 1,
      `${kind} export request`,
    );
    return evidence.exportRequests.at(-1)!;
  };
  const copy = async () => {
    const count = evidence.clipboardTexts.length;
    window.webContents.send(terminalIpc.clipboardAction, "copy");
    await waitFor(
      () => evidence.clipboardTexts.length === count + 1,
      "copy of the current selection",
    );
    return evidence.clipboardTexts.at(-1)!;
  };

  const rows = Array.from(
    { length: ROWS },
    (_, index) => `export-row-${index}`,
  );
  options.deliverOutput(`\r\n${rows.join("\r\n")}\r\n${UNICODE}\r\n`);

  await contextMenu();
  const content = await requestExport("content");
  const positions = rows.map((row) => content.text.indexOf(`${row}\n`));
  // Reading the buffer must not have created a selection.
  await contextMenu();

  window.webContents.send(terminalIpc.clipboardAction, "select-all");
  await contextMenu();
  const copiedBefore = await copy();
  const selection = await requestExport("selection");
  const copiedAfter = await copy();

  // Wait for the save seam's receipt, proving the synchronous snapshot already
  // happened, before opening a new tab. Pre-callback switching is invalidation,
  // not permission to read a later pane or selection.
  await contextMenu();
  const afterSwitch = await requestExport("selection");
  await options.switchTabAfterSnapshot();

  return {
    contextMenuSelection: evidence.contextMenuRequests.map((request) =>
      request ? request.hasSelection : "field",
    ),
    contentKind: content.kind,
    contentFirstRow: content.text.includes("export-row-0\n"),
    contentLastRow: content.text.includes(`export-row-${ROWS - 1}\n`),
    contentUnicode: content.text.includes(UNICODE),
    contentRowsInOrder: positions.every(
      (position, index) =>
        position >= 0 && position > (positions[index - 1] ?? -1),
    ),
    selectionKind: selection.kind,
    selectionMatchesCopy: selection.text === copiedBefore,
    selectionPreserved: copiedAfter === copiedBefore && copiedBefore !== "",
    afterTabSwitchFromOriginalTab:
      afterSwitch.kind === "selection" &&
      afterSwitch.text === copiedBefore &&
      afterSwitch.text.includes("export-row-0\n"),
  };
}
