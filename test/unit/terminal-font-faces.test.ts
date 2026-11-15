import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  installedFontDataForRestty,
  resolveFallbackFontFaces,
  resolveInstalledFontFace,
  type FontMetricsCommandOptions,
} from "../../src/main/installed-font-family";
import { installedFontStyleFaces } from "../../src/main/installed-font-style-faces";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import {
  fontIpcRouter,
  loadTerminalFontData,
} from "../../src/main/terminal-font-data";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  createTerminalFontFaceCache,
  installedTerminalFontFaces,
  type TerminalFontFaces,
} from "../../src/main/terminal-font-faces";

const regularFile = path.resolve("assets/fonts/DejaVuSansMono.ttf");
const boldFile = path.resolve("assets/fonts/DejaVuSansMono-Bold.ttf");
const family = "DejaVu Sans Mono";

type InstalledTable = Record<
  string,
  { regular: string; styles?: { style: string; path: string }[] }
>;

/** Answers both the single-family and the batched Windows lookup scripts. */
function windowsFonts(installed: InstalledTable) {
  const regular = (name: string) =>
    installed[name]
      ? { status: "available", family: name, path: installed[name].regular }
      : { status: "missing-regular" };
  const styles = (name: string) =>
    (installed[name]?.styles ?? []).map((face) => ({ ...face, family: name }));
  return vi.fn(
    async (
      file: string,
      arguments_: readonly string[],
      options?: FontMetricsCommandOptions,
    ) => {
      expect(file).toMatch(/[/\\]powershell\.exe$/u);
      const script = arguments_.at(-1)!;
      for (const name of Object.keys(installed))
        expect(script).not.toContain(name);
      const environment = options!.environment!;
      if (environment.OMXTERM_FONT_FAMILY_COUNT === undefined) {
        const name = environment.OMXTERM_FONT_FAMILY!;
        return {
          stdout: JSON.stringify(
            script.includes("$entry.Weight") ? styles(name) : regular(name),
          ),
        };
      }
      const names = Array.from(
        { length: Number(environment.OMXTERM_FONT_FAMILY_COUNT) },
        (_, index) => environment[`OMXTERM_FONT_FAMILY_${index}`]!,
      );
      return {
        stdout: JSON.stringify(
          names.map((name, index) => ({
            regular: regular(name),
            styles:
              String(index) === environment.OMXTERM_FONT_STYLED_INDEX &&
              installed[name]
                ? styles(name)
                : [],
          })),
        ),
      };
    },
  );
}

const installed: InstalledTable = {
  [family]: {
    regular: regularFile,
    styles: [{ style: "bold", path: boldFile }],
  },
  "Segoe UI Emoji": { regular: "C:\\Windows\\Fonts\\seguiemj.ttf" },
  "Segoe UI Symbol": { regular: "C:\\Windows\\Fonts\\seguisym.ttf" },
};

describe("Windows Terminal Font lookups", () => {
  it("finds the family, its styles and every fallback in one PowerShell process", async () => {
    const batched = windowsFonts(installed);
    const single = windowsFonts(installed);

    const faces = await installedTerminalFontFaces(family, batched, "win32");

    expect(batched).toHaveBeenCalledTimes(1);
    expect(batched.mock.calls[0]![2]!.environment).toEqual({
      OMXTERM_FONT_FAMILY_COUNT: "5",
      OMXTERM_FONT_STYLED_INDEX: "0",
      OMXTERM_FONT_FAMILY_0: family,
      OMXTERM_FONT_FAMILY_1: "Segoe UI Emoji",
      OMXTERM_FONT_FAMILY_2: "Microsoft YaHei UI",
      OMXTERM_FONT_FAMILY_3: "Malgun Gothic",
      OMXTERM_FONT_FAMILY_4: "Segoe UI Symbol",
    });
    expect(faces).toEqual({
      regular: await resolveInstalledFontFace(family, 16, single, "win32"),
      styles: await installedFontStyleFaces(family, single, "win32"),
      fallbacks: await resolveFallbackFontFaces(single, "win32"),
    });
    expect(faces.fallbacks.map((face) => face.family)).toEqual([
      "Segoe UI Emoji",
      "Segoe UI Symbol",
    ]);
  });

  it("asks only for the fallbacks, without styles, when no family is configured", async () => {
    const run = windowsFonts(installed);

    const faces = await installedTerminalFontFaces(undefined, run, "win32");

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![2]!.environment).toMatchObject({
      OMXTERM_FONT_FAMILY_COUNT: "4",
      OMXTERM_FONT_STYLED_INDEX: "",
      OMXTERM_FONT_FAMILY_0: "Segoe UI Emoji",
    });
    expect(faces.regular).toBeUndefined();
    expect(faces.styles).toEqual([]);
    expect(faces.fallbacks).toHaveLength(2);
  });

  it("validates every face's bytes like the single-family lookups", async () => {
    const run = windowsFonts(installed);
    const data = await loadTerminalFontData(family, (name) =>
      installedTerminalFontFaces(name, run, "win32"),
    );
    const reference = await installedFontDataForRestty(
      family,
      windowsFonts(installed),
      "win32",
    );

    expect(data.configured).toEqual({
      family,
      ...reference,
      styles: undefined,
    });
    expect(Object.keys(data.configuredStyles!)).toEqual(["bold"]);
    expect(data.configuredStyles!.bold!.data).toEqual(
      reference!.styles.bold!.data,
    );

    const mislabelled = windowsFonts({
      [family]: {
        regular: regularFile,
        styles: [{ style: "italic", path: regularFile }],
      },
    });
    await expect(
      loadTerminalFontData(family, (name) =>
        installedTerminalFontFaces(name, mislabelled, "win32"),
      ),
    ).rejects.toThrow("no exact italic");
  });

  it.each([
    ["output that is not JSON", () => "not json"],
    ["a missing answer", (answers: unknown[]) => answers.slice(1)],
    [
      "an extra field",
      (answers: Record<string, unknown>[]) => [
        { ...answers[0], extra: true },
        ...answers.slice(1),
      ],
    ],
    [
      "another family's face",
      (answers: Record<string, unknown>[]) => [
        {
          ...answers[0],
          regular: { status: "available", family: "Other", path: regularFile },
        },
        ...answers.slice(1),
      ],
    ],
  ])(
    "rejects a batched answer with %s for the configured family",
    async (_name, change) => {
      const honest = windowsFonts(installed);
      const run = async (
        file: string,
        arguments_: readonly string[],
        options?: FontMetricsCommandOptions,
      ) => {
        const { stdout } = await honest(file, arguments_, options);
        const changed = change(JSON.parse(stdout) as never);
        return {
          stdout:
            typeof changed === "string" ? changed : JSON.stringify(changed),
        };
      };
      await expect(
        installedTerminalFontFaces(family, run, "win32"),
      ).rejects.toThrow("Installed font family lookup returned invalid data");
    },
  );

  it("drops only a fallback whose batched answer is invalid", async () => {
    const honest = windowsFonts(installed);
    const faces = await installedTerminalFontFaces(
      family,
      async (file, arguments_, options) => {
        const answers = JSON.parse(
          (await honest(file, arguments_, options)).stdout,
        ) as { regular: unknown; styles: unknown[] }[];
        // A fallback never carries styles.
        answers[1]!.styles = [{ style: "bold", family, path: boldFile }];
        return { stdout: JSON.stringify(answers) };
      },
      "win32",
    );
    expect(faces.regular?.family).toBe(family);
    expect(faces.fallbacks.map((face) => face.family)).toEqual([
      "Segoe UI Symbol",
    ]);
  });

  it("keeps fallbacks best-effort when the lookup fails without a configured family", async () => {
    await expect(
      loadTerminalFontData(undefined, async () => {
        throw new Error("timed out");
      }),
    ).resolves.toEqual({ fallbacks: [] });
  });
});

describe("Terminal Font lookup cache", () => {
  const found = (file = regularFile): TerminalFontFaces => ({
    regular: { family, path: file, cellWidth: 9.6, cellHeight: 19.2 },
    styles: [],
    fallbacks: [],
  });

  it("looks a family up once for repeated and concurrent loads", async () => {
    const lookup = vi.fn(async () => found());
    const cache = createTerminalFontFaceCache(lookup);

    const [first, second] = await Promise.all([
      cache.lookup(family),
      cache.lookup(family),
    ]);
    const third = await cache.lookup(family);

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("looks again after forget, a failure, or a missing configured family", async () => {
    const lookup = vi.fn(async (): Promise<TerminalFontFaces> => found());
    const cache = createTerminalFontFaceCache(lookup);
    await cache.lookup(family);
    cache.forget();
    await cache.lookup(family);
    expect(lookup).toHaveBeenCalledTimes(2);

    lookup.mockRejectedValueOnce(new Error("timed out"));
    await expect(cache.lookup("Other")).rejects.toThrow("timed out");
    await cache.lookup("Other");
    expect(lookup).toHaveBeenCalledTimes(4);

    lookup.mockResolvedValueOnce({ styles: [], fallbacks: [] });
    expect((await cache.lookup("Absent")).regular).toBeUndefined();
    await cache.lookup("Absent");
    expect(lookup).toHaveBeenCalledTimes(6);
  });

  it("looks again when a remembered face file no longer exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-font-cache-"));
    try {
      const file = path.join(root, "font.ttf");
      await copyFile(regularFile, file);
      const lookup = vi
        .fn(async (): Promise<TerminalFontFaces> => found())
        .mockResolvedValueOnce(found(file));
      const cache = createTerminalFontFaceCache(lookup);
      await cache.lookup(family);
      await rm(file);

      expect((await cache.lookup(family)).regular?.path).toBe(regularFile);
      expect(lookup).toHaveBeenCalledTimes(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Terminal Font IPC lookups", () => {
  it("reuses lookups across font requests until a configuration is applied", async () => {
    const handlers = new Map<
      string,
      (event: unknown, payload?: unknown) => unknown
    >();
    const ignore = () => {};
    const lookup = vi.fn(async (): Promise<TerminalFontFaces> => ({
      styles: [],
      fallbacks: [],
    }));
    const router = fontIpcRouter(
      {
        handle: (key: string, handler: (event: unknown) => unknown) =>
          handlers.set(key, handler),
        on: ignore,
        removeHandler: ignore,
        removeListener: ignore,
      },
      { write: () => true },
      createTerminalFontFaceCache(lookup),
    );
    const webContents = {
      mainFrame: {},
      isDestroyed: () => false,
      send: ignore,
    };
    const configuration = terminalRendererConfiguration(
      { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
      0,
    );
    router.registerController({
      webContents,
      configuration,
      createSession: vi.fn(),
      onSessionStartError: ignore,
      onSessionExit: ignore,
      onSessionStarted: ignore,
      onSessionSelected: ignore,
      onTitleRequest: ignore,
      onBell: ignore,
      onUserInteraction: ignore,
      writeClipboardText: ignore,
      readClipboardText: () => "",
      confirmPaste: async () => false,
      showClipboardContextMenu: ignore,
      openExternalLink: async () => {},
      onExternalLinkOpenError: ignore,
      loadSnippets: async () => ({ snippets: [] }),
      loadLocalImage: async () => null,
    });
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    const request = () => handlers.get(terminalIpc.fontData)!(event, undefined);

    await request();
    await request();
    expect(lookup).toHaveBeenCalledTimes(1);

    router.applyConfiguration(configuration);
    await request();
    expect(lookup).toHaveBeenCalledTimes(2);
    router.dispose();
  });
});
