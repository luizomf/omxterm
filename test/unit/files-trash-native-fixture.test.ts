import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  lstat,
  readdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTrashFixture } from "../fixtures/files-trash-native.mjs";

// The macOS-only fixture deliberately uses POSIX names invalid on Windows.
describe.skipIf(process.platform === "win32")(
  "native trash fixture ownership",
  () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(path.join(os.tmpdir(), "trash-fixture-test-"));
    });
    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const options = () => ({
      evidence: path.join(root, "evidence"),
      parent: root,
      otherParent: undefined,
    });

    it("preserves the pre-dispatch identity and source on an unknown outcome", async () => {
      const native = {
        trash: vi.fn(async () => {
          throw new Error("private native error");
        }),
        moveNoReplace: vi.fn(),
      };
      const result = await runTrashFixture(native, options());
      expect(result).toMatchObject({ outcome: "failed", cleanup: "preserved" });
      expect(native.trash).toHaveBeenCalledTimes(1);
      expect(native.moveNoReplace).not.toHaveBeenCalled();
      const saved = JSON.parse(
        await readFile(path.join(root, "evidence/receipt.json"), "utf8"),
      ) as {
        pending: { source: string; identity: { inode: number } };
        entries: unknown[];
      };
      expect(saved.pending.identity.inode).toBe(
        (await lstat(saved.pending.source)).ino,
      );
      expect(await readFile(saved.pending.source, "utf8")).toBe(
        "recoverable-file",
      );
      expect(JSON.stringify(saved)).not.toContain("private native error");
      expect((await lstat(path.join(root, "evidence"))).mode & 0o777).toBe(
        0o700,
      );
      expect(
        (await lstat(path.join(root, "evidence/receipt.json"))).mode & 0o777,
      ).toBe(0o600);
    });

    it("does not treat source disappearance or an unrelated returned path as recovery proof", async () => {
      const actual = path.join(root, "actual-trash");
      const unrelated = path.join(root, "unrelated");
      await writeFile(unrelated, "recoverable-file");
      const native = {
        trash: vi.fn(async (source: string) => {
          await rename(source, actual);
          return unrelated;
        }),
        moveNoReplace: vi.fn(),
      };
      const result = await runTrashFixture(native, options());
      expect(result).toMatchObject({ outcome: "failed", cleanup: "preserved" });
      expect(native.moveNoReplace).not.toHaveBeenCalled();
      expect(await readFile(unrelated, "utf8")).toBe("recoverable-file");
      expect(await readFile(actual, "utf8")).toBe("recoverable-file");
      const saved = JSON.parse(
        await readFile(path.join(root, "evidence/receipt.json"), "utf8"),
      ) as { entries: { verified: boolean; result: string }[] };
      expect(saved.entries[0]).toMatchObject({
        verified: false,
        result: unrelated,
      });
    });

    it("retains already verified recoverable entries if a later operation fails", async () => {
      const returned = path.join(root, "owned-trash");
      const native = {
        trash: vi
          .fn<(source: string) => Promise<string>>()
          .mockImplementationOnce(async (source) => {
            await rename(source, returned);
            return returned;
          })
          .mockRejectedValueOnce(new Error("failed")),
        moveNoReplace: vi.fn(),
      };
      const result = await runTrashFixture(native, options());
      expect(result).toMatchObject({
        outcome: "failed",
        cleanup: "preserved",
        checks: ["literal-file-recoverable"],
      });
      expect(await readFile(returned, "utf8")).toBe("recoverable-file");
      expect(native.moveNoReplace).not.toHaveBeenCalled();
      const saved = JSON.parse(
        await readFile(path.join(root, "evidence/receipt.json"), "utf8"),
      ) as { entries: { verified: boolean; restored: boolean }[] };
      expect(saved.entries[0]).toMatchObject({
        verified: true,
        restored: false,
      });
    });

    it.each([false, true])(
      "joins exact owned restoration; restore failure=%s stays failed",
      async (refuseRestore) => {
        // A fake Trash inside the test sandbox, never the user's OS Trash.
        const fakeTrash = path.join(root, "fake-trash");
        await mkdir(fakeTrash);
        let pending = 0;
        let next = 0;
        const error = (code: string) =>
          Object.assign(new Error(code), { code });
        function queue<T>(work: () => Promise<T>) {
          if (pending === 32) throw error("EBUSY");
          pending++;
          return Promise.resolve()
            .then(work)
            .finally(() => {
              pending--;
            });
        }
        const native = {
          trash(target: string, ...extra: string[]): Promise<string> {
            if (
              extra.length ||
              !target.startsWith("/") ||
              target.includes("\0") ||
              Buffer.byteLength(target) > 16384 ||
              target
                .slice(1)
                .split("/")
                .some((part) => !part || part === "." || part === "..")
            )
              throw error("EINVAL");
            return queue(async () => {
              try {
                await lstat(target);
                if (!((await lstat(path.dirname(target))).mode & 0o200))
                  throw error("EIO");
                const result = path.join(fakeTrash, String(++next));
                await rename(target, result);
                return result;
              } catch {
                throw error("EIO");
              }
            });
          },
          moveNoReplace(source: string, destination: string): Promise<void> {
            return queue(async () => {
              if (refuseRestore && path.dirname(source) === fakeTrash)
                throw error("EIO");
              await rename(source, destination);
            });
          },
        };
        const result = await runTrashFixture(native, options());
        expect(pending).toBe(0);
        expect(result.checks).toContain(
          "shared-32-operation-bound-and-release",
        );
        if (refuseRestore) {
          expect(result).toMatchObject({
            outcome: "failed",
            cleanup: "restoring-verified-entries",
          });
          expect((await readdir(fakeTrash)).length).toBe(8);
        } else {
          expect(result).toMatchObject({
            outcome: "passed",
            cleanup: "completed",
          });
          expect(await readdir(fakeTrash)).toEqual([]);
          expect(
            (await readdir(root)).filter((name) =>
              name.startsWith("omx-trash-native-"),
            ),
          ).toEqual([]);
        }
      },
    );

    it("refuses an existing evidence directory without executing native operations", async () => {
      await mkdir(path.join(root, "evidence"));
      await writeFile(path.join(root, "evidence/receipt.json"), "original");
      const native = { trash: vi.fn(), moveNoReplace: vi.fn() };
      await expect(runTrashFixture(native, options())).rejects.toMatchObject({
        code: "EEXIST",
      });
      expect(
        await readFile(path.join(root, "evidence/receipt.json"), "utf8"),
      ).toBe("original");
      expect(native.trash).not.toHaveBeenCalled();
    });
  },
);
