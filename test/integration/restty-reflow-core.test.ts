import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

type Core = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_resize(handle: number, cols: number, rows: number): number;
  restty_render_update(handle: number): number;
  restty_set_pixel_size(handle: number, width: number, height: number): number;
  restty_kitty_placement_count(handle: number): number;
  restty_kitty_placements_ptr(handle: number): number;
  restty_kitty_placement_stride(): number;
  restty_cell_codepoints_ptr(handle: number): number;
  restty_active_cursor_x(handle: number): number;
  restty_active_cursor_y(handle: number): number;
  restty_scrollbar_total(handle: number): number;
  restty_scrollbar_offset(handle: number): number;
  restty_scrollbar_len(handle: number): number;
  restty_scroll_viewport(handle: number, delta: number): number;
};

async function terminal(cols: number, rows: number, maxBytes = 10_000_000) {
  const bytes = Uint8Array.from(
    await readFile(
      new URL("../../assets/restty/omxterm-restty-core.wasm", import.meta.url),
    ),
  );
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: { now_ms: () => performance.now(), log: () => {} },
  });
  const core = instance.exports as Core;
  const handle = core.restty_create(cols, rows, maxBytes);
  expect(handle).not.toBe(0);
  expect(core.restty_set_pixel_size(handle, cols * 10, rows * 20)).toBe(0);
  return {
    write(text: string) {
      const bytes = new TextEncoder().encode(text);
      const pointer = core.restty_alloc(bytes.length);
      try {
        new Uint8Array(core.memory.buffer, pointer, bytes.length).set(bytes);
        expect(core.restty_write(handle, pointer, bytes.length)).toBe(0);
      } finally {
        core.restty_free(pointer, bytes.length);
      }
    },
    resize(nextCols: number, nextRows = rows) {
      expect(core.restty_resize(handle, nextCols, nextRows)).toBe(0);
      cols = nextCols;
      rows = nextRows;
    },
    snapshot() {
      expect(core.restty_render_update(handle)).toBe(0);
      const cells = [
        ...new Uint32Array(
          core.memory.buffer,
          core.restty_cell_codepoints_ptr(handle),
          cols * rows,
        ),
      ];
      return {
        text: Array.from({ length: rows }, (_, y) =>
          cells
            .slice(y * cols, (y + 1) * cols)
            .map((cp) => (cp ? String.fromCodePoint(cp) : "."))
            .join(""),
        ),
        cursor: [
          core.restty_active_cursor_x(handle),
          core.restty_active_cursor_y(handle),
        ],
        total: core.restty_scrollbar_total(handle),
        offset: core.restty_scrollbar_offset(handle),
        length: core.restty_scrollbar_len(handle),
      };
    },
    scroll(delta: number) {
      expect(core.restty_scroll_viewport(handle, delta)).toBe(0);
    },
    placements() {
      expect(core.restty_render_update(handle)).toBe(0);
      const view = new DataView(core.memory.buffer);
      const pointer = core.restty_kitty_placements_ptr(handle);
      return Array.from(
        { length: core.restty_kitty_placement_count(handle) },
        (_, i) => {
          const offset = pointer + i * core.restty_kitty_placement_stride();
          return [
            view.getInt32(offset + 24, true),
            view.getInt32(offset + 28, true),
          ];
        },
      );
    },
    destroy() {
      core.restty_destroy(handle);
    },
  };
}

it("keeps wrapping history above a cleared active screen on width refit", async () => {
  const t = await terminal(5, 3);
  try {
    t.write("hhhhh\r\n".repeat(3) + "\u001b[2J\u001b[H@\u001b[H");
    expect(t.snapshot()).toEqual({
      text: ["@....", ".....", "....."],
      cursor: [0, 0],
      total: 4,
      offset: 1,
      length: 3,
    });
    t.resize(4);
    expect(t.snapshot()).toEqual({
      text: ["@...", "....", "...."],
      cursor: [0, 0],
      total: 5,
      offset: 2,
      length: 3,
    });
  } finally {
    t.destroy();
  }
});

const image = "\u001b_Ga=T,f=32,s=1,v=1,c=1,r=1,q=2;AP8A/w==\u001b\\";

it("retains a blank image anchor after a full-width predecessor and deferred hard rows", async () => {
  const t = await terminal(5, 4);
  try {
    t.write("hhhh\r\n\u001b[3;2H@\u001b[3;3H" + image);
    expect(t.placements()).toEqual([[2, 2]]);
    t.resize(4);
    expect(t.placements()).toEqual([[2, 2]]);
  } finally {
    t.destroy();
  }
});

it.each([
  {
    label: "nonwrapping history",
    line: "hhhh",
    clear: false,
    maxBytes: 10_000_000,
  },
  {
    label: "cleared history",
    line: "hhhhh",
    clear: true,
    maxBytes: 10_000_000,
  },
  { label: "disabled history", line: "hhhhh", clear: false, maxBytes: 0 },
])(
  "preserves the cleared screen with $label through shrink and restore",
  async ({ line, clear, maxBytes }) => {
    const t = await terminal(5, 3, maxBytes);
    try {
      t.write(
        (line + "\r\n").repeat(3) +
          "\u001b[2J\u001b[H" +
          (clear ? "\u001b[3J" : "") +
          "@\u001b[H",
      );
      t.resize(4);
      expect(t.snapshot().text).toEqual(["@...", "....", "...."]);
      expect(t.snapshot().cursor).toEqual([0, 0]);
      t.resize(5);
      expect(t.snapshot().text).toEqual(["@....", ".....", "....."]);
      expect(t.snapshot().cursor).toEqual([0, 0]);
      if (maxBytes === 0 || clear) expect(t.snapshot().total).toBe(3);
    } finally {
      t.destroy();
    }
  },
);

it("retains history and a deliberately scrolled viewport across width refits", async () => {
  const t = await terminal(5, 3);
  try {
    t.write("hhhhh\r\n".repeat(3) + "\u001b[2J\u001b[H@\u001b[H");
    t.scroll(-1);
    expect(t.snapshot().text).toEqual(["hhhhh", "@....", "....."]);
    t.resize(4);
    expect(t.snapshot()).toEqual({
      text: ["hhhh", "h...", "@..."],
      cursor: [0, 0],
      total: 5,
      offset: 0,
      length: 3,
    });
    t.scroll(100);
    expect(t.snapshot().text).toEqual(["@...", "....", "...."]);
    t.resize(5);
    expect(t.snapshot()).toEqual({
      text: ["@....", ".....", "....."],
      cursor: [0, 0],
      total: 4,
      offset: 1,
      length: 3,
    });
  } finally {
    t.destroy();
  }
});

it.each([3, 4])(
  "allows genuine active text wrapping with %i destination rows",
  async (rows) => {
    const t = await terminal(5, 4);
    try {
      t.write("abcde\r\n@");
      t.resize(4, rows);
      expect(t.snapshot().text).toEqual([
        "abcd",
        "e...",
        "@...",
        ...(rows === 4 ? ["...."] : []),
      ]);
      expect(t.snapshot().cursor).toEqual([1, 2]);
      t.resize(5, 4);
      expect(t.snapshot().text).toEqual(["abcde", "@....", ".....", "....."]);
      expect(t.snapshot().cursor).toEqual([1, 1]);
    } finally {
      t.destroy();
    }
  },
);

it("clips a cursor pushed above the active area during mixed shrinking", async () => {
  const t = await terminal(5, 4);
  try {
    t.write("ABCDE\r\nFGHIJ\r\nKLMNO\r\nPQRS\u001b[H");
    t.resize(4, 2);
    expect(t.snapshot()).toEqual({
      text: ["O...", "PQRS"],
      cursor: [0, 0],
      total: 7,
      offset: 5,
      length: 2,
    });
  } finally {
    t.destroy();
  }
});

it.each([
  {
    label: "active predecessor, blank anchor",
    history: false,
    anchor: "",
    maxBytes: 10_000_000,
  },
  {
    label: "history predecessor, blank anchor",
    history: true,
    anchor: "",
    maxBytes: 10_000_000,
  },
  {
    label: "active predecessor, text anchor",
    history: false,
    anchor: "#",
    maxBytes: 10_000_000,
  },
  {
    label: "history predecessor, text anchor",
    history: true,
    anchor: "#",
    maxBytes: 10_000_000,
  },
  { label: "no-history blank anchor", history: false, anchor: "", maxBytes: 0 },
])(
  "preserves pin coordinates with $label",
  async ({ history, anchor, maxBytes }) => {
    const t = await terminal(5, 4, maxBytes);
    try {
      t.write(
        history ? "hhhh\r\n".repeat(4) + "\u001b[2J\u001b[H" : "hhhh\r\n",
      );
      t.write("\u001b[3;2H@" + anchor + "\u001b[3;3H" + image);
      expect(t.placements()).toEqual([[2, 2]]);
      t.resize(4);
      expect(t.placements()).toEqual([[2, 2]]);
      expect(t.snapshot().text[2]).toBe(anchor ? ".@#." : ".@..");
      t.resize(5);
      expect(t.placements()).toEqual([[2, 2]]);
      if (maxBytes === 0) expect(t.snapshot().total).toBe(4);
    } finally {
      t.destroy();
    }
  },
);

it("clips a blank anchor to the new width while preserving genuine predecessor wrapping", async () => {
  const t = await terminal(5, 5);
  try {
    t.write("hhhh\r\n\u001b[3;2H@\u001b[3;5H" + image);
    expect(t.placements()).toEqual([[4, 2]]);
    t.resize(3);
    expect(t.placements()).toEqual([[2, 3]]);
    expect(t.snapshot().text.slice(0, 4)).toEqual(["hhh", "h..", "...", ".@."]);
  } finally {
    t.destroy();
  }
});

it.each([
  { cols: 8, text: "abcdefghi", target: [2, 2], label: "pending soft wrap" },
  {
    cols: 5,
    text: "abcdef",
    target: [3, 1],
    label: "partly occupied continuation",
  },
])(
  "remaps blank pins in a $label using its actual destination column",
  async ({ cols, text, target }) => {
    const t = await terminal(cols, 5);
    try {
      t.write(text + "\u001b[2;3H" + image);
      expect(t.placements()).toEqual([[2, 1]]);
      t.resize(4);
      expect(t.placements()).toEqual([target]);
    } finally {
      t.destroy();
    }
  },
);

it("keeps independent blank image pins and their deletion ownership through refit", async () => {
  const t = await terminal(5, 4);
  try {
    const first = image.replace("q=2", "q=2,i=1");
    const second = image.replace("q=2", "q=2,i=2");
    t.write("hhhh\r\n\u001b[3;1H@\u001b[3;2H" + first + "\u001b[3;3H" + second);
    expect(t.placements()).toEqual([
      [1, 2],
      [2, 2],
    ]);
    t.resize(4);
    expect(t.placements()).toEqual([
      [1, 2],
      [2, 2],
    ]);
    t.write("\u001b_Ga=d,d=I,i=1,q=2\u001b\\");
    expect(t.placements()).toEqual([[2, 2]]);
    t.write("\u001bc");
    expect(t.placements()).toEqual([]);
  } finally {
    t.destroy();
  }
});
