import {
  installedFallbackFontData,
  installedFontDataForRestty,
} from "./installed-font-family";
import {
  MAX_TERMINAL_FONT_DATA_BYTES,
  type TerminalFontData,
} from "../shared/terminal-font-data";
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
  const configuredData =
    family === undefined ? undefined : await installedFontDataForRestty(family);
  if (family !== undefined && configuredData === undefined)
    throw new Error("The active configured font family is no longer installed");
  const fallbacks = await installedFallbackFontData(
    undefined,
    undefined,
    MAX_TERMINAL_FONT_DATA_BYTES - (configuredData?.data.byteLength ?? 0),
  );
  return Object.freeze({
    ...(family === undefined
      ? {}
      : {
          configured: Object.freeze({
            family,
            sourceFamily: configuredData!.sourceFamily,
            data: configuredData!.data,
          }),
        }),
    fallbacks,
  });
}
