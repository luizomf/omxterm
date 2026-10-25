import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import {
  createAboutDiagnostics,
  readAboutDiagnostics,
  hasAboutPhaseEvidence,
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

it("requires a producer-bound menu phase for the missing-result timeout control", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-phase-"));
  const file = path.join(root, "diagnostics.jsonl");
  try {
    for (const mode of ["missing-result", "published-hang"] as const)
      expect(
        hasAboutPhaseEvidence(await readAboutDiagnostics(file), mode),
      ).toBe(false);
    await writeFile(file, "invalid");
    for (const mode of ["missing-result", "published-hang"] as const)
      expect(
        hasAboutPhaseEvidence(await readAboutDiagnostics(file), mode),
      ).toBe(false);
    const diagnostics = createAboutDiagnostics(file);
    await rm(file);
    diagnostics.enter("bootstrap");
    for (const mode of ["missing-result", "published-hang"] as const)
      expect(
        hasAboutPhaseEvidence(await readAboutDiagnostics(file), mode),
      ).toBe(false);
    diagnostics.replacement(false);
    diagnostics.enter("producer-identity");
    diagnostics.enter("production-import");
    for (const mode of ["missing-result", "published-hang"] as const)
      expect(
        hasAboutPhaseEvidence(await readAboutDiagnostics(file), mode),
      ).toBe(false);
    diagnostics.enter("menu-observation");
    expect(
      hasAboutPhaseEvidence(await readAboutDiagnostics(file), "missing-result"),
    ).toBe(true);
    const valid = await readFile(file, "utf8");
    const { records } = await readAboutDiagnostics(file);
    for (const wrongProducer of [
      { pid: process.pid + 1 },
      { role: "replacement" },
    ]) {
      await writeFile(
        file,
        records
          .map((record) =>
            JSON.stringify(
              record.stage === "menu-observation"
                ? { ...record, ...wrongProducer }
                : record,
            ),
          )
          .join("\n"),
      );
      expect(
        hasAboutPhaseEvidence(
          await readAboutDiagnostics(file),
          "missing-result",
        ),
      ).toBe(false);
    }
    await writeFile(file, valid);
    // An earlier initial producer cannot cover a stalled replacement.
    diagnostics.replacement(true);
    diagnostics.enter("producer-identity");
    diagnostics.enter("production-import");
    expect(
      hasAboutPhaseEvidence(await readAboutDiagnostics(file), "missing-result"),
    ).toBe(false);
    diagnostics.enter("menu-observation");
    expect(
      hasAboutPhaseEvidence(await readAboutDiagnostics(file), "missing-result"),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("requires completed publication from the menu producer for the published-hang timeout control", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-published-"));
  const file = path.join(root, "diagnostics.jsonl");
  try {
    const diagnostics = createAboutDiagnostics(file);
    diagnostics.replacement(false);
    diagnostics.enter("producer-identity");
    diagnostics.enter("production-import");
    diagnostics.enter("menu-observation");
    diagnostics.enter("observation-publication");
    expect(
      hasAboutPhaseEvidence(await readAboutDiagnostics(file), "published-hang"),
    ).toBe(false);
    diagnostics.enter("observation-published");
    const valid = await readAboutDiagnostics(file);
    expect(hasAboutPhaseEvidence(valid, "published-hang")).toBe(true);
    for (const wrongProducer of [
      { pid: process.pid + 1 },
      { role: "replacement" },
    ]) {
      await writeFile(
        file,
        valid.records
          .map((record) =>
            JSON.stringify(
              record.stage === "observation-published"
                ? { ...record, ...wrongProducer }
                : record,
            ),
          )
          .join("\n"),
      );
      expect(
        hasAboutPhaseEvidence(
          await readAboutDiagnostics(file),
          "published-hang",
        ),
      ).toBe(false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("requires normal quit progression before accepting a published exit control, never a startup failure or window", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-about-quit-"));
  const file = path.join(root, "diagnostics.jsonl");
  try {
    const diagnostics = createAboutDiagnostics(file);
    diagnostics.replacement(false);
    diagnostics.enter("producer-identity");
    diagnostics.enter("production-import");
    diagnostics.enter("menu-observation");
    diagnostics.enter("observation-published");
    expect(
      hasAboutPhaseEvidence(
        await readAboutDiagnostics(file),
        "published-failure",
      ),
    ).toBe(false);
    diagnostics.enter("quit-request");
    diagnostics.enter("before-quit");
    expect(
      hasAboutPhaseEvidence(
        await readAboutDiagnostics(file),
        "published-failure",
      ),
    ).toBe(false);
    diagnostics.enter("will-quit");
    const normal = await readAboutDiagnostics(file);
    for (const mode of ["development", "packaged"] as const)
      expect(hasAboutPhaseEvidence(normal, mode)).toBe(true);
    expect(hasAboutPhaseEvidence(normal, "published-failure")).toBe(false);
    diagnostics.enter("failure-exit");
    const failure = await readAboutDiagnostics(file);
    expect(hasAboutPhaseEvidence(failure, "published-failure")).toBe(true);
    for (const stage of [
      "window-created",
      "startup-dialog",
      "watchdog",
    ] as const) {
      await writeFile(
        file,
        failure.records.map((record) => JSON.stringify(record)).join("\n") +
          "\n",
      );
      diagnostics.enter(stage);
      expect(
        hasAboutPhaseEvidence(
          await readAboutDiagnostics(file),
          "published-failure",
        ),
      ).toBe(false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
