import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  admitOrdinaryReadiness,
  ordinaryStartupMs,
  parseOrdinaryReadiness,
} from "../fixtures/snippets-ordinary";

afterEach(() => vi.restoreAllMocks());
function receiptFile() {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "ordinary-readiness-")),
  );
  const file = path.join(root, "receipt.json");
  const bytes = Buffer.from(JSON.stringify({ mainPid: 123, probePid: 456 }));
  return {
    root,
    file,
    bytes,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

it("admits external receipt and actual owner identity before any async CDP polling", async () => {
  const f = receiptFile();
  const order: string[] = [];
  const verifyMain = vi.fn(async () => {
    order.push("identity");
  });
  const ready = vi.fn(async (remaining: number) => {
    expect(order).toContain("external-readiness:verified");
    expect(verifyMain).toHaveBeenCalledOnce();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(ordinaryStartupMs);
    order.push("ready");
    return true;
  });
  try {
    writeFileSync(f.file, "");
    const admitted = admitOrdinaryReadiness({
      file: f.file,
      expectedMainPid: 123,
      verifyMain,
      ready,
      nativeExited: () => false,
      record: (event) => {
        order.push(event);
      },
    });
    expect(ready).not.toHaveBeenCalled();
    writeFileSync(f.file, f.bytes);
    expect(await admitted).toEqual({ mainPid: 123, probePid: 456 });
    expect(order.indexOf("identity")).toBeLessThan(
      order.indexOf("external-readiness:verified"),
    );
    expect(order.indexOf("external-readiness:verified")).toBeLessThan(
      order.indexOf("ready"),
    );
  } finally {
    f.remove();
  }
});

it.each([
  "syntax",
  "wrong-main",
  "same-probe",
  "zero-probe",
  "string-probe",
  "extra",
  "oversize",
])(
  "rejects invalid external PTY receipt before owner/query admission: %s",
  async (control) => {
    const f = receiptFile();
    const receipt: Record<string, unknown> = { mainPid: 123, probePid: 456 };
    if (control === "wrong-main") receipt.mainPid = 124;
    if (control === "same-probe") receipt.probePid = 123;
    if (control === "zero-probe") receipt.probePid = 0;
    if (control === "string-probe") receipt.probePid = "456";
    if (control === "extra") receipt.extra = true;
    const bytes =
      control === "syntax"
        ? "{bad"
        : control === "oversize"
          ? " ".repeat(4097)
          : JSON.stringify(receipt);
    const verifyMain = vi.fn(async () => undefined);
    const ready = vi.fn(async () => true);
    try {
      writeFileSync(f.file, bytes);
      await expect(
        admitOrdinaryReadiness({
          file: f.file,
          expectedMainPid: 123,
          verifyMain,
          ready,
          nativeExited: () => false,
          record: () => undefined,
        }),
      ).rejects.toThrow();
      expect(verifyMain).not.toHaveBeenCalled();
      expect(ready).not.toHaveBeenCalled();
    } finally {
      f.remove();
    }
  },
);

it("rejects native exit and owner identity failure without querying renderer readiness", async () => {
  const f = receiptFile();
  const ready = vi.fn(async () => true);
  const identityFailure = Error("wrong birth/executable");
  const verifyMain = vi.fn(async () => {
    throw identityFailure;
  });
  try {
    writeFileSync(f.file, f.bytes);
    await expect(
      admitOrdinaryReadiness({
        file: f.file,
        expectedMainPid: 123,
        verifyMain,
        ready,
        nativeExited: () => true,
        record: () => undefined,
      }),
    ).rejects.toThrow("native exit");
    expect(verifyMain).not.toHaveBeenCalled();
    await expect(
      admitOrdinaryReadiness({
        file: f.file,
        expectedMainPid: 123,
        verifyMain,
        ready,
        nativeExited: () => false,
        record: () => undefined,
      }),
    ).rejects.toBe(identityFailure);
    expect(ready).not.toHaveBeenCalled();
    expect(() =>
      parseOrdinaryReadiness(Buffer.from('{"mainPid":0,"probePid":1}'), 0),
    ).toThrow();
  } finally {
    f.remove();
  }
});

it("shares the original startup bound rather than granting a fresh CDP allowance", async () => {
  const f = receiptFile();
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const ready = vi.fn(async () => true);
  try {
    writeFileSync(f.file, f.bytes);
    await expect(
      admitOrdinaryReadiness({
        file: f.file,
        expectedMainPid: 123,
        verifyMain: async () => {
          now = ordinaryStartupMs + 1;
        },
        ready,
        nativeExited: () => false,
        record: () => undefined,
      }),
    ).rejects.toThrow("deadline");
    expect(ready).not.toHaveBeenCalled();
  } finally {
    f.remove();
  }
});
