import { terminalIpc } from "../shared/terminal-ipc";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";

export interface SurfaceFontRequests {
  retainSurface(payload?: unknown): string;
  releaseSurface(payload?: unknown): void;
  configurationObserved(payload?: unknown): void;
}

export function registerSurfaceFontIpc(
  ipc: IpcMainPort,
  ownerFor: (event: IpcEvent) => SurfaceFontRequests | undefined,
  rejectSender: () => void,
): () => void {
  const owner = (event: IpcEvent) => {
    const controller = ownerFor(event);
    if (!controller) rejectSender();
    return controller;
  };
  ipc.handle(terminalIpc.retainSurface, (event, payload) => {
    const controller = owner(event);
    if (!controller)
      throw new Error("Rejected Surface IPC from an untrusted sender");
    return controller.retainSurface(payload);
  });
  const release = (event: IpcEvent, payload?: unknown) =>
    owner(event)?.releaseSurface(payload);
  const observed = (event: IpcEvent, payload?: unknown) =>
    owner(event)?.configurationObserved(payload);
  ipc.on(terminalIpc.releaseSurface, release);
  ipc.on(terminalIpc.configurationObserved, observed);
  return () => {
    ipc.removeHandler(terminalIpc.retainSurface);
    ipc.removeListener(terminalIpc.releaseSurface, release);
    ipc.removeListener(terminalIpc.configurationObserved, observed);
  };
}
