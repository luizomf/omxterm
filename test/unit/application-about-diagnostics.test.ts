import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import {
  createAboutDiagnostics,
  readAboutDiagnostics,
} from "../fixtures/application-about-diagnostics";

vi.mock("electron", () => ({ app: {}, dialog: {}, Menu: {}, nativeImage: {} }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const mocked = {
    ...actual,
    execFileSync: vi.fn(),
    spawn: () => {
      throw new Error("Unexpected native spawn in About diagnostic test");
    },
  };
  return { ...mocked, default: mocked };
});

it("retains bounded replacement identity-failure evidence after the actual bootstrap throws and its profile is removed", async () => {
  const parent = await mkdtemp(
    path.join(tmpdir(), "omxterm-about-diagnostic-"),
  );
  const root = path.join(parent, "profile");
  const resultPath = path.join(root, "result.json");
  const diagnostics = path.join(parent, "about-diagnostics.jsonl");
  const originalArgv = process.argv;
  const originalFailure = Object.assign(
    new Error("spawnSync ps ETIMEDOUT /private/untrusted/path secret"),
    { code: "ETIMEDOUT" },
  );
  try {
    await mkdir(root);
    // The production relaunch retains the initial PID marker. A different PID
    // makes this actual bootstrap the replacement without fabricating identity.
    await writeFile(`${resultPath}.initial`, String(process.pid + 1));
    process.argv = [
      process.execPath,
      "fixture.mjs",
      path.join(root, "entry.mjs"),
      resultPath,
      "development",
      `--fixture-about-diagnostics=${diagnostics}`,
    ];
    vi.mocked(execFileSync).mockImplementation(() => {
      throw originalFailure;
    });
    vi.resetModules();
    await expect(import("../fixtures/application-about-main")).rejects.toBe(
      originalFailure,
    );
    expect(existsSync(`${resultPath}.completion`)).toBe(false);
    await rm(root, { recursive: true, force: true });
    const text = await readFile(diagnostics, "utf8");
    expect(text).toContain('"stage":"producer-identity"');
    expect(text).toContain('"role":"replacement"');
    expect(text).toContain('"category":"inspection-timeout"');
    expect(text).not.toContain("/private/");
    expect(text).not.toContain("secret");
    expect(Buffer.byteLength(text)).toBeLessThan(8192);
  } finally {
    process.argv = originalArgv;
    vi.mocked(execFileSync).mockReset();
    await rm(parent, { recursive: true, force: true });
  }
});

it("bounds About diagnostic metadata and never records arbitrary error details", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-metadata-"));
  const file = path.join(root, "diagnostics.jsonl");
  try {
    const diagnostics = createAboutDiagnostics(file);
    diagnostics.replacement(true);
    diagnostics.enter("production-import");
    diagnostics.failure({
      get code() {
        throw new Error("private getter detail");
      },
    });
    for (let count = 0; count < 1000; count += 1)
      diagnostics.enter("menu-observation");
    const result = await readAboutDiagnostics(file);
    expect(result.status).toBe("available");
    expect(result.records).toHaveLength(16);
    expect(result.records[1]).toMatchObject({
      stage: "production-import",
      role: "replacement",
      category: "unexpected-error",
    });
    const bytes = await readFile(file);
    expect(bytes.byteLength).toBeLessThanOrEqual(8192);
    expect(bytes.toString("utf8")).not.toContain("private");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each([
  '{"version":1,"stage":"producer-identity","role":"replacement","category":"none","pid":1,"secret":"private"}',
  '{"version":1,"stage":"unknown-stage","role":"replacement","category":"none","pid":1}',
  "invalid private payload",
  "x".repeat(16_385),
])(
  "rejects invalid or oversized About evidence without returning its payload (%#)",
  async (text) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-invalid-"));
    const file = path.join(root, "diagnostics.jsonl");
    try {
      await writeFile(file, text);
      expect(await readAboutDiagnostics(file)).toEqual({
        status: "invalid",
        records: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("reports unavailable About evidence without replacing startup failure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-unavailable-"));
  const file = path.join(root, "missing-parent", "diagnostics.jsonl");
  try {
    const diagnostics = createAboutDiagnostics(file);
    expect(() => {
      diagnostics.enter("bootstrap");
      diagnostics.failure(new Error("original failure"));
    }).not.toThrow();
    expect(await readAboutDiagnostics(file)).toEqual({
      status: "missing",
      records: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
