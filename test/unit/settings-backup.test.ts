import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackupError,
  collectBackup,
  decryptBackup,
  encryptBackup,
  isBackupFileName,
  restoreBackup,
  type RestoreTargets,
} from "../../src/main/settings-backup";
import { createHighlightSettingsService } from "../../src/main/highlight-settings-store";

const PASSPHRASE = "correct horse battery";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function configurationDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "omxterm-backup-"));
  roots.push(directory);
  await mkdir(path.join(directory, "themes"));
  await writeFile(path.join(directory, "config.json"), '{ "version": 1 }\n');
  await writeFile(path.join(directory, "themes", "night.json"), "{}");
  await writeFile(path.join(directory, "themes", "notes.txt"), "skip");
  await writeFile(
    path.join(directory, "highlights.json"),
    JSON.stringify({ version: 1, data: { enabled: true } }),
  );
  // Chromium's own state shares the directory and is never collected.
  await mkdir(path.join(directory, "Local Storage"));
  await writeFile(path.join(directory, "Preferences"), "{}");
  return directory;
}

describe("settings backup", () => {
  it("collects only OMXTerm's own files", async () => {
    const directory = await configurationDirectory();
    const contents = await collectBackup(
      directory,
      () => new Date("2026-10-22T12:00:00Z"),
    );
    expect(Object.keys(contents.files).sort()).toEqual([
      "config.json",
      "highlights.json",
      "themes/night.json",
    ]);
    expect(contents.createdAt).toBe("2026-10-22T12:00:00.000Z");
    expect(isBackupFileName("themes/../config.json")).toBe(false);
    expect(isBackupFileName("Preferences")).toBe(false);
  });

  it("round-trips through the passphrase and rejects a wrong one or tampering", async () => {
    const contents = {
      createdAt: "2026-10-22T12:00:00.000Z",
      files: { "config.json": "{}", "snippets.json": "[]" },
    };
    const bytes = await encryptBackup(contents, PASSPHRASE);
    expect(bytes.toString("utf8")).not.toContain("snippets.json");
    expect(await decryptBackup(bytes, PASSPHRASE)).toEqual(contents);
    await expect(
      decryptBackup(bytes, "wrong passphrase"),
    ).rejects.toMatchObject({ reason: "passphrase" });
    // The key parameters are authenticated with the data.
    const envelope = JSON.parse(bytes.toString("utf8")) as {
      kdf: { N: number };
    };
    envelope.kdf.N = 2 ** 16;
    await expect(
      decryptBackup(Buffer.from(JSON.stringify(envelope)), PASSPHRASE),
    ).rejects.toMatchObject({ reason: "passphrase" });
    envelope.kdf.N = 2 ** 30;
    await expect(
      decryptBackup(Buffer.from(JSON.stringify(envelope)), PASSPHRASE),
    ).rejects.toMatchObject({ reason: "invalid" });
  });

  it("refuses short passphrases, other files, newer versions and foreign paths", async () => {
    await expect(
      encryptBackup({ createdAt: "", files: {} }, "short"),
    ).rejects.toBeInstanceOf(BackupError);
    await expect(
      decryptBackup(Buffer.from("not json"), PASSPHRASE),
    ).rejects.toMatchObject({ reason: "invalid" });
    await expect(
      decryptBackup(
        Buffer.from(
          JSON.stringify({ format: "omxterm-settings-backup", version: 2 }),
        ),
        PASSPHRASE,
      ),
    ).rejects.toMatchObject({ reason: "newer-version" });
    const foreign = await encryptBackup(
      { createdAt: "2026-10-22T12:00:00.000Z", files: { "../.bashrc": "x" } },
      PASSPHRASE,
    );
    await expect(decryptBackup(foreign, PASSPHRASE)).rejects.toMatchObject({
      reason: "invalid",
    });
  });

  it("validates every document before changing any file", async () => {
    const directory = await configurationDirectory();
    const commit = vi.fn(async () => undefined);
    const targets: RestoreTargets = {
      "sessions.json": () => commit,
      "highlights.json": () => {
        throw new Error("bad rules");
      },
      "commands.json": () => commit,
    };
    await expect(
      restoreBackup(
        {
          createdAt: "2026-10-22T12:00:00.000Z",
          files: {
            "config.json": '{ "fontSize": 20 }',
            "sessions.json": "{}",
            "highlights.json": "{}",
          },
        },
        directory,
        targets,
      ),
    ).rejects.toThrow(/highlights.json in the backup is invalid/u);
    expect(commit).not.toHaveBeenCalled();
    expect(await readFile(path.join(directory, "config.json"), "utf8")).toBe(
      '{ "version": 1 }\n',
    );
  });

  it("restores user files and Application Data through its service", async () => {
    const directory = await configurationDirectory();
    const highlights = createHighlightSettingsService(directory);
    await highlights.load();
    const changed = vi.fn();
    highlights.subscribe(changed);
    const result = await restoreBackup(
      {
        createdAt: "2026-10-22T12:00:00.000Z",
        files: {
          "config.json": '{ "fontSize": 20 }',
          "themes/day.json": "{}",
          "highlights.json": JSON.stringify({
            version: 1,
            data: { enabled: false, contextAware: false },
          }),
        },
      },
      directory,
      {
        "sessions.json": () => async () => undefined,
        "highlights.json": highlights.prepareRestore,
        "commands.json": () => async () => undefined,
      },
    );
    expect(result).toEqual({ restored: 3 });
    expect(await readFile(path.join(directory, "config.json"), "utf8")).toBe(
      '{ "fontSize": 20 }',
    );
    expect(
      await readFile(path.join(directory, "themes", "day.json"), "utf8"),
    ).toBe("{}");
    // A theme missing from the backup is kept.
    expect(
      await readFile(path.join(directory, "themes", "night.json"), "utf8"),
    ).toBe("{}");
    expect(highlights.current()).toMatchObject({
      enabled: false,
      contextAware: false,
    });
    expect(changed).toHaveBeenCalledOnce();
  });
});
