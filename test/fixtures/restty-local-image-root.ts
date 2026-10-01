import assert from "node:assert/strict";

export interface LocalImageCoreCells {
  readonly cols: number;
  readonly rows: number;
  readonly codepoints: readonly number[];
  readonly text: string;
}

export async function measureLocalImageRoot(options: {
  readonly rootPrefix: string;
  readonly deliverOutput: (data: string) => void;
  readonly size: { cols: number; rows: number };
  readonly readCells: () => Promise<LocalImageCoreCells | null>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  // The final ASCII sentinel occupies one real core cell even if the preceding
  // Unicode text wraps. CPR is unsuitable: OutputFilter answers it from a JS
  // UTF-16 hint before the text reaches Ghostty. No reply/split-write workaround.
  options.deliverOutput(`\u001b[3J\u001b[2J\u001b[H${options.rootPrefix}x`);
  let sentinel = -1;
  await options.waitFor(async () => {
    const cells = await options.readCells();
    if (
      !cells ||
      cells.cols !== options.size.cols ||
      cells.rows !== options.size.rows ||
      cells.text !== `${options.rootPrefix}x`
    )
      return false;
    sentinel = cells.codepoints.lastIndexOf(120);
    return sentinel >= 0;
  }, "local image root sentinel in actual Ghostty cells");
  assert.ok(
    sentinel < options.size.cols * (options.size.rows - 1),
    "fixture root must remain fully visible",
  );
  return sentinel;
}
