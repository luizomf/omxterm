import {
  readFallbackFontData,
  readInstalledFontFamilyFaces,
} from "./installed-font-family";
import {
  createTerminalFontFaceCache,
  installedTerminalFontFaces,
  type TerminalFontFaceLookup,
  type TerminalFontFaces,
} from "./terminal-font-faces";
import {
  MAX_TERMINAL_FONT_DATA_BYTES,
  type TerminalFontData,
} from "../shared/terminal-font-data";
import type { OperationalEventLog } from "./operational-events";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "./terminal-ipc-controller";
import type { TerminalIpcRouter } from "./terminal-ipc-types";

export function fontIpcRouter(
  ipcMain: unknown,
  operationalEvents: Pick<OperationalEventLog, "write">,
): TerminalIpcRouter {
  // Later app windows reuse the installed-font lookups; every load still reads
  // and validates the bytes. A configuration reload looks the families up again.
  const faces = createTerminalFontFaceCache();
  const router = registerTerminalIpcRouter(
    ipcMain as IpcMainPort,
    operationalEvents,
    (family) => loadTerminalFontData(family, faces.lookup),
  );
  return {
    ...router,
    applyConfiguration(configuration) {
      faces.forget();
      router.applyConfiguration(configuration);
    },
  };
}

export async function loadTerminalFontData(
  family: string | undefined,
  lookup: TerminalFontFaceLookup = installedTerminalFontFaces,
): Promise<TerminalFontData> {
  const faces = await lookup(family).catch(
    (error: unknown): TerminalFontFaces => {
      // Without a configured family, OS fallbacks stay best-effort.
      if (family === undefined) return { styles: [], fallbacks: [] };
      throw error;
    },
  );
  const configuredData =
    faces.regular === undefined
      ? undefined
      : await readInstalledFontFamilyFaces(faces.regular, faces.styles);
  if (family !== undefined && configuredData === undefined)
    throw new Error("The active configured font family is no longer installed");
  const configuredStyles = Object.fromEntries(
    Object.entries(configuredData?.styles ?? {}).map(([style, face]) => [
      style,
      { family: family!, ...face },
    ]),
  );
  const configuredBytes = [
    ...new Set([
      ...(configuredData ? [configuredData.data] : []),
      ...Object.values(configuredStyles).map((face) => face.data),
    ]),
  ].reduce((sum, data) => sum + data.byteLength, 0);
  const fallbacks = await readFallbackFontData(
    faces.fallbacks,
    MAX_TERMINAL_FONT_DATA_BYTES - configuredBytes,
  );
  return Object.freeze({
    ...(family === undefined
      ? {}
      : {
          configured: Object.freeze({
            family,
            sourceFamily: configuredData!.sourceFamily,
            faceIndex: configuredData!.faceIndex,
            data: configuredData!.data,
          }),
          configuredStyles,
        }),
    fallbacks,
  });
}
