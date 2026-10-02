import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { exerciseResttyLocalImageLinks } from "./restty-local-image-links";
import { readLocalImageCoreCells } from "./restty-local-image-core-probe";
import {
  measureLocalImageRoot,
  type LocalImageCoreCells,
} from "./restty-local-image-root";
import { localImageFixturePaths } from "./restty-local-image-paths";
import {
  verifyLocalImageReference,
  type LocalImageLinkEvidence,
} from "./restty-local-image-reference";
import { createNativeHostPng } from "./native-host-png";

export function assertLocalImageRefitEvidence(
  evidence: readonly LocalImageLinkEvidence[],
): void {
  const wrapped = evidence[2]!;
  assert.equal(wrapped.grids!.length, 2);
  assert.ok(wrapped.grids![0]!.cols < wrapped.grids![1]!.cols);
  for (const [index, control] of [
    "wide-only root boundary",
    "combining-only root boundary",
  ].entries()) {
    const entry = evidence[8 + index]!;
    assert.equal(entry.control, control);
    assert.equal(entry.activations, 12);
    assert.equal(entry.grids!.length, 3);
    assert.ok(entry.grids![1]!.cols < entry.grids![0]!.cols);
    assert.deepEqual(entry.grids![2], entry.grids![0]);
  }
}

export async function exerciseUnicodeLocalImageRoots(
  options: Parameters<typeof exerciseResttyLocalImageLinks>[0],
  refit: (
    phase: "base" | "shrunk" | "wide",
  ) => Promise<{ cols: number; rows: number }>,
  deviceCellSize: readonly [number, number],
): Promise<LocalImageLinkEvidence[]> {
  const results: LocalImageLinkEvidence[] = [];
  const { window, deliverOutput, waitFor } = options;
  for (const [leaf, control] of [
    ["漢", "wide-only root boundary"],
    ["e\u0301", "combining-only root boundary"],
  ] as const) {
    const size = options.resizes.at(-1)!;
    const root = path.join(options.root, leaf);
    const rootPrefix = path.join(root, "x").slice(0, -1);
    const rootColumns = await measureLocalImageRoot({
      ...options,
      rootPrefix,
      size,
      readCells: () => readLocalImageCoreCells(window),
    });
    const reference = localImageFixturePaths(
      root,
      size.cols,
      rootColumns,
    ).boundaryPath;
    await mkdir(path.dirname(reference), { recursive: true });
    await writeFile(reference, createNativeHostPng(2, 2));
    deliverOutput(`\u001b[3J\u001b[2J\u001b[H${reference}`);
    // Independently read the actual physical cell, not the CPR hint, source
    // length or the builder's prediction. The filename space ends row1 and
    // actual "photo" begins row2; root errors must not cancel each other.
    let cells: LocalImageCoreCells | null = null;
    await waitFor(async () => {
      cells = await readLocalImageCoreCells(window);
      return cells?.text === reference;
    }, `${control} complete reference in actual core cells`);
    assert.ok(cells);
    assert.equal(
      (cells as LocalImageCoreCells).codepoints[2 * size.cols - 1],
      32,
      `${control} actual row-end space`,
    );
    assert.equal(
      (cells as LocalImageCoreCells).codepoints[2 * size.cols],
      112,
      `${control} actual next-row photo`,
    );
    assert.equal(
      (cells as LocalImageCoreCells).codepoints[2 * size.cols + 1],
      104,
      `${control} actual next-row photo`,
    );
    const verify = () =>
      verifyLocalImageReference({
        ...options,
        control,
        reference,
        name: path.basename(reference),
        prefixColumns: 0,
        rootCellDelta: rootColumns - rootPrefix.length,
        deviceCellSize,
        size: options.resizes.at(-1)!,
      });
    const evidence = await verify();
    for (const phase of ["shrunk", "base"] as const) {
      await refit(phase);
      const reflow = await verify();
      evidence.activations += reflow.activations;
      evidence.grids!.push(...reflow.grids!);
    }
    results.push(evidence);
  }
  return results;
}
