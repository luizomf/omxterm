import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { expect, it, vi } from "vitest";

it("selects the canvas below pane decoration and still requires real input ownership", async () => {
  // Execute the actual shared caller; model native pointer delivery only at the
  // canvas hit region, rather than granting focus for arbitrary pane padding.
  const source = await readFile(
    "test/fixtures/restoration-production-support.ts",
    "utf8",
  );
  const begin = source.indexOf("export async function selectPane(");
  const end = source.indexOf("export async function input(", begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const canvas = {
    getBoundingClientRect: () => ({ x: 100, y: 72, width: 400, height: 200 }),
  };
  const surface = {
    getBoundingClientRect: () => ({ x: 100, y: 50, width: 400, height: 222 }),
    querySelector: () => canvas,
  };
  const tab = { querySelectorAll: () => [surface] };
  const document = {
    activeElement: undefined as { closest(): typeof surface } | undefined,
    querySelectorAll: (selector: string) =>
      selector.startsWith("#tab-strip") ? [{ click() {} }] : [tab],
    elementFromPoint: (x: number, y: number) =>
      x >= 100 && x < 500 && y >= 72 && y < 272 ? canvas : surface,
  };
  let deliversPointer = true;
  const core = {
    executeJavaScript: async (code: string) =>
      runInNewContext(code, { document }) as unknown,
    sendInputEvent: vi.fn((event: { type: string; x: number; y: number }) => {
      if (
        deliversPointer &&
        event.type === "mouseUp" &&
        document.elementFromPoint(event.x, event.y) === canvas
      )
        document.activeElement = { closest: () => surface };
    }),
  };
  const module = {
    exports: {} as {
      selectPane(window: unknown, tab: number, pane: number): Promise<void>;
    },
  };
  runInNewContext(
    transformSync(source.slice(begin, end), { loader: "ts", format: "cjs" })
      .code,
    {
      module,
      focus: vi.fn(),
      until: async (predicate: () => Promise<boolean>, label: string) => {
        expect(await predicate(), label).toBe(true);
      },
    },
  );
  await module.exports.selectPane({ webContents: core }, 0, 0);
  expect(core.sendInputEvent.mock.calls).toHaveLength(2);
  for (const [event] of core.sendInputEvent.mock.calls)
    expect(document.elementFromPoint(event.x, event.y)).toBe(canvas);
  document.activeElement = undefined;
  deliversPointer = false;
  await expect(
    module.exports.selectPane({ webContents: core }, 0, 0),
  ).rejects.toThrow("selected pane owns input");
});
