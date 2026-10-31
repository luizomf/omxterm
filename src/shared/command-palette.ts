import { aboutIpc } from "./about";
import { settingsIpc } from "./settings";
import { terminalIpc } from "./terminal-ipc";

export const paletteIpc = {
  open: "command-palette:open",
  snapshot: "command-palette:snapshot",
  invoke: "command-palette:invoke",
  dispatch: "command-palette:dispatch",
} as const;

export interface PaletteAction {
  readonly id: string;
  readonly label: string;
  readonly accelerator: string | null;
}
export interface PaletteSnapshot {
  readonly token: string;
  readonly actions: readonly PaletteAction[];
}
export interface CommandPaletteBridge {
  snapshot(): Promise<PaletteSnapshot>;
  invoke(token: string, id: string): Promise<void>;
  onOpen(listener: () => void): () => void;
  setDispatchGuard(guard: ((token: string) => boolean) | undefined): void;
}
export const paletteActionChannels: ReadonlySet<string> = new Set([
  terminalIpc.tabCommand,
  terminalIpc.fontZoom,
  terminalIpc.find,
  terminalIpc.snippetsToggle,
  terminalIpc.tabBarToggle,
  terminalIpc.auxiliaryPanelToggle,
  terminalIpc.titleBarToggle,
  terminalIpc.localImageOpen,
  aboutIpc.open,
  settingsIpc.open,
]);
export function isPaletteIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
export function isPaletteSnapshot(value: unknown): value is PaletteSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PaletteSnapshot;
  return (
    isPaletteIdentity(candidate.token) &&
    Array.isArray(candidate.actions) &&
    candidate.actions.length <= 512 &&
    candidate.actions.every(
      (action: PaletteAction) =>
        action &&
        isPaletteIdentity(action.id) &&
        typeof action.label === "string" &&
        action.label.length > 0 &&
        action.label.length <= 2048 &&
        (action.accelerator === null ||
          (typeof action.accelerator === "string" &&
            action.accelerator.length <= 256)),
    )
  );
}
