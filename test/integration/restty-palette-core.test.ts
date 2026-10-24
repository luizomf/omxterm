import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

type Core = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_set_palette(handle: number, pointer: number, length: number): number;
  restty_reset_palette(handle: number): number;
  restty_set_default_colors(
    handle: number,
    fg: number,
    bg: number,
    cursor: number,
  ): number;
  restty_render_update(handle: number): number;
  restty_cell_fg_rgba_ptr(handle: number): number;
  restty_cell_bg_rgba_ptr(handle: number): number;
  restty_cursor_info_ptr(handle: number): number;
};

async function loadCore(): Promise<Core> {
  const bytes = Uint8Array.from(
    await readFile(
      new URL("../../assets/restty/omxterm-restty-core.wasm", import.meta.url),
    ),
  );
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: { now_ms: () => performance.now(), log: () => {} },
  });
  return instance.exports as Core;
}

function terminal(core: Core) {
  const handle = core.restty_create(40, 4, 10_000_000);
  expect(handle).not.toBe(0);
  function transfer(bytes: Uint8Array, action: (pointer: number) => number) {
    const pointer = core.restty_alloc(bytes.length);
    expect(pointer).not.toBe(0);
    try {
      new Uint8Array(core.memory.buffer, pointer, bytes.length).set(bytes);
      expect(action(pointer)).toBe(0);
    } finally {
      core.restty_free(pointer, bytes.length);
    }
  }
  function write(text: string, split = false) {
    for (const chunk of split ? [...text] : [text]) {
      const bytes = new TextEncoder().encode(chunk);
      transfer(bytes, (pointer) =>
        core.restty_write(handle, pointer, bytes.length),
      );
    }
  }
  return {
    write,
    palette(colors: readonly string[]) {
      if (!colors.length) {
        expect(core.restty_set_palette(handle, 0, 0)).toBe(0);
        return;
      }
      transfer(
        Uint8Array.from(
          colors.flatMap((color) => [
            Number.parseInt(color.slice(1, 3), 16),
            Number.parseInt(color.slice(3, 5), 16),
            Number.parseInt(color.slice(5, 7), 16),
          ]),
        ),
        (pointer) => core.restty_set_palette(handle, pointer, colors.length),
      );
    },
    defaults() {
      expect(
        core.restty_set_default_colors(handle, 0xf0f0ff, 0x102030, 0xabcdef),
      ).toBe(0);
    },
    reset() {
      expect(core.restty_reset_palette(handle)).toBe(0);
    },
    colors(indices = [...Array.from({ length: 16 }, (_, i) => i), 200]) {
      write(
        "\u001b[0m\u001b[H" +
          indices.map((i) => `\u001b[38;5;${i}mX`).join("") +
          "\u001b[0mX",
      );
      expect(core.restty_render_update(handle)).toBe(0);
      const cells = new Uint8Array(
        core.memory.buffer,
        core.restty_cell_fg_rgba_ptr(handle),
        (indices.length + 1) * 4,
      );
      return Array.from(
        { length: indices.length + 1 },
        (_, i) =>
          "#" +
          [...cells.slice(i * 4, i * 4 + 3)]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join(""),
      );
    },
    backgroundAndCursor() {
      expect(core.restty_render_update(handle)).toBe(0);
      return {
        background: [
          ...new Uint8Array(
            core.memory.buffer,
            core.restty_cell_bg_rgba_ptr(handle),
            4,
          ),
        ],
        cursor: [
          ...new Uint8Array(
            core.memory.buffer,
            core.restty_cursor_info_ptr(handle) + 8,
            4,
          ),
        ],
      };
    },
    dispose() {
      core.restty_destroy(handle);
    },
  };
}

// The bundled omtheme ANSI palette, independently specified in docs/omtheme.json.
const configured = [
  "#000000",
  "#ff80aa",
  "#00ffbf",
  "#ffd480",
  "#80aaff",
  "#e2a1f7",
  "#80d4ff",
  "#f0f0ff",
  "#505068",
  "#ff99bb",
  "#66ffd9",
  "#fee59a",
  "#99bbff",
  "#ebb4fd",
  "#99ddff",
  "#ffffff",
];
const live = [
  "#102030",
  "#132537",
  "#162a3e",
  "#192f45",
  "#1c344c",
  "#1f3953",
  "#223e5a",
  "#254361",
  "#284868",
  "#2b4d6f",
  "#2e5276",
  "#31577d",
  "#345c84",
  "#37618b",
  "#3a6692",
  "#3d6b99",
];
const overrides = "\u001b]4;2;#123456;4;#654321;200;#abcdef";

it("restores configured ANSI colors after full OSC 104", async () => {
  const term = terminal(await loadCore());
  try {
    term.palette(configured);
    expect(term.colors().slice(0, 16)).toEqual(configured);
    term.write("\u001b]104\u0007");
    expect(term.colors().slice(0, 16)).toEqual(configured);
  } finally {
    term.dispose();
  }
});

for (const [ending, terminator] of [
  ["BEL", "\u0007"],
  ["ST", "\u001b\\"],
] as const)
  for (const split of [false, true])
    for (const reload of [false, true])
      for (const indices of ["", ";2", ";2;4"])
        it(`restores ${reload ? "latest live" : "initial"} palette for OSC 104${indices} ${ending}, ${split ? "split writes" : "whole write"}`, async () => {
          const term = terminal(await loadCore());
          try {
            term.defaults();
            term.palette(configured);
            if (reload) {
              term.write(overrides + terminator, split);
              term.palette(live);
              // Live theme replaces supplied entries only, not extended overrides.
              expect(term.colors()).toEqual([...live, "#abcdef", "#f0f0ff"]);
            }
            const palette = reload ? live : configured;
            for (let repeat = 0; repeat < 2; repeat++) {
              term.write(overrides + terminator, split);
              term.write(`\u001b]104${indices}${terminator}`, split);
              const expected = [...palette];
              if (indices === ";2") expected[4] = "#654321";
              expect(term.colors()).toEqual([
                ...expected,
                indices ? "#abcdef" : "#ff00d7",
                "#f0f0ff",
              ]);
              expect(term.backgroundAndCursor()).toEqual({
                background: [16, 32, 48, 0],
                cursor: [171, 205, 239, 255],
              });
            }
          } finally {
            term.dispose();
          }
        });

for (const [name, control] of [
  ["none", ""],
  ["RIS", "\u001bc"],
  ["DECSTR", "\u001b[!p"],
])
  it(`preserves configured colors and OSC 4 overrides under ${name}`, async () => {
    const term = terminal(await loadCore());
    try {
      term.defaults();
      term.palette(configured);
      if (control) term.write(control);
      expect(term.colors()).toEqual([...configured, "#ff00d7", "#f0f0ff"]);
      term.write(overrides + "\u0007");
      if (control) term.write(control, true);
      const expected = [...configured];
      expected[2] = "#123456";
      expected[4] = "#654321";
      expect(term.colors()).toEqual([...expected, "#abcdef", "#f0f0ff"]);
      expect(term.backgroundAndCursor()).toEqual({
        background: [16, 32, 48, 0],
        cursor: [171, 205, 239, 255],
      });
    } finally {
      term.dispose();
    }
  });

it("keeps the configured baseline through RIS followed by OSC 104", async () => {
  const term = terminal(await loadCore());
  try {
    term.palette(configured);
    term.write(overrides + "\u0007\u001bc\u001b]104\u0007", true);
    expect(term.colors().slice(0, 17)).toEqual([...configured, "#ff00d7"]);
  } finally {
    term.dispose();
  }
});

it("changes only a supplied prefix without promoting unsupplied overrides to defaults", async () => {
  const term = terminal(await loadCore());
  try {
    term.palette(configured);
    term.write(overrides + "\u0007");
    term.palette([]);
    expect(term.colors([2, 4, 200]).slice(0, 3)).toEqual([
      "#123456",
      "#654321",
      "#abcdef",
    ]);
    term.palette(["#010203", "#040506", "#070809"]);
    expect(term.colors([0, 1, 2, 4, 200]).slice(0, 5)).toEqual([
      "#010203",
      "#040506",
      "#070809",
      "#654321",
      "#abcdef",
    ]);
    term.write("\u001b]104\u0007");
    expect(term.colors().slice(0, 17)).toEqual([
      "#010203",
      "#040506",
      "#070809",
      ...configured.slice(3),
      "#ff00d7",
    ]);
  } finally {
    term.dispose();
  }
});

it("caps configured input at 256 entries and retains an extended configured baseline", async () => {
  const core = await loadCore();
  expect(core.restty_set_palette(0, 0, 0)).toBe(1); // Validate handle even for no-op.
  const term = terminal(core);
  try {
    term.palette([...Array<string>(256).fill("#112233"), "#abcdef"]);
    term.palette(configured);
    term.write("\u001b]4;200;#abcdef;255;#654321\u0007\u001b]104\u0007");
    expect(term.colors([2, 200, 255]).slice(0, 3)).toEqual([
      "#00ffbf",
      "#112233",
      "#112233",
    ]);
    term.write(overrides + "\u0007");
    term.reset(); // The public ABI reset also means configured baseline.
    expect(term.colors([2, 4, 200]).slice(0, 3)).toEqual([
      "#00ffbf",
      "#80aaff",
      "#112233",
    ]);
  } finally {
    term.dispose();
  }
});

it("can return to the factory baseline and install a fresh owned baseline", async () => {
  const term = terminal(await loadCore());
  try {
    // Capture the public factory palette before any configuration, including
    // extended entries; this also exercises owned -> shared -> owned lifetime.
    const factory = Array.from({ length: 8 }, (_, group) =>
      term
        .colors(Array.from({ length: 32 }, (_, index) => group * 32 + index))
        .slice(0, 32),
    ).flat();
    expect([factory[2], factory[4], factory[200]]).toEqual([
      "#b5bd68",
      "#81a2be",
      "#ff00d7",
    ]);
    for (let repeat = 0; repeat < 4; repeat++) {
      term.palette(configured);
      term.write(overrides + "\u0007");
      term.palette(factory);
      expect(term.colors([2, 4, 200]).slice(0, 3)).toEqual([
        "#b5bd68",
        "#81a2be",
        "#ff00d7",
      ]);
      term.palette(live);
      term.write(overrides + "\u0007\u001b]104\u0007");
      expect(term.colors().slice(0, 17)).toEqual([...live, "#ff00d7"]);
    }
  } finally {
    term.dispose();
  }
});

it("owns reset baselines per handle through repeated replacement and destruction", async () => {
  const core = await loadCore();
  const retained = terminal(core);
  try {
    retained.palette(live);
    for (let cycle = 0; cycle < 24; cycle++) {
      const term = terminal(core);
      try {
        expect(term.colors([2, 4]).slice(0, 2)).toEqual(["#b5bd68", "#81a2be"]);
        for (const palette of [configured, live, configured]) {
          term.palette(palette);
          term.write(overrides + "\u0007\u001b]104\u0007");
          expect(term.colors().slice(0, 17)).toEqual([...palette, "#ff00d7"]);
        }
      } finally {
        term.dispose();
      }
      // The retained baseline must survive allocations/frees in another handle.
      retained.write(overrides + "\u0007\u001b]104\u001b\\");
      expect(retained.colors().slice(0, 17)).toEqual([...live, "#ff00d7"]);
    }
  } finally {
    retained.dispose();
  }
});
