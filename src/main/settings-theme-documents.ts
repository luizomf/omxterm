import { randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import { link, lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import type {
  ThemeDocumentExportResult,
  ThemeDocumentFailure,
  ThemeDocumentOpenResult,
  ThemeDocumentSave,
  ThemeDocumentSaveResult,
} from "../shared/settings-theme-documents";
import {
  TERMINAL_THEME_APPEARANCE_KEYS,
  TERMINAL_THEME_COLOR_KEYS,
  type TerminalTheme,
} from "../shared/terminal-theme";
import { MAX_SETTINGS_THEME_FILE_BYTES } from "./settings-themes";
import {
  createNodeSettingsFiles,
  removeSettingsTemporary,
  revisionOf,
  sameTemporary,
  settingsTarget,
  SettingsFileError,
} from "./settings-files";
import { TerminalThemeError, validateTerminalTheme } from "./terminal-theme";

class DocumentError extends Error {
  constructor(
    readonly reason: ThemeDocumentFailure["reason"],
    readonly detail?: string,
  ) {
    super(reason);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

// Existing OS-valid leaves are not retroactively constrained to the portable
// new-name policy (notably a POSIX backslash, colon, or Windows-reserved word).
function localPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith("themes/")
  )
    return false;
  const leaf = value.slice(7);
  return (
    leaf.length >= 5 &&
    leaf.endsWith(".json") &&
    !leaf.includes("\0") &&
    !leaf.includes("/") &&
    (process.platform !== "win32" ||
      (!/[<>:"\\|?*\p{Cc}]/u.test(leaf) &&
        !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)(?:[ .]*\.|$)/iu.test(
          leaf,
        ))) &&
    path.basename(leaf) === leaf &&
    !path.isAbsolute(leaf)
  );
}

function newFilename(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !localPath(`themes/${value}`)
  )
    return false;
  return (
    !/[<>:"/\\|?*\p{Cc}\p{Cf}\p{Cs}]/u.test(value) &&
    !/[ .]$/u.test(value) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)$/iu.test(
      value.split(".")[0]!.replace(/[ .]+$/u, ""),
    )
  );
}

function chosenPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 32768 &&
    !value.includes("\0") &&
    path.isAbsolute(value) &&
    !value.endsWith(path.sep) &&
    (process.platform !== "win32" || !value.endsWith("/"))
  );
}

function failure(
  cause: unknown,
  fallback: "read" | "write",
): ThemeDocumentFailure {
  if (cause instanceof DocumentError)
    return {
      status: "failed",
      reason: cause.reason,
      ...(cause.detail === undefined ? {} : { detail: cause.detail }),
    };
  if (cause instanceof SettingsFileError)
    return { status: "failed", reason: cause.kind };
  if (cause instanceof TerminalThemeError) {
    // Unknown keys and private paths are untrusted data, never diagnostics.
    const locations: readonly string[] = [
      "$",
      "version",
      "name",
      "colors",
      "appearance",
      ...TERMINAL_THEME_COLOR_KEYS.map((key) => `colors.${key}`),
      ...TERMINAL_THEME_APPEARANCE_KEYS.map((key) => `appearance.${key}`),
    ];
    const location =
      cause.location && locations.includes(cause.location)
        ? cause.location
        : "Theme";
    const detail = `${location}: ${cause.reason}`
      .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu, " ")
      .slice(0, 256);
    return { status: "failed", reason: "invalid", detail };
  }
  return { status: "failed", reason: fallback };
}

function decode(bytes: Uint8Array): TerminalTheme {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentError("invalid", "Theme is not valid UTF-8.");
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new DocumentError("invalid", "Theme is not valid JSON.");
  }
  return validateTerminalTheme(document, "");
}

// A complete, private temporary file is linked into place without replacing ANY
// entry, even a dangling symlink. No direct-write fallback is safe here.
async function publish(
  filePath: string,
  text: string,
  createParent: boolean,
): Promise<{ target: string; warning?: "cleanup" }> {
  const logicalParent = path.dirname(filePath);
  const parent = await settingsTarget(logicalParent);
  if (createParent) await mkdir(parent, { recursive: true });
  const parentIdentity = await lstat(parent);
  if (!parentIdentity.isDirectory()) throw new SettingsFileError("target");
  const checkParent = async () => {
    const latest = await lstat(parent);
    if (
      (await settingsTarget(logicalParent)) !== parent ||
      !latest.isDirectory() ||
      latest.dev !== parentIdentity.dev ||
      latest.ino !== parentIdentity.ino
    )
      throw new DocumentError("changed");
  };
  await checkParent();
  const target = path.join(parent, path.basename(filePath));
  const temporary = path.join(
    parent,
    `.omxterm-theme-${randomBytes(6).toString("hex")}.tmp`,
  );
  let created = false;
  let published = false;
  let identity: Stats | undefined;
  let warning: "cleanup" | undefined;
  try {
    const handle = await open(temporary, "wx", 0o600);
    created = true;
    try {
      identity = await handle.stat();
      await handle.writeFile(text, "utf8");
    } finally {
      await handle.close();
    }
    await checkParent();
    if (!sameTemporary(await lstat(temporary), identity))
      throw new DocumentError("changed");
    // Like guarded replacement, parent/temp checks reduce races; they do not
    // lock linked parents against a change after this final check.
    try {
      await link(temporary, target);
    } catch (cause) {
      if (
        typeof cause === "object" &&
        cause !== null &&
        (cause as NodeJS.ErrnoException).code === "EEXIST"
      )
        throw new DocumentError("exists");
      throw cause;
    }
    published = true;
  } finally {
    if (created) {
      try {
        await removeSettingsTemporary(temporary, identity);
      } catch {
        if (!published) throw new SettingsFileError("cleanup");
        warning = "cleanup";
      }
    }
  }
  return { target, ...(warning ? { warning } : {}) };
}

// Callers choose native dialog paths and serialize operations with Settings' run
// queue. This module owns validation and theme-only persistence, never reload.
export function createSettingsThemeDocuments(options: {
  readonly configurationPath: string;
}) {
  const files = createNodeSettingsFiles(MAX_SETTINGS_THEME_FILE_BYTES);
  const resolveLocal = (value: string) =>
    path.join(path.dirname(options.configurationPath), value);
  const read = async (filePath: string) => {
    const file = await files.read(filePath);
    if (file.bytes === null) throw new DocumentError("read");
    return { file, theme: decode(file.bytes) };
  };
  return {
    async openTheme(value: string): Promise<ThemeDocumentOpenResult> {
      if (!localPath(value)) return { status: "failed", reason: "invalid" };
      try {
        const { file, theme } = await read(resolveLocal(value));
        return {
          status: "opened",
          theme,
          base: { path: value, revision: revisionOf(file) },
        };
      } catch (cause) {
        return failure(cause, "read");
      }
    },
    async importTheme(filePath: string): Promise<ThemeDocumentOpenResult> {
      if (!chosenPath(filePath)) return { status: "failed", reason: "invalid" };
      try {
        return { status: "opened", theme: (await read(filePath)).theme };
      } catch (cause) {
        return failure(cause, "read");
      }
    },
    async saveTheme(
      request: ThemeDocumentSave,
    ): Promise<ThemeDocumentSaveResult> {
      try {
        if (
          !record(request) ||
          !exact(request, ["theme", "target"]) ||
          !record(request.target)
        )
          throw new DocumentError("invalid");
        const target: Record<string, unknown> = request.target;
        const copy =
          exact(target, ["newFilename"]) && newFilename(target.newFilename);
        const existing =
          exact(target, ["path", "revision"]) &&
          localPath(target.path) &&
          typeof target.revision === "string" &&
          /^[a-f0-9]{64}$/u.test(target.revision);
        if (!copy && !existing) throw new DocumentError("invalid");
        const theme = validateTerminalTheme(request.theme, "");
        const text = `${JSON.stringify(theme, null, 2)}\n`;
        if (copy) {
          const local = `themes/${target.newFilename as string}`;
          const saved = await publish(resolveLocal(local), text, true);
          return {
            status: "saved",
            base: {
              path: local,
              revision: revisionOf({
                target: saved.target,
                bytes: Buffer.from(text),
              }),
            },
            ...(saved.warning ? { warning: saved.warning } : {}),
          };
        }
        const local = target.path as string;
        const file = await files.read(resolveLocal(local));
        if (file.bytes === null || revisionOf(file) !== target.revision)
          throw new DocumentError("conflict");
        if (!(await files.replace(resolveLocal(local), text, file)))
          throw new DocumentError("conflict");
        return {
          status: "saved",
          base: {
            path: local,
            revision: revisionOf({ ...file, bytes: Buffer.from(text) }),
          },
        };
      } catch (cause) {
        return failure(cause, "write");
      }
    },
    async exportTheme(
      filePath: string,
      document: TerminalTheme,
    ): Promise<ThemeDocumentExportResult> {
      try {
        if (!chosenPath(filePath)) throw new DocumentError("invalid");
        const theme = validateTerminalTheme(document, "");
        const saved = await publish(
          filePath,
          `${JSON.stringify(theme, null, 2)}\n`,
          false,
        );
        return {
          status: "exported",
          ...(saved.warning ? { warning: saved.warning } : {}),
        };
      } catch (cause) {
        return failure(cause, "write");
      }
    },
  };
}
