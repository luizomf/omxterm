import path from "node:path";
import { createInputHandler } from "restty/internal";
import { createHeadlessTerminal } from "restty/headless";
import { expect, it } from "vitest";
import { measureLocalImageRoot } from "../fixtures/restty-local-image-root";
import { localImageFixturePaths } from "../fixtures/restty-local-image-paths";
import { snapshotLocalImageCoreCells } from "../fixtures/restty-local-image-core-probe";

for (const [paths, root, expectedColumns] of [
  [path.posix, "/tmp/漢", 8],
  [path.posix, "/tmp/e\u0301", 7],
  [path.posix, "/tmp/漢e\u0301", 9],
  [path.win32, "C:\\tmp\\漢", 10],
  [path.win32, "C:\\tmp\\e\u0301", 9],
  [path.win32, "C:/tmp/漢/", 10],
  [path.win32, "C:/tmp/e\u0301/", 9],
  [path.posix, "/abcdefghijklmnopq", 19],
] as const) {
  it(`measures ${root} through the actual output filter/core and places the filename space in the last physical column`, async () => {
    const core = await createHeadlessTerminal({ cols: 20, rows: 10 });
    const replies: string[] = [];
    let cols = 20;
    const handler = createInputHandler({
      sendReply: (data) => replies.push(data),
      getCursorPosition: () => {
        const cursor = core.snapshot()!.cursor!;
        return { row: cursor.row + 1, col: cursor.col + 1 };
      },
      getWindowMetrics: () => ({
        cols,
        rows: 10,
        widthPx: cols * 10,
        heightPx: 200,
        cellWidthPx: 10,
        cellHeightPx: 20,
      }),
    });
    const deliverOutput = (data: string) =>
      core.write(handler.filterOutput(data));
    try {
      for (cols of [20, 40, 80, 132, 256, 430, 512]) {
        core.resize(cols, 10);
        const columns = await measureLocalImageRoot({
          rootPrefix: paths.join(root, "x").slice(0, -1),
          deliverOutput,
          size: { cols, rows: 10 },
          readCells: async () =>
            snapshotLocalImageCoreCells(core.wasm, core.handle),
          async waitFor(predicate) {
            expect(await predicate()).toBe(true);
          },
        });
        expect(columns).toBe(expectedColumns);
        expect(replies).toEqual([]);
        const reference = localImageFixturePaths(
          root,
          cols,
          columns,
          paths,
        ).boundaryPath;
        deliverOutput(`\u001b[3J\u001b[2J\u001b[H${reference}`);
        const cells = core.snapshot()!.codepoints!;
        // Independent cell oracle, not source length, builder arithmetic or CPR:
        // literal space ends row1 and the actual photo text starts row2.
        expect(cells[2 * cols - 1]).toBe(32);
        expect(cells[2 * cols]).toBe(112);
        expect(cells[2 * cols + 1]).toBe(104);
      }
    } finally {
      core.dispose();
    }
  });
}
