import { execFile } from "node:child_process";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { BrowserWindow, type IpcMain } from "electron";
import {
  isConfigurationText,
  isPreferencesPatch,
  preferencesIpc,
} from "../shared/preferences";
import type { KeyCapture } from "./keybind-delivery";
import { writeAtomically } from "./application-data";
import type { OperationalEventLog } from "./operational-events";
import {
  createPreferencesService,
  type PreferencesService,
  type PreferencesServiceOptions,
} from "./preferences-service";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

const execFileAsync = promisify(execFile);
const MAX_FONT_FAMILIES = 512;
// A recorder that never stops (renderer crash, reload) cannot disable the
// window's keybinds for longer than this.
const CAPTURE_LIMIT_MS = 30_000;

// Installed monospace families for suggestions. Only Linux has a cheap,
// standard query (fontconfig); elsewhere the field stays free text.
export async function monospaceFontFamilies(
  platform: string = process.platform,
  run: (
    file: string,
    arguments_: readonly string[],
  ) => Promise<{ readonly stdout: string }> = (file, arguments_) =>
    execFileAsync(file, [...arguments_], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 3_000,
    }),
): Promise<readonly string[]> {
  if (platform !== "linux") return [];
  const { stdout } = await run("fc-list", [":spacing=mono", "family"]);
  const families = new Set<string>();
  for (const line of stdout.split("\n")) {
    // fc-list prints localized aliases after commas; the first is canonical.
    const family = line.split(",")[0]?.trim();
    if (family && family.length <= 256 && !/[\p{Cc}]/u.test(family))
      families.add(family);
  }
  return [...families]
    .sort((first, second) => first.localeCompare(second))
    .slice(0, MAX_FONT_FAMILIES);
}

export function startPreferences(
  options: Omit<PreferencesServiceOptions, "files" | "fontFamilies"> & {
    readonly ipcMain: IpcMain;
    readonly isTrustedSender: (event: IpcEvent) => boolean;
    readonly operationalEvents: Pick<OperationalEventLog, "write">;
  },
): PreferencesService & {
  open(): void;
  keyCapture(
    webContents: object & { send(channel: string, payload: unknown): void },
  ): KeyCapture;
} {
  const capturing = new WeakMap<object, number>();
  const service = createPreferencesService({
    ...options,
    files: {
      read: (filePath) => readFile(filePath),
      write: (filePath, text) =>
        writeAtomically({ mkdir, open, rename, rm }, filePath, text),
      list: (directory) => readdir(directory),
    },
    fontFamilies: () => monospaceFontFamilies(options.platform),
  });
  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [preferencesIpc.get]: () => service.snapshot(),
      [preferencesIpc.save]: (_event, payload) => {
        if (!isPreferencesPatch(payload))
          throw new TypeError("Invalid preferences change");
        return service.save(payload);
      },
      [preferencesIpc.reset]: () => service.reset(),
      [preferencesIpc.readFile]: () => service.readFile(),
      [preferencesIpc.writeFile]: (_event, payload) => {
        if (!isConfigurationText(payload))
          throw new TypeError("Invalid configuration text");
        return service.writeFile(payload);
      },
      [preferencesIpc.capture]: (event, payload) => {
        if (typeof payload !== "boolean")
          throw new TypeError("Invalid shortcut capture request");
        if (payload) capturing.set(event.sender, Date.now() + CAPTURE_LIMIT_MS);
        else capturing.delete(event.sender);
      },
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );
  return {
    ...service,
    keyCapture: (webContents) => ({
      active: () => (capturing.get(webContents) ?? 0) > Date.now(),
      send: (key) => webContents.send(preferencesIpc.capturedKey, key),
    }),
    open() {
      const window =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isDestroyed())
        window.webContents.send(preferencesIpc.open);
    },
  };
}
