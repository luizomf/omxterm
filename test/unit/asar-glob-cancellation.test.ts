import { createPackageWithOptions } from "@electron/asar";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("stops the ASAR fixture crawl after glob cancellation, including pending reads", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "asar-glob-cancellation-"));
  const input = path.join(root, "input");
  const archive = path.join(root, "cancelled.asar");
  const controller = new AbortController();
  const reason = new Error("synthetic fixture cancellation");
  const pending: (() => void)[] = [];
  let reads = 0;
  let firstRead!: () => void;
  const started = new Promise<void>((resolve) => {
    firstRead = resolve;
  });
  let operation: Promise<void> | undefined;
  const drain = () => {
    let deliver: (() => void) | undefined;
    while ((deliver = pending.shift())) deliver();
  };
  try {
    for (const directory of ["a/deep", "b/deep"]) {
      await mkdir(path.join(input, directory), { recursive: true });
      await writeFile(path.join(input, directory, "file.txt"), "fixture");
    }
    operation = createPackageWithOptions(input, archive, {
      globOptions: {
        // Keep path-scurry's injected filesystem on the crawl's Windows drive,
        // even when TEMP and the checkout are on different drives.
        cwd: input,
        signal: controller.signal,
        fs: {
          readdir(directory, options, callback) {
            reads++;
            const entries = readdirSync(directory, options);
            // Hold completion so the already-issued read arrives after abort.
            pending.push(() => {
              callback(null, entries);
            });
            if (reads === 1) {
              controller.abort(reason);
              firstRead();
            }
          },
        },
      },
    });
    // Observe rejection immediately, but do not create an unjoined assertion
    // promise while waiting for a hook that a broken fixture may never reach.
    const settled = operation.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(
      await Promise.race([
        started.then(() => "read"),
        settled.then(() => "settled-before-read"),
      ]),
      "ASAR must enter the injected read before settling",
    ).toBe("read");
    expect(reads).toBe(1);
    expect(controller.signal.aborted).toBe(true);
    expect(pending).toHaveLength(1);
    pending.shift()!();
    expect(await settled).toBe(reason);
    const readsAtRejection = reads;
    // Deliver every queued completion, including any incorrectly scheduled work.
    drain();
    expect({ readsAtRejection, readsAfterPendingCompletion: reads }).toEqual({
      readsAtRejection: 1,
      readsAfterPendingCompletion: 1,
    });
    await expect(stat(archive)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    drain();
    await Promise.allSettled([operation]);
    await rm(root, { recursive: true, force: true });
  }
});
