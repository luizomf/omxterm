import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplicationDataError,
  createApplicationDocumentStore,
  requireArray,
  requireRecord,
  requireString,
  resolveApplicationDataDirectory,
  type ApplicationDocumentSchema,
} from "../../src/main/application-data";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-data-"));
  roots.push(root);
  return root;
}

type Notes = { readonly notes: readonly string[] };
const notesSchema: ApplicationDocumentSchema<Notes> = {
  fileName: "notes.json",
  version: 2,
  empty: () => ({ notes: [] }),
  migrate: (document, version) =>
    version === 1 && Array.isArray(document) ? { notes: document } : undefined,
  validate(document) {
    const record = requireRecord(document, "notes document");
    return {
      notes: requireArray(record.notes, "notes", 10).map((note, index) =>
        requireString(note, `notes[${index}]`, 20),
      ),
    };
  },
};

describe("Application Data documents", () => {
  it("resolves next to config.json under XDG_CONFIG_HOME", () => {
    expect(resolveApplicationDataDirectory({}, "/home/me")).toBe(
      path.join("/home/me", ".config", "omxterm"),
    );
    expect(
      resolveApplicationDataDirectory({ XDG_CONFIG_HOME: "/x" }, "/home/me"),
    ).toBe(path.join("/x", "omxterm"));
  });

  it("treats a missing file as the empty document without creating it", async () => {
    const root = await directory();
    const store = createApplicationDocumentStore(notesSchema, {
      directory: root,
    });
    expect(await store.load()).toEqual({ value: { notes: [] } });
    expect(await readdir(root)).toEqual([]);
  });

  it("saves atomically with private permissions and reloads the same value", async () => {
    const root = path.join(await directory(), "nested");
    const store = createApplicationDocumentStore(notesSchema, {
      directory: root,
    });
    await store.save({ notes: ["a", "b"] });
    expect(await readdir(root)).toEqual(["notes.json"]);
    expect(JSON.parse(await readFile(store.path, "utf8"))).toEqual({
      version: 2,
      data: { notes: ["a", "b"] },
    });
    if (process.platform !== "win32")
      expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect((await store.load()).value).toEqual({ notes: ["a", "b"] });
  });

  it("serializes concurrent saves so the last request wins", async () => {
    const store = createApplicationDocumentStore(notesSchema, {
      directory: await directory(),
    });
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        store.save({ notes: [String(index)] }),
      ),
    );
    expect((await store.load()).value).toEqual({ notes: ["7"] });
  });

  it("rejects invalid values before touching the file", async () => {
    const store = createApplicationDocumentStore(notesSchema, {
      directory: await directory(),
    });
    await store.save({ notes: ["kept"] });
    expect(() => store.save({ notes: ["x".repeat(21)] })).toThrow(TypeError);
    expect((await store.load()).value).toEqual({ notes: ["kept"] });
  });

  it("migrates older documents in memory", async () => {
    const root = await directory();
    await writeFile(
      path.join(root, "notes.json"),
      JSON.stringify({ version: 1, data: ["legacy"] }),
    );
    const store = createApplicationDocumentStore(notesSchema, {
      directory: root,
    });
    expect(await store.load()).toEqual({ value: { notes: ["legacy"] } });
    const stored = JSON.parse(await readFile(store.path, "utf8")) as {
      version: number;
    };
    expect(stored.version).toBe(1);
  });

  it("quarantines corrupt documents and keeps newer ones untouched", async () => {
    const root = await directory();
    const store = createApplicationDocumentStore(notesSchema, {
      directory: root,
    });
    await writeFile(store.path, "{not json");
    const recovered = await store.load();
    expect(recovered.value).toEqual({ notes: [] });
    expect(recovered.recovered?.reason).toBe("invalid");
    expect(recovered.recovered?.quarantinedAs).toMatch(
      /notes\.json\.corrupt-/u,
    );
    expect(await readdir(root)).toEqual([
      path.basename(recovered.recovered!.quarantinedAs!),
    ]);

    await writeFile(store.path, JSON.stringify({ version: 9, data: {} }));
    expect((await store.load()).recovered).toEqual({ reason: "newer-version" });
    expect(await readFile(store.path, "utf8")).toContain('"version":9');
  });

  it("names its error reasons", () => {
    expect(new ApplicationDataError("invalid", "x").reason).toBe("invalid");
  });
});
