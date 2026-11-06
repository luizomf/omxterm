import type { Dir } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import {
  discoverSettingsThemes,
  MAX_SETTINGS_THEME_DIRECTORY_ENTRIES,
} from "../../src/main/settings-themes";
import { MAX_SETTINGS_THEMES } from "../../src/shared/settings-themes";
import { TERMINAL_THEME_COLOR_KEYS } from "../../src/shared/terminal-theme";

// Limits are iteration/read controls, not filesystem throughput benchmarks.
// settings-themes.test.ts retains the real filesystem and Settings service cases.
vi.mock("node:fs/promises", () => ({
  lstat: vi.fn(),
  open: vi.fn(),
  opendir: vi.fn(),
  realpath: vi.fn(),
}));

const config = path.resolve("synthetic-theme-limits", "config.json");
const directory = path.join(path.dirname(config), "themes");
const palette = Buffer.from(
  JSON.stringify({
    version: 1,
    name: "Synthetic",
    colors: Object.fromEntries(
      TERMINAL_THEME_COLOR_KEYS.map((key) => [key, "#123456"]),
    ),
  }),
);
const configuration = Buffer.from('{"version":1}');
const opened: string[] = [];
const closed: string[] = [];
let entriesRead = 0;
let directoryClosed = false;

function entries(count: number, suffix: string): void {
  vi.mocked(opendir).mockImplementation(async (value) => {
    expect(value).toBe(directory);
    return {
      async *[Symbol.asyncIterator]() {
        try {
          for (let index = 0; index < count; index++) {
            entriesRead++;
            yield { name: `${String(index).padStart(4, "0")}.${suffix}` };
          }
        } finally {
          directoryClosed = true;
        }
      },
    } as unknown as Dir;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  opened.length = closed.length = entriesRead = 0;
  directoryClosed = false;
  vi.mocked(realpath).mockImplementation(async (value) => String(value));
  const metadata = (value: unknown) => ({
    isFile: () => true,
    size: String(value) === config ? configuration.length : palette.length,
    dev: 1,
    ino: 1,
    mtimeMs: 1,
    ctimeMs: 1,
  });
  vi.mocked(lstat).mockImplementation(
    async (value) => metadata(value) as Awaited<ReturnType<typeof lstat>>,
  );
  vi.mocked(open).mockImplementation(async (value) => {
    const file = String(value);
    opened.push(file);
    let offset = 0;
    const bytes = file === config ? configuration : palette;
    return {
      stat: async () => metadata(file),
      read: async (buffer: Buffer, start: number, length: number) => {
        const bytesRead = bytes.copy(buffer, start, offset, offset + length);
        offset += bytesRead;
        return { bytesRead, buffer };
      },
      close: async () => {
        closed.push(file);
      },
    } as unknown as FileHandle;
  });
});

it.each([0, 1, 17])(
  "bounds candidate reads and reports actual truncation (%i extra)",
  async (extra) => {
    entries(MAX_SETTINGS_THEMES + extra, "json");
    const result = await discoverSettingsThemes(config);
    const expected = Array.from(
      { length: MAX_SETTINGS_THEMES },
      (_, index) => `themes/${String(index).padStart(4, "0")}.json`,
    );
    expect(result.status).toBe("ok");
    expect(result.themes.map((theme) => theme.path)).toEqual(expected);
    expect(result.invalid).toEqual([]);
    expect(result.truncated).toBe(extra > 0);
    expect(entriesRead).toBe(MAX_SETTINGS_THEMES + Math.min(extra, 1));
    expect(opened).toEqual([
      config,
      ...expected.map((file) => path.resolve(path.dirname(config), file)),
    ]);
    expect(closed).toEqual(opened);
    expect(directoryClosed).toBe(true);
  },
);

it.each([0, 1, 17])(
  "bounds nonmatching directory iteration and reports actual truncation (%i extra)",
  async (extra) => {
    entries(MAX_SETTINGS_THEME_DIRECTORY_ENTRIES + extra, "txt");
    expect(await discoverSettingsThemes(config)).toEqual({
      status: "ok",
      themes: [],
      invalid: [],
      truncated: extra > 0,
      hasConfiguredTheme: false,
    });
    expect(entriesRead).toBe(
      MAX_SETTINGS_THEME_DIRECTORY_ENTRIES + Math.min(extra, 1),
    );
    expect(opened).toEqual([config]);
    expect(closed).toEqual(opened);
    expect(directoryClosed).toBe(true);
  },
);
