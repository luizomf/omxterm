import { runInNewContext } from "node:vm";
import { loadResttyWasm } from "restty/internal";
import { afterEach, describe, expect, it } from "vitest";
import {
  cprCoreFixture,
  preparedCprRuntime,
  runtimeSection,
} from "../fixtures/restty-cpr-core-probe";

type Core = Awaited<ReturnType<typeof loadResttyWasm>> & {
  exports: Record<string, (...args: number[]) => number>;
};

const handles: Array<{ core: Core; handle: number }> = [];

// The prepared runtime's own reader: only the getters it closes over are
// supplied here.
const reader = (core: Core, handle: number) =>
  runInNewContext(
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

async function terminal(cols: number, rows: number) {
  const core = (await loadResttyWasm()) as Core;
  const handle = core.create(cols, rows, 1_000_000);
  handles.push({ core, handle });
  const screen = reader(core, handle);
  const read = () => screen() ?? "<no screen>";
  return {
    write: (text: string) => core.write(handle, text),
    scroll: (delta: number) => core.scrollViewport(handle, delta),
    offset: () => core.exports.restty_scrollbar_offset!(handle),
    read,
  };
}

const numbered = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index}`).join("\r\n");

afterEach(() => {
  for (const { core, handle } of handles.splice(0)) core.destroy(handle);
});

describe("the screen read", () => {
  it("has no screen to answer before the core is ready", async () => {
    const core = (await loadResttyWasm()) as Core;
    expect(reader(core, 0)()).toBeNull();
  });

  it("answers the active screen while the view is scrolled into history", async () => {
    const t = await terminal(10, 4);
    t.write(numbered(20));
    const screen = t.read();
    expect(screen).toBe("line 16\nline 17\nline 18\nline 19");
    t.scroll(-7);
    const scrolled = t.offset();
    expect(t.read()).toBe(screen);
    expect(t.offset()).toBe(scrolled);
    // Output while scrolled up still reads as the screen, not the view.
    t.write("\r\nmore");
    expect(t.read()).toBe("line 17\nline 18\nline 19\nmore");
    expect(t.offset()).toBe(scrolled);
  });

  it("reads only the alternate screen while it is open", async () => {
    const t = await terminal(10, 4);
    t.write(numbered(20));
    t.write("\u001b[?1049h\u001b[Hfull   \r\n\r\nscreen");
    expect(t.read()).toBe("full\n\nscreen\n");
    t.write("\u001b[?1049l");
    expect(t.read()).toBe("line 16\nline 17\nline 18\nline 19");
  });

  it("keeps one line per row: blank rows, wrapped lines and wide characters", async () => {
    const t = await terminal(10, 4);
    t.write("one");
    expect(t.read()).toBe("one\n\n\n");
    t.write("\r\nabcdefghij klm");
    expect(t.read()).toBe("one\nabcdefghij\n klm\n");
    // 日 doesn't fit in the last column, so it wraps and leaves that cell
    // empty; the row still reads once.
    t.write("\r\nabcdefghi日本 x");
    expect(t.read().split("\n")).toEqual([
      "abcdefghij",
      " klm",
      "abcdefghi",
      "日本 x",
    ]);
    // A wide character that fills the last two columns stays on its row.
    t.write("\r\nabcdefgh日x");
    expect(t.read().split("\n")).toEqual([
      "abcdefghi",
      "日本 x",
      "abcdefgh日",
      "x",
    ]);
  });

  // A match wait counts copies per screen by this flag (ADR 0052), so it
  // must follow every switch the core makes, through the production output
  // path into the real core.
  it.each([1049, 47, 1047])(
    "says the alternate screen is open while CSI ?%ih is in effect",
    async (mode) => {
      const t = await cprCoreFixture(10, 4);
      try {
        t.write("main");
        expect(t.altScreen()).toBe(false);
        t.write(`\u001b[?${mode}h\u001b[Hfull`);
        expect(t.altScreen()).toBe(true);
        expect(t.text()).toBe("full\n\n\n");
        t.write(`\u001b[?${mode}l`);
        expect(t.altScreen()).toBe(false);
        expect(t.text()).toBe("main\n\n\n");
      } finally {
        t.dispose();
      }
    },
  );
});
