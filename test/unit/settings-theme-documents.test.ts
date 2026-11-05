/* eslint-disable max-lines -- One production caller harness shares real-file validation and guarded-publication fault controls. */
import { execFileSync } from "node:child_process";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createSettingsThemeDocuments } from "../../src/main/settings-theme-documents";
import { MAX_SETTINGS_THEME_FILE_BYTES } from "../../src/main/settings-themes";
import {
  DEFAULT_TERMINAL_THEME,
  type TerminalTheme,
} from "../../src/shared/terminal-theme";
import type {
  ThemeDocumentBase,
  ThemeDocumentSave,
} from "../../src/shared/settings-theme-documents";

const faults = vi.hoisted(() => ({
  afterWrite: undefined as ((temporary: string) => Promise<void>) | undefined,
  afterChmod: undefined as (() => Promise<void>) | undefined,
  beforeReadOpen: undefined as ((target: string) => Promise<void>) | undefined,
  afterRead: undefined as (() => Promise<void>) | undefined,
  afterLink: undefined as
    ((temporary: string, target: string) => Promise<void>) | undefined,
  failLink: false,
  failCleanup: false,
  readLengths: [] as number[],
}));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomBytes: () => Buffer.from("010203040506", "hex"),
}));
vi.mock("node:fs/promises", async (original) => {
  const files = await original<typeof import("node:fs/promises")>();
  return {
    ...files,
    open: async (...args: Parameters<typeof files.open>) => {
      const name = String(args[0]);
      if (!name.endsWith(".tmp")) await faults.beforeReadOpen?.(name);
      const handle = await files.open(...args);
      if (name.endsWith(".tmp")) {
        const write = handle.writeFile.bind(handle);
        handle.writeFile = async (data, options) => {
          await write(data, options);
          await faults.afterWrite?.(name);
        };
        const changeMode = handle.chmod.bind(handle);
        handle.chmod = async (mode) => {
          await changeMode(mode);
          await faults.afterChmod?.();
        };
      } else {
        const read = handle.read.bind(handle);
        // Track bounded buffer capacity and mutate files at a real read seam.
        handle.read = (async (...readArgs: Parameters<typeof handle.read>) => {
          if (Buffer.isBuffer(readArgs[0]))
            faults.readLengths.push(readArgs[0].length);
          const result = await read(...readArgs);
          await faults.afterRead?.();
          return result;
        }) as typeof handle.read;
      }
      return handle;
    },
    link: async (...args: Parameters<typeof files.link>) => {
      if (faults.failLink)
        throw Object.assign(new Error("private unsupported link"), {
          code: "ENOTSUP",
        });
      await files.link(...args);
      await faults.afterLink?.(String(args[0]), String(args[1]));
    },
    rm: async (...args: Parameters<typeof files.rm>) => {
      if (faults.failCleanup && String(args[0]).endsWith(".tmp"))
        throw Object.assign(new Error("private cleanup path"), {
          code: "EACCES",
        });
      return files.rm(...args);
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  faults.afterWrite = undefined;
  faults.afterChmod = undefined;
  faults.beforeReadOpen = undefined;
  faults.afterRead = undefined;
  faults.afterLink = undefined;
  faults.failLink = false;
  faults.failCleanup = false;
  faults.readLengths.length = 0;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const theme: TerminalTheme = {
  ...DEFAULT_TERMINAL_THEME,
  name: "Complete palette",
  colors: { ...DEFAULT_TERMINAL_THEME.colors, foreground: "#AbCdEf" },
};
const changed: TerminalTheme = { ...theme, name: "Edited palette" };
const textOf = (value: TerminalTheme) => `${JSON.stringify(value, null, 2)}\n`;

async function setup(initial: TerminalTheme = theme) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-theme-documents-"));
  roots.push(root);
  const configurationPath = path.join(root, "config.json");
  const directory = path.join(root, "themes");
  await mkdir(directory);
  await writeFile(
    configurationPath,
    '{"version":1,"theme":{"path":"themes/source.json"}}',
  );
  const file = path.join(directory, "source.json");
  await writeFile(file, textOf(initial));
  const documents = createSettingsThemeDocuments({ configurationPath });
  return { root, directory, file, configurationPath, documents };
}
async function openBase(
  documents: ReturnType<typeof createSettingsThemeDocuments>,
  local = "themes/source.json",
): Promise<ThemeDocumentBase> {
  const result = await documents.openTheme(local);
  expect(result.status).toBe("opened");
  if (result.status !== "opened" || !result.base)
    throw new Error("expected writable base");
  return result.base;
}

it.each([
  undefined,
  {},
  { paneDivider: null, auxiliaryPanelDivider: "#aBcDEF" },
] as const)(
  "round trips complete palettes and exact appearance %j through caller operations",
  async (appearance) => {
    const document: TerminalTheme = {
      ...theme,
      ...(appearance === undefined ? {} : { appearance }),
    };
    const { documents, file, root, configurationPath } = await setup(document);
    const configBefore = await readFile(configurationPath);
    const base = await openBase(documents);
    expect(await documents.openTheme(base.path)).toEqual({
      status: "opened",
      theme: document,
      base,
    });
    const imported = await documents.importTheme(file);
    expect(imported).toEqual({ status: "opened", theme: document });
    const saved = await documents.saveTheme({ theme: document, target: base });
    expect(saved).toEqual({ status: "saved", base });
    expect(await readFile(file, "utf8")).toBe(textOf(document));
    const copy = await documents.saveTheme({
      theme: document,
      target: { newFilename: "copy.json" },
    });
    expect(copy.status).toBe("saved");
    if (copy.status !== "saved") throw new Error("expected copy");
    expect(await documents.openTheme(copy.base.path)).toEqual({
      status: "opened",
      theme: document,
      base: copy.base,
    });
    const savedAgain = await documents.saveTheme({
      theme: { ...document, name: "Next" },
      target: copy.base,
    });
    expect(savedAgain.status).toBe("saved");
    expect(
      JSON.parse(
        await readFile(path.join(root, "themes", "copy.json"), "utf8"),
      ),
    ).toEqual({ ...document, name: "Next" });
    const exported = path.join(root, "export.json");
    expect(await documents.exportTheme(exported, document)).toEqual({
      status: "exported",
    });
    expect(await readFile(exported, "utf8")).toBe(textOf(document));
    expect(await readFile(configurationPath)).toEqual(configBefore);
  },
);

it.each([
  "../source.json",
  "/themes/source.json",
  "themes/nested/source.json",
  "themes/../source.json",
  "themes/source.json/",
  "themes/a\0.json",
  "themes/source.txt",
  "themes/./source.json",
])("refuses unsafe local destination %j for reads and saves", async (local) => {
  const { documents, file } = await setup();
  expect(await documents.openTheme(local)).toMatchObject({
    status: "failed",
    reason: "invalid",
  });
  expect(
    await documents.saveTheme({
      theme,
      target: { path: local, revision: "a".repeat(64) },
    }),
  ).toMatchObject({ status: "failed", reason: "invalid" });
  expect(await readFile(file, "utf8")).toBe(textOf(theme));
});
it.each([
  "../copy.json",
  "a/b.json",
  "a\\b.json",
  "CON.json",
  "con.foo.json",
  "NUL.json",
  "LPT9.json",
  "COM¹.json",
  "CON .json",
  "a:b.json",
  "a?.json",
  "a*.json",
  "a|b.json",
  "a<.json",
  "a>.json",
  'a".json',
  "copy.json ",
  "copy.json.",
  "a\n.json",
  "a\0.json",
  "a".repeat(124) + ".json",
  "copy.txt",
])("refuses nonportable new filename %j", async (newFilename) => {
  const { documents, directory } = await setup();
  expect(await documents.saveTheme({ theme, target: { newFilename } })).toEqual(
    { status: "failed", reason: "invalid" },
  );
  expect(await readdir(directory)).toEqual(["source.json"]);
});
it("accepts the portable filename length limit and Unicode", async () => {
  const { documents } = await setup();
  expect(
    (
      await documents.saveTheme({
        theme,
        target: { newFilename: "a".repeat(123) + ".json" },
      })
    ).status,
  ).toBe("saved");
  expect(
    (
      await documents.saveTheme({
        theme,
        target: { newFilename: "Cópia clara.json" },
      })
    ).status,
  ).toBe("saved");
});
it.skipIf(process.platform === "win32")(
  "keeps existing OS-valid leaves editable without imposing new-name rules",
  async () => {
    const { documents, directory } = await setup();
    for (const name of [
      "a\\b.json",
      "CON.json",
      "a:b.json",
      ".json",
      "a\n.json",
      "x".repeat(180) + ".json",
    ]) {
      await writeFile(path.join(directory, name), textOf(theme));
      const base = await openBase(documents, `themes/${name}`);
      expect(
        (await documents.saveTheme({ theme: changed, target: base })).status,
      ).toBe("saved");
      expect(
        JSON.parse(await readFile(path.join(directory, name), "utf8")),
      ).toEqual(changed);
    }
  },
);
it.each([
  null,
  {},
  { theme },
  { theme, target: {} },
  { theme, target: { newFilename: "x.json", path: "themes/source.json" } },
  { theme, target: { path: "themes/source.json", revision: "untrusted" } },
  { theme, target: { newFilename: "x.json" }, extra: true },
])("independently rejects malformed save request %j", async (request) => {
  const { documents, directory } = await setup();
  expect(await documents.saveTheme(request as ThemeDocumentSave)).toEqual({
    status: "failed",
    reason: "invalid",
  });
  expect(await readdir(directory)).toEqual(["source.json"]);
});

it.each([
  { ...theme, version: 2 },
  { ...theme, name: "bad\nname" },
  { ...theme, colors: { foreground: "#ffffff" } },
  { ...theme, colors: { ...theme.colors, brightWhite: "#fff" } },
  { ...theme, appearance: { paneDivider: false } },
  { ...theme, PRIVATE_UNKNOWN_FIELD: "SECRET" },
])(
  "rejects the whole invalid document without leaking content",
  async (invalid) => {
    const { documents, file, root } = await setup();
    await writeFile(file, JSON.stringify(invalid));
    const opened = await documents.openTheme("themes/source.json");
    const imported = await documents.importTheme(file);
    const saved = await documents.saveTheme({
      theme: invalid as TerminalTheme,
      target: { newFilename: "copy.json" },
    });
    const exported = await documents.exportTheme(
      path.join(root, "export.json"),
      invalid as TerminalTheme,
    );
    for (const result of [opened, imported, saved, exported]) {
      expect(result).toMatchObject({ status: "failed", reason: "invalid" });
      expect(JSON.stringify(result)).not.toMatch(
        /PRIVATE|SECRET|omxterm-theme-documents/,
      );
      if (result.status === "failed")
        expect(result.detail?.length ?? 0).toBeLessThanOrEqual(256);
    }
  },
);
it.each([Buffer.from([0xff]), Buffer.from("{ not JSON"), Buffer.from("null")])(
  "rejects malformed UTF-8/JSON %j",
  async (bytes) => {
    const { documents, file } = await setup();
    await writeFile(file, bytes);
    expect(await documents.importTheme(file)).toMatchObject({
      status: "failed",
      reason: "invalid",
    });
  },
);
it("bounds all reads, accepting exactly 256 KiB and rejecting one extra byte", async () => {
  const { documents, file } = await setup();
  const content = textOf(theme).padEnd(MAX_SETTINGS_THEME_FILE_BYTES, " ");
  await writeFile(file, content);
  expect((await documents.importTheme(file)).status).toBe("opened");
  const base = await openBase(documents);
  expect(
    (await documents.saveTheme({ theme: changed, target: base })).status,
  ).toBe("saved");
  expect(faults.readLengths.length).toBeGreaterThan(2);
  expect(Math.max(...faults.readLengths)).toBe(
    MAX_SETTINGS_THEME_FILE_BYTES + 1,
  );
  await writeFile(file, content + " ");
  expect(await documents.importTheme(file)).toEqual({
    status: "failed",
    reason: "size",
  });
});
it("detects growth while a bounded read is in progress", async () => {
  const { documents, file } = await setup();
  faults.afterRead = async () => {
    faults.afterRead = undefined;
    await writeFile(file, textOf(changed));
  };
  expect(await documents.importTheme(file)).toEqual({
    status: "failed",
    reason: "conflict",
  });
});
it("also bounds the final comparison after target chmod", async () => {
  const { documents, file } = await setup();
  const base = await openBase(documents);
  faults.afterChmod = () =>
    writeFile(file, " ".repeat(MAX_SETTINGS_THEME_FILE_BYTES + 1));
  expect(await documents.saveTheme({ theme: changed, target: base })).toEqual({
    status: "failed",
    reason: "size",
  });
  expect((await stat(file)).size).toBe(MAX_SETTINGS_THEME_FILE_BYTES + 1);
});
it("sanitizes unreadable-file failures and rejects unchosen relative paths", async () => {
  const { documents, file, root } = await setup();
  faults.beforeReadOpen = async () => {
    throw new Error("PRIVATE path SECRET");
  };
  expect(await documents.importTheme(file)).toEqual({
    status: "failed",
    reason: "read",
  });
  expect(await documents.importTheme("relative.json")).toEqual({
    status: "failed",
    reason: "invalid",
  });
  expect(await documents.exportTheme("relative.json", theme)).toEqual({
    status: "failed",
    reason: "invalid",
  });
  expect(await documents.exportTheme(`${root}\0/x`, theme)).toEqual({
    status: "failed",
    reason: "invalid",
  });
});

it("preserves relative link chains, linked directories, mode and revision semantics", async () => {
  const { documents, directory, root, file } = await setup();
  await rm(directory, { recursive: true });
  await mkdir(path.join(root, "real"));
  await symlink("real", directory, "dir");
  const actual = path.join(root, "actual.json");
  await writeFile(actual, textOf(theme));
  if (process.platform !== "win32") await chmod(actual, 0o640);
  await symlink("../next.json", file);
  await symlink("actual.json", path.join(root, "next.json"));
  const base = await openBase(documents);
  const result = await documents.saveTheme({ theme: changed, target: base });
  expect(result.status).toBe("saved");
  if (result.status !== "saved") throw new Error("expected save");
  expect(result.base.revision).not.toBe(base.revision);
  expect(await openBase(documents)).toEqual(result.base);
  expect(path.normalize(await readlink(file))).toBe(
    path.normalize("../next.json"),
  );
  expect(await readlink(path.join(root, "next.json"))).toBe("actual.json");
  expect(await readlink(directory)).toBe("real");
  expect(await readFile(actual, "utf8")).toBe(textOf(changed));
  if (process.platform !== "win32")
    expect((await stat(actual)).mode & 0o777).toBe(0o640);
  expect(await documents.saveTheme({ theme, target: base })).toMatchObject({
    status: "failed",
    reason: "conflict",
  });
});
it.each(["dangling", "cycle", "directory", "dangling-parent"])(
  "refuses %s without healing or replacing it",
  async (kind) => {
    const { documents, root, file, directory } = await setup();
    await rm(file);
    if (kind === "directory") await mkdir(file);
    else if (kind === "dangling-parent") {
      await rm(directory, { recursive: true });
      await symlink("absent", directory, "dir");
    } else
      await symlink(kind === "cycle" ? "source.json" : "missing.json", file);
    expect(await documents.openTheme("themes/source.json")).toMatchObject({
      status: "failed",
      reason: kind === "directory" ? "target" : "symlink",
    });
    if (kind === "dangling-parent") {
      expect(
        await documents.saveTheme({
          theme,
          target: { newFilename: "copy.json" },
        }),
      ).toMatchObject({ status: "failed", reason: "symlink" });
      expect(await readdir(root)).toEqual(["config.json", "themes"]);
    }
  },
);
it.skipIf(process.platform === "win32")(
  "refuses a FIFO and a FIFO swapped in just before open without blocking",
  async () => {
    const { documents, file } = await setup();
    await rm(file);
    execFileSync("mkfifo", [file]);
    expect(await documents.openTheme("themes/source.json")).toEqual({
      status: "failed",
      reason: "target",
    });
    await rm(file);
    await writeFile(file, textOf(theme));
    faults.beforeReadOpen = async (target) => {
      faults.beforeReadOpen = undefined;
      await rm(target);
      execFileSync("mkfifo", [target]);
    };
    expect(await documents.openTheme("themes/source.json")).toEqual({
      status: "failed",
      reason: "target",
    });
  },
);

it("detects external edits and identical-byte link retargets before save", async () => {
  const { documents, file, root } = await setup();
  const base = await openBase(documents);
  await writeFile(file, textOf(changed));
  expect(await documents.saveTheme({ theme, target: base })).toEqual({
    status: "failed",
    reason: "conflict",
  });
  await writeFile(file, textOf(theme));
  const other = path.join(root, "other.json");
  await writeFile(other, textOf(theme));
  await rm(file);
  await symlink(other, file);
  expect(await documents.saveTheme({ theme: changed, target: base })).toEqual({
    status: "failed",
    reason: "conflict",
  });
  expect(await readFile(other, "utf8")).toBe(textOf(theme));
});
it.each(["edit", "retarget", "parent", "mode"])(
  "preserves originals after preparation-time %s changes",
  async (kind) => {
    const { documents, file, directory, root } = await setup();
    if (kind === "mode" && process.platform === "win32") return;
    if (kind === "mode") await chmod(file, 0o644);
    const other = path.join(root, "other.json");
    await writeFile(other, textOf(theme));
    const alternate = path.join(root, "alternate");
    await mkdir(alternate);
    await writeFile(path.join(alternate, "source.json"), textOf(theme));
    const base = await openBase(documents);
    faults.afterWrite = async () => {
      if (kind === "edit")
        await writeFile(file, textOf({ ...theme, name: "External" }));
      if (kind === "retarget") {
        await rm(file);
        await symlink(other, file);
      }
      if (kind === "parent") {
        await rm(directory, { recursive: true });
        await symlink(alternate, directory, "dir");
      }
      if (kind === "mode") await chmod(file, 0o600);
    };
    const result = await documents.saveTheme({ theme: changed, target: base });
    // Removing the directory also removes the owned temporary file; missing is safe.
    expect(result).toMatchObject({ status: "failed", reason: "conflict" });
    expect(await readFile(file, "utf8")).toBe(
      textOf(kind === "edit" ? { ...theme, name: "External" } : theme),
    );
    expect(await readFile(other, "utf8")).toBe(textOf(theme));
  },
);
it("detects same-byte linked parent retarget after permissions are applied", async () => {
  const { documents, file, directory, root } = await setup();
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  await mkdir(first);
  await mkdir(second);
  await writeFile(path.join(first, "source.json"), textOf(theme));
  await writeFile(path.join(second, "source.json"), textOf(theme));
  await rm(directory, { recursive: true });
  await symlink(first, directory, "dir");
  const base = await openBase(documents);
  faults.afterChmod = async () => {
    await rm(directory);
    await symlink(second, directory, "dir");
  };
  expect(await documents.saveTheme({ theme: changed, target: base })).toEqual({
    status: "failed",
    reason: "conflict",
  });
  expect(await readFile(file, "utf8")).toBe(textOf(theme));
  expect(await readdir(first)).toEqual(["source.json"]);
});
it.skipIf(process.platform === "win32")(
  "never chmods, publishes or removes a substituted temporary symlink",
  async () => {
    const { documents, file, root } = await setup();
    const victim = path.join(root, "victim");
    await writeFile(victim, "untouched", { mode: 0o600 });
    await chmod(victim, 0o600);
    await chmod(file, 0o644);
    const base = await openBase(documents);
    let temporary = "";
    faults.afterWrite = async (name) => {
      temporary = name;
      await rm(name);
      await symlink(victim, name);
    };
    expect(await documents.saveTheme({ theme: changed, target: base })).toEqual(
      { status: "failed", reason: "cleanup" },
    );
    expect(await readFile(file, "utf8")).toBe(textOf(theme));
    expect(await readFile(victim, "utf8")).toBe("untouched");
    expect((await stat(victim)).mode & 0o777).toBe(0o600);
    expect((await lstat(temporary)).isSymbolicLink()).toBe(true);
  },
);

it.each(["copy", "export"] as const)(
  "publishes %s privately with no replacing any existing entry",
  async (route) => {
    const { documents, root, directory } = await setup();
    const destination = path.join(
      route === "copy" ? directory : root,
      "new.json",
    );
    const save = () =>
      route === "copy"
        ? documents.saveTheme({ theme, target: { newFilename: "new.json" } })
        : documents.exportTheme(destination, theme);
    const existing = path.join(root, "unrelated");
    await writeFile(existing, "untouched");
    for (const kind of ["file", "directory", "dangling", "link", "hardlink"]) {
      if (kind === "file") await writeFile(destination, "original");
      if (kind === "directory") await mkdir(destination);
      if (kind === "dangling") await symlink("missing.json", destination);
      if (kind === "link") await symlink(existing, destination);
      if (kind === "hardlink") await link(existing, destination);
      expect(await save()).toEqual({ status: "failed", reason: "exists" });
      expect(await readFile(existing, "utf8")).toBe("untouched");
      if (kind === "file")
        expect(await readFile(destination, "utf8")).toBe("original");
      if (kind === "dangling")
        expect(await readlink(destination)).toBe("missing.json");
      await rm(destination, { recursive: true });
    }
    let preparedMode = 0;
    faults.afterWrite = async (name) => {
      preparedMode = (await stat(name)).mode & 0o777;
    };
    expect((await save()).status).toBe(route === "copy" ? "saved" : "exported");
    expect(await readFile(destination, "utf8")).toBe(textOf(theme));
    if (process.platform !== "win32") {
      expect(preparedMode).toBe(0o600);
      expect((await stat(destination)).mode & 0o777).toBe(0o600);
    }
  },
);
it("refuses a destination created after temporary preparation", async () => {
  const { documents, directory } = await setup();
  const destination = path.join(directory, "new.json");
  faults.afterWrite = () => writeFile(destination, "concurrent");
  expect(
    await documents.saveTheme({ theme, target: { newFilename: "new.json" } }),
  ).toEqual({ status: "failed", reason: "exists" });
  expect(await readFile(destination, "utf8")).toBe("concurrent");
});
it.each(["copy", "export"] as const)(
  "returns %s success with a cleanup warning after publication",
  async (route) => {
    const { documents, root, directory } = await setup();
    faults.failCleanup = true;
    const destination = path.join(
      route === "copy" ? directory : root,
      "new.json",
    );
    const result =
      route === "copy"
        ? await documents.saveTheme({
            theme,
            target: { newFilename: "new.json" },
          })
        : await documents.exportTheme(destination, theme);
    expect(result).toMatchObject({
      status: route === "copy" ? "saved" : "exported",
      warning: "cleanup",
    });
    if (result.status === "saved")
      expect(await openBase(documents, result.base.path)).toEqual(result.base);
    expect(await readFile(destination, "utf8")).toBe(textOf(theme));
    expect(await readdir(path.dirname(destination))).toContain(
      ".omxterm-theme-010203040506.tmp",
    );
  },
);
it("does not remove a temp substituted after publication and keeps the saved base", async () => {
  const { documents, directory } = await setup();
  faults.afterLink = async (temporary) => {
    await rm(temporary);
    await writeFile(temporary, "foreign");
  };
  const result = await documents.saveTheme({
    theme,
    target: { newFilename: "new.json" },
  });
  expect(result).toMatchObject({ status: "saved", warning: "cleanup" });
  expect(
    await readFile(
      path.join(directory, ".omxterm-theme-010203040506.tmp"),
      "utf8",
    ),
  ).toBe("foreign");
  expect(await readFile(path.join(directory, "new.json"), "utf8")).toBe(
    textOf(theme),
  );
});
it.each(["copy", "export"] as const)(
  "does not publish %s from a substituted temporary entry",
  async (route) => {
    const { documents, directory, root } = await setup();
    let temporary = "";
    faults.afterWrite = async (name) => {
      temporary = name;
      await rm(name);
      await writeFile(name, "foreign");
    };
    const destination = path.join(
      route === "copy" ? directory : root,
      "new.json",
    );
    const result =
      route === "copy"
        ? await documents.saveTheme({
            theme,
            target: { newFilename: "new.json" },
          })
        : await documents.exportTheme(destination, theme);
    expect(result).toEqual({ status: "failed", reason: "cleanup" });
    expect(await readFile(temporary, "utf8")).toBe("foreign");
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  },
);
it.each(["copy", "export"] as const)(
  "refuses %s when no-replace linking is unsupported",
  async (route) => {
    const { documents, directory, root } = await setup();
    faults.failLink = true;
    const destination = path.join(
      route === "copy" ? directory : root,
      "new.json",
    );
    const result =
      route === "copy"
        ? await documents.saveTheme({
            theme,
            target: { newFilename: "new.json" },
          })
        : await documents.exportTheme(destination, theme);
    expect(result).toEqual({ status: "failed", reason: "write" });
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(path.dirname(destination))).not.toContain(
      ".omxterm-theme-010203040506.tmp",
    );
  },
);
it("creates ordinarily missing themes parents but never creates export parents", async () => {
  const { documents, directory, root } = await setup();
  await rm(directory, { recursive: true });
  expect(
    (await documents.saveTheme({ theme, target: { newFilename: "new.json" } }))
      .status,
  ).toBe("saved");
  expect(
    await documents.exportTheme(
      path.join(root, "missing", "export.json"),
      theme,
    ),
  ).toEqual({ status: "failed", reason: "write" });
  await expect(lstat(path.join(root, "missing"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it.each(["copy", "export"] as const)(
  "captures/rechecks linked %s destination parents",
  async (route) => {
    const { documents, directory, root } = await setup();
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    await mkdir(first);
    await mkdir(second);
    await rm(directory, { recursive: true });
    await symlink(first, directory, "dir");
    const save = () =>
      route === "copy"
        ? documents.saveTheme({ theme, target: { newFilename: "new.json" } })
        : documents.exportTheme(path.join(directory, "new.json"), theme);
    expect((await save()).status).toBe(route === "copy" ? "saved" : "exported");
    await rm(path.join(first, "new.json"));
    faults.afterWrite = async () => {
      await rm(directory);
      await symlink(second, directory, "dir");
    };
    expect(await save()).toEqual({ status: "failed", reason: "changed" });
    expect(await readdir(first)).toEqual([]);
    expect(await readdir(second)).toEqual([]);
  },
);
it("preserves a colliding temporary file and reports preparation cleanup failures", async () => {
  const { documents, directory } = await setup();
  const temporary = path.join(directory, ".omxterm-theme-010203040506.tmp");
  await writeFile(temporary, "existing");
  expect(
    await documents.saveTheme({ theme, target: { newFilename: "new.json" } }),
  ).toEqual({ status: "failed", reason: "write" });
  expect(await readFile(temporary, "utf8")).toBe("existing");
  await rm(temporary);
  faults.afterWrite = async () => {
    faults.failCleanup = true;
    throw new Error("PRIVATE failure");
  };
  expect(
    await documents.saveTheme({ theme, target: { newFilename: "new.json" } }),
  ).toEqual({ status: "failed", reason: "cleanup" });
  await expect(lstat(path.join(directory, "new.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
