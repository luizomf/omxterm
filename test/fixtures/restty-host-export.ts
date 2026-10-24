import type { BrowserWindow } from "electron";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type {
  TerminalContextMenuRequest,
  TerminalExportRequest,
} from "../../src/shared/terminal-contract";

export interface ResttyExportEvidenceSink {
  readonly contextMenuRequests: TerminalContextMenuRequest[];
  readonly exportRequests: TerminalExportRequest[];
  readonly clipboardTexts: string[];
}

// Shared by the host fixture's controller callbacks and the export oracle.
export const resttyExportEvidence: ResttyExportEvidenceSink = {
  contextMenuRequests: [],
  exportRequests: [],
  clipboardTexts: [],
};

// Stands in for main's native save dialog: records the requested text.
export async function recordExport(
  request: TerminalExportRequest,
): Promise<void> {
  resttyExportEvidence.exportRequests.push(request);
}

export interface ResttyExportEvidence {
  readonly contextMenuSelection: readonly boolean[];
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

// Drives export through the real context-menu request, main-to-renderer
// export IPC, the production window host and the prepared runtime. The
// fixture's saveTerminalExport records the text main would hand to the
// native dialog; the dialog itself is covered by unit tests.
export async function exerciseResttyTerminalExport(options: {
  readonly window: BrowserWindow;
  readonly deliverOutput: (data: string) => void;
  readonly evidence: ResttyExportEvidenceSink;
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
    window.webContents.send(terminalIpc.exportRequest, kind);
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
  await requestExport("content");
  const copiedAfter = await copy();

  // The renderer reads the text when the request arrives, so a tab opened
  // right after it cannot substitute its own content.
  const switched = requestExport("content");
  window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  const afterSwitch = await switched;

  return {
    contextMenuSelection: evidence.contextMenuRequests.map(
      (request) => request.hasSelection,
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
    afterTabSwitchFromOriginalTab: afterSwitch.text.includes("export-row-0\n"),
  };
}
