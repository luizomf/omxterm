import assert from "node:assert/strict";
import { waitFor } from "./window-chrome-exercise";

// macOS: the tab strip is the title row, beside the traffic lights (ADR 0058).
const SIDE = 84;
const ROW = 30;
const script = `(() => {
  const strip = document.querySelector('#tab-strip');
  const bounds = strip.getBoundingClientRect();
  const tabs = [...strip.querySelectorAll('button')];
  return {
    top: bounds.top,
    height: bounds.height,
    start: tabs[0].getBoundingClientRect().left,
    end: innerWidth - tabs.at(-1).getBoundingClientRect().right,
    inset: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--native-title-inset')),
    canvasHeight: document.querySelector('.terminal-surface:not([hidden]) canvas').getBoundingClientRect().height,
  };
})()`;
interface TitleRow {
  readonly top: number;
  readonly height: number;
  readonly start: number;
  readonly end: number;
  readonly inset: number;
  readonly canvasHeight: number;
}

// Starts with two tabs and a visible title bar; ends with the title bar hidden.
export async function exerciseSharedTitleRow(options: {
  readonly evaluate: <T>(script: string) => Promise<T>;
  readonly singleTabCanvasHeight: number;
  readonly toggleTitleBar: () => void;
  readonly rows: () => number;
}) {
  const read = () => options.evaluate<TitleRow>(script);
  const shared = await read();
  const rows = options.rows();
  // The second tab took the row the lights already had: no terminal moved.
  assert.equal(shared.canvasHeight, options.singleTabCanvasHeight);
  assert.equal(shared.top, 0);
  assert.equal(shared.height, ROW);
  // Both ends stay free: the lights' side, and a gutter to drag the window by.
  assert.equal(shared.start, SIDE);
  assert.equal(shared.end, SIDE);
  options.toggleTitleBar();
  await waitFor(
    async () => (await read()).inset === 0,
    "title removal with the strip showing",
  );
  // Without the lights the strip keeps its height and takes its usual sides.
  const plain = await read();
  assert.equal(plain.height, ROW);
  assert.equal(plain.canvasHeight, shared.canvasHeight);
  assert.ok(plain.start < SIDE && plain.end < SIDE);
  assert.equal(options.rows(), rows);
}
