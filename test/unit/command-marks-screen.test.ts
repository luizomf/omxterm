import { runInNewContext } from "node:vm";
import { loadResttyWasm } from "restty/internal";
import { afterEach, expect, it } from "vitest";
import {
  preparedCprRuntime,
  runtimeSection,
} from "../fixtures/restty-cpr-core-probe";

// The shell integration guide's lines keep the screen (ADR 0054).
// The core clears a marked prompt on resize, for the shell to redraw, unless
// the mark says not to (`redraw=0`), as the guide's lines do.
type Core = Awaited<ReturnType<typeof loadResttyWasm>> & {
  exports: Record<string, (...args: number[]) => number>;
  resize(handle: number, cols: number, rows: number): void;
};

const handles: Array<{ core: Core; handle: number }> = [];
afterEach(() => {
  for (const { core, handle } of handles.splice(0)) core.destroy(handle);
});

async function screenAfterResize(output: string, resize = true) {
  const core = (await loadResttyWasm()) as Core;
  const handle = core.create(20, 6, 1_000_000);
  handles.push({ core, handle });
  const read = runInNewContext(
    runtimeSection(
      preparedCprRuntime(),
      "  const getScreenText = () => {",
      "  const selectWordAtClientPoint = (",
    ) + "\ngetScreenText",
    {
      getWasm: () => core,
      getWasmExports: () => core.exports,
      getWasmHandle: () => handle,
    },
  ) as () => string | null;
  core.write(handle, output);
  if (resize) core.resize(handle, 30, 6);
  return read();
}

const unmarked = (output: string) =>
  output.replace(/\u001b\]133;[^\u0007]*\u0007/gu, "");

it.each([
  [
    "zsh",
    "\x1b]133;A;redraw=0\x07% true\r\n\x1b]133;C\x07ok\r\n\x1b]133;D;0\x07\x1b]133;A;redraw=0\x07% ",
  ],
  [
    "bash",
    "\x1b]133;A;redraw=0\x07$ true\r\n\x1b]133;C\x07ok\r\n\x1b]133;D;0\x07\x1b]133;A;redraw=0\x07$ ls -",
  ],
])(
  "keeps a %s prompt on screen through a resize, as without marks",
  async (_shell, output) => {
    const marked = await screenAfterResize(output);
    expect(marked).toBe(await screenAfterResize(unmarked(output)));
    expect(marked?.split("\n")[2]).toMatch(/^[%$]/u);
  },
);

it("starts a prompt on its own row after output with no final newline", async () => {
  // `printf foo` leaves the cursor after `foo`. Unmarked, bash draws its
  // prompt there; the prompt mark starts it on a new row, through a resize too.
  const output =
    "\x1b]133;A;redraw=0\x07$ printf foo\r\n\x1b]133;C\x07foo\x1b]133;D;0\x07\x1b]133;A;redraw=0\x07$ ";
  expect(await screenAfterResize(unmarked(output), false)).toBe(
    "$ printf foo\nfoo$\n\n\n\n",
  );
  for (const resize of [false, true])
    expect(await screenAfterResize(output, resize)).toBe(
      "$ printf foo\nfoo\n$\n\n\n",
    );
});
