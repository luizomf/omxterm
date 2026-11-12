import { BrowserWindow } from "electron";
import type { Value } from "../extension-runtime/protocol";
import { terminalIpc } from "../shared/terminal-ipc";
import type { CoreAction } from "./action-catalog";
import type { ApplicationExtensionsOptions } from "./application-extensions";
import type {
  createExtensionManager,
  ExtensionTarget,
} from "./extension-manager";
import { isSavedLayout, type SavedLayout } from "../shared/terminal-layout";
import type { LayoutSaveOutcome } from "../shared/terminal-contract";

export const SAVED_LAYOUT_ID = "omxterm.restoration";

type BackendCall = (value: Value, signal: AbortSignal) => Promise<Value>;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Save layout (ADR 0042): capture the window, then ask Saved Layout's own
 * backend to read and replace its one saved layout at the revision it just
 * read, like the page's Save. Nothing is retried; a write whose outcome is
 * unknown is reported as unknown, never as saved.
 */
export async function saveWindowLayout(
  capture: (signal: AbortSignal) => Promise<SavedLayout>,
  call: BackendCall,
  signal: AbortSignal,
): Promise<LayoutSaveOutcome> {
  let layout: unknown;
  let current: Record<string, unknown>;
  try {
    layout = await capture(signal);
    current = record(await call({ operation: "read" }, signal));
  } catch {
    return "failed";
  }
  const expectedRevision = current.revision;
  if (
    !isSavedLayout(layout) ||
    current.ok !== true ||
    typeof expectedRevision !== "string"
  )
    return "failed";
  let reply: Record<string, unknown>;
  try {
    reply = record(
      await call(
        { operation: "replace", expectedRevision, value: layout as Value },
        signal,
      ),
    );
  } catch {
    return "unknown";
  }
  if (
    reply.ok === true &&
    reply.status === "saved" &&
    typeof reply.revision === "string" &&
    reply.revision !== expectedRevision
  )
    return "saved";
  // The same reading as the page: these refusals wrote nothing.
  return reply.ok === false &&
    [
      "busy",
      "conflict",
      "invalid-request",
      "invalid-state",
      "invalid-value",
    ].includes(reply.error as string)
    ? "failed"
    : "unknown";
}

type SaveLayoutContext = {
  readonly options: Pick<
    ApplicationExtensionsOptions,
    "layout" | "sendAction" | "translator"
  >;
  readonly manager: ReturnType<typeof createExtensionManager> | undefined;
  // Each terminal window's target capture; Save layout uses its window context.
  readonly windows: ReadonlyMap<
    BrowserWindow,
    (sessionId?: string, context?: "window") => ExtensionTarget
  >;
  readonly stopping: () => boolean;
  running?: boolean;
};

/**
 * Save layout is Saved Layout's second entry, beside its page: the menu,
 * Command Palette and shortcut only, never the context menu. It saves the
 * focused window without showing the page; one save runs at a time.
 */
export function saveLayoutEntry(
  entry: {
    readonly id: string;
    readonly generation: number;
    readonly digest: string | null;
    readonly manifest?: { readonly capabilities?: readonly string[] } | null;
  },
  context: SaveLayoutContext,
): CoreAction[] {
  const declared = entry.manifest?.capabilities ?? [];
  if (
    entry.id !== SAVED_LAYOUT_ID ||
    !entry.digest ||
    !context.manager ||
    !["terminal.captureLayout.v1", "state.v1"].every((name) =>
      declared.includes(name),
    )
  )
    return [];
  const { options, stopping } = context;
  const call = context.manager.backendCall({
    id: entry.id,
    generation: entry.generation,
    digest: entry.digest,
  });
  return [
    {
      id: `${SAVED_LAYOUT_ID}.save`,
      label: options.translator().t("menu.saveLayout"),
      accelerator: null,
      palette: true,
      extension: true,
      shortcut: "saveLayout",
      invoke() {
        // The window, not its selected pane: a Settings tab or an exited
        // pane doesn't stop the window from being saved.
        const window = BrowserWindow.getFocusedWindow();
        const target =
          window && context.windows.get(window)?.(undefined, "window");
        if (!window || !target || target.signal.aborted) return;
        if (context.running || stopping()) return;
        context.running = true;
        void saveWindowLayout(
          (signal) => options.layout.capture(window, signal),
          call,
          target.signal,
        )
          .then((outcome) => {
            if (window.isDestroyed() || stopping()) return;
            options.sendAction(window.webContents, terminalIpc.tabCommand, {
              action: "layout-save-result",
              outcome,
            });
          })
          .finally(() => {
            context.running = false;
          });
      },
    },
  ];
}
