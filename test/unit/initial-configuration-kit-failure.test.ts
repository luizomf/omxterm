import { mkdtemp, open, readdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { createInitialConfigurationKit } from "../../src/main/initial-configuration-kit";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), unlink: vi.fn(actual.unlink) };
});

it("removes an owned partial temporary after a write failure, but never unlinks an open collision", async () => {
  const homeDirectory = await mkdtemp(
    path.join(tmpdir(), "omxterm-kit-failure-"),
  );
  onTestFinished(async () => {
    vi.restoreAllMocks();
    await rm(homeDirectory, { recursive: true, force: true });
  });
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  vi.mocked(open).mockImplementationOnce(async (...args) => {
    const file = await actual.open(...args);
    vi.spyOn(file, "writeFile").mockImplementationOnce(async () => {
      await actual.writeFile(args[0], "partial bytes");
      throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    });
    return file;
  });
  const options = { homeDirectory, environment: {} };
  expect(await createInitialConfigurationKit(options)).toContain(
    "could not create",
  );
  const directory = path.join(homeDirectory, ".config", "omxterm");
  expect(await readdir(directory)).toEqual(["themes"]);
  expect(await readdir(path.join(directory, "themes"))).toEqual([]);
  expect(unlink).toHaveBeenCalledOnce();

  vi.mocked(unlink).mockClear();
  vi.mocked(open).mockRejectedValueOnce(
    Object.assign(new Error("collision"), { code: "EEXIST" }),
  );
  expect(await createInitialConfigurationKit(options)).toContain(
    "could not create",
  );
  expect(unlink).not.toHaveBeenCalled();
});
