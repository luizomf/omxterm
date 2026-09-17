import {
  installedFallbackFontData,
  installedFontData,
} from "./installed-font-family";
import type { TerminalFontData } from "../shared/terminal-font-data";
import type { OperationalEventLog } from "./operational-events";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "./terminal-ipc-controller";

export function fontIpcRouter(
  ipcMain: unknown,
  operationalEvents: Pick<OperationalEventLog, "write">,
) {
  return registerTerminalIpcRouter(
    ipcMain as IpcMainPort,
    operationalEvents,
    loadTerminalFontData,
  );
}

export async function loadTerminalFontData(
  family: string | undefined,
): Promise<TerminalFontData> {
  const [configuredData, fallbacks] = await Promise.all([
    family === undefined ? undefined : installedFontData(family),
    installedFallbackFontData(),
  ]);
  if (family !== undefined && configuredData === undefined)
    throw new Error("The active configured font family is no longer installed");
  return Object.freeze({
    ...(family === undefined
      ? {}
      : { configured: Object.freeze({ family, data: configuredData! }) }),
    fallbacks,
  });
}
