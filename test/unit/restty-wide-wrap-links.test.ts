import { expect, it } from "vitest";
import { realFrameFixture } from "../fixtures/restty-link-core-probe";

const range = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => start + i);

// Actual prepared lookup, cluster reader, normalization, resolver and core.
// Client coordinates are cell coordinates; no GPU or native input is exercised.
it("recognizes the complete wide-wrap URL on every occupied row with exact UTF-16 offsets and hover cells", async () => {
  const fixture = await realFrameFixture(26, 20);
  const url = `https://example.test/漢${"a".repeat(26)}`;
  // Retain the existing hover policy: spacer cells underline with the preceding
  // link cluster, but contribute no text. This is not selection normalization.
  const cells = range(4, 50);
  try {
    fixture.write(`漢e\u0301 ${url}`);
    fixture.produce();
    expect(fixture.frame().wide?.[25]).toBe(3);
    for (const index of cells) {
      const col = index % 26;
      const row = Math.floor(index / 26);
      fixture.produce(); // Selection allocation can detach the preceding views.
      expect(fixture.runtime.getVisibleLinkAtClientPoint(col, row)).toEqual({
        url,
        start: 4,
        end: 52,
        cells,
        id: `0:0:4:52:${url}`,
      });
    }
  } finally {
    fixture.dispose();
  }
});

it("keeps every spacer-wrapped hit on its own destination across separate hard lines", async () => {
  const fixture = await realFrameFixture(26, 8);
  const oldUrl = "https://old.test/aaaaaaaaa";
  const newUrl = "https://new.test/aaaaaaaa漢";
  try {
    fixture.write(`${oldUrl}\r\n${newUrl}`);
    fixture.produce();
    expect(fixture.frame().wide?.[51]).toBe(3);
    for (const [url, firstRow, cells] of [
      [oldUrl, 0, range(0, 26)],
      [newUrl, 1, range(26, 28)],
    ] as const) {
      for (const index of cells) {
        fixture.produce();
        expect(
          fixture.runtime.getVisibleLinkAtClientPoint(
            index % 26,
            Math.floor(index / 26),
          ),
        ).toEqual({
          url,
          start: 0,
          end: 26,
          cells,
          id: `0:${firstRow}:0:26:${url}`,
        });
      }
    }
  } finally {
    fixture.dispose();
  }
});

it.each(["not a link", ""])(
  "keeps spacer hits off the preceding non-link hard line %j",
  async (previous) => {
    const fixture = await realFrameFixture(26, 8);
    const url = "https://new.test/aaaaaaaa漢";
    const cells = range(26, 28);
    try {
      fixture.write(`${previous}\r\n${url}`);
      fixture.produce();
      expect(fixture.frame().wide?.[51]).toBe(3);
      for (let col = 0; col < 26; col += 1) {
        fixture.produce();
        expect(fixture.runtime.getVisibleLinkAtClientPoint(col, 0)).toBeNull();
      }
      for (const index of cells) {
        fixture.produce();
        expect(
          fixture.runtime.getVisibleLinkAtClientPoint(
            index % 26,
            Math.floor(index / 26),
          ),
        ).toEqual({
          url,
          start: 0,
          end: 26,
          cells,
          id: `0:1:0:26:${url}`,
        });
      }
    } finally {
      fixture.dispose();
    }
  },
);

it("maps a spacer past its same-row wide tail without borrowing the previous hard line's wide glyph", async () => {
  const fixture = await realFrameFixture(26, 8);
  const oldUrl = "https://old.test/aaaaaaa漢";
  const newUrl = "https://new.test/aaaaaa漢漢";
  try {
    fixture.write(`${oldUrl}\r\n${newUrl}`);
    fixture.produce();
    expect(
      [25, 50, 51, 53].map((index) => fixture.frame().wide?.[index]),
    ).toEqual([2, 2, 3, 2]);
    for (const [url, firstRow, cells] of [
      [oldUrl, 0, range(0, 26)],
      [newUrl, 1, range(26, 28)],
    ] as const) {
      for (const index of cells) {
        fixture.produce();
        expect(
          fixture.runtime.getVisibleLinkAtClientPoint(
            index % 26,
            Math.floor(index / 26),
          ),
        ).toEqual({
          url,
          start: 0,
          end: 25,
          cells,
          id: `0:${firstRow}:0:25:${url}`,
        });
      }
    }
  } finally {
    fixture.dispose();
  }
});

it("keeps a same-row spacer hit on its destination when selection growth detaches wide flags", async () => {
  const fixture = await realFrameFixture(26, 8);
  const url = "https://new.test/aaaaaa漢漢";
  const selection = fixture.wasm.getSelectionText.bind(fixture.wasm);
  try {
    fixture.write(`https://old.test/aaaaaaa漢\r\n${url}`);
    fixture.produce();
    const views = fixture.frame();
    let queries = 0;
    fixture.wasm.getSelectionText = (...args) => {
      if (queries++ === 0) fixture.wasm.memory.grow(1);
      return selection(...args);
    };
    expect(fixture.runtime.getVisibleLinkAtClientPoint(25, 1)).toEqual({
      url,
      start: 0,
      end: 25,
      cells: range(26, 28),
      id: `0:1:0:25:${url}`,
    });
    expect(queries).toBeGreaterThan(0);
    expect(views.wide!.byteLength).toBe(0);
    expect(views.codepoints!.byteLength).toBe(0);
  } finally {
    fixture.wasm.getSelectionText = selection;
    fixture.dispose();
  }
});

it.each([
  [
    24,
    49,
    [
      [4, 0],
      [2, 1],
      [0, 2],
    ],
  ],
  [
    25,
    49,
    [
      [4, 0],
      [2, 1],
      [0, 2],
    ],
  ],
  [
    26,
    50,
    [
      [4, 0],
      [2, 1],
      [0, 2],
    ],
  ],
  [
    27,
    49,
    [
      [4, 0],
      [2, 1],
    ],
  ],
  [80, 49, [[4, 0]]],
] as const)(
  "preserves exact link spans and non-target prefix cells at %i columns",
  async (cols, count, points) => {
    const fixture = await realFrameFixture(cols, 20);
    const url = `https://example.test/漢${"a".repeat(26)}`;
    try {
      fixture.write(`漢e\u0301 ${url}`);
      for (const [col, row] of points) {
        fixture.produce();
        expect(fixture.runtime.getVisibleLinkAtClientPoint(col, row)).toEqual({
          url,
          start: 4,
          end: 52,
          cells: range(4, count),
          id: `0:0:4:52:${url}`,
        });
      }
      for (const col of [0, 1, 2, 3]) {
        fixture.produce();
        expect(fixture.runtime.getVisibleLinkAtClientPoint(col, 0)).toBeNull();
      }
      fixture.produce();
      expect(fixture.runtime.getVisibleLinkAtClientPoint(0, 3)).toBeNull();
    } finally {
      fixture.dispose();
    }
  },
);

it.each([
  ["https", 26, "漢\u0301"],
  ["http", 25, "漢\u0301"],
  ["https", 26, "❤️"],
  ["https", 26, "👩‍💻"],
] as const)(
  "keeps complete %s wrapped %s-column graphemes %s and ignores hidden OSC 8 destinations",
  async (scheme, cols, cluster) => {
    const fixture = await realFrameFixture(cols, 20);
    const url = `${scheme}://example.test/${cluster}${"a".repeat(26)}`;
    const end = 4 + url.length; // UTF-16 contract, not cell width.
    const count = cols === 26 ? 50 : 49;
    try {
      fixture.write(
        `漢e\u0301 \u001b]8;;https://hidden.test/not-the-target\u0007${url}\u001b]8;;\u0007`,
      );
      fixture.produce();
      expect(fixture.frame().wide?.[cols - 1]).toBe(3);
      // Both columns of the wide glyph resolve to the full cluster/URL.
      for (const [col, row] of [
        [4, 0],
        [0, 1],
        [1, 1],
        [0, 2],
      ] as const) {
        fixture.produce();
        expect(fixture.runtime.getVisibleLinkAtClientPoint(col, row)).toEqual({
          url,
          start: 4,
          end,
          cells: range(4, count),
          id: `0:0:4:${end}:${url}`,
        });
      }
    } finally {
      fixture.dispose();
    }
  },
);

it("proves repeated spacer rows using the last row of each pair without duplicating glyphs", async () => {
  const fixture = await realFrameFixture(4, 20);
  const url = "https://a.test/漢x漢x漢";
  try {
    fixture.write(url);
    fixture.produce();
    expect([15, 19, 23].map((i) => fixture.frame().wide?.[i])).toEqual([
      3, 3, 3,
    ]);
    for (const [col, row] of [
      [0, 0],
      [0, 4],
      [1, 4],
      [0, 5],
      [0, 6],
      [3, 4],
    ] as const) {
      fixture.produce();
      expect(fixture.runtime.getVisibleLinkAtClientPoint(col, row)).toEqual({
        url,
        start: 0,
        end: 20,
        cells: range(0, 26),
        id: `0:0:0:20:${url}`,
      });
    }
  } finally {
    fixture.dispose();
  }
});

it("keeps proof endpoints, grapheme text and wide-tail hit coordinates across selection memory growth", async () => {
  const fixture = await realFrameFixture(26, 20);
  // The last wide tail must normalize to the cluster, not the end offset.
  const url = "https://example.test/👩‍💻";
  const original = fixture.wasm.getSelectionText.bind(fixture.wasm);
  try {
    fixture.write(`漢e\u0301 ${url}`);
    fixture.produce();
    const views = fixture.frame();
    let queries = 0;
    fixture.wasm.getSelectionText = (...args) => {
      if (queries++ === 0) fixture.wasm.memory.grow(1);
      return original(...args);
    };
    expect(fixture.runtime.getVisibleLinkAtClientPoint(1, 1)).toEqual({
      url,
      start: 4,
      end: 30,
      cells: range(4, 24),
      id: `0:0:4:30:${url}`,
    });
    expect(queries).toBeGreaterThan(0);
    expect(views.wide!.byteLength).toBe(0);
    expect(views.codepoints!.byteLength).toBe(0);
  } finally {
    fixture.wasm.getSelectionText = original;
    fixture.dispose();
  }
});

it("retains full equality rejection and leaves ordinary spacer selection semantics unchanged", async () => {
  const fixture = await realFrameFixture(26, 20);
  const url = `https://example.test/漢${"a".repeat(26)}`;
  try {
    fixture.write(`漢e\u0301 ${url}`);
    const selection = () =>
      fixture.wasm.getSelectionText(fixture.handle, 0, 0, 0, 25);
    expect(selection()).toBe("漢e\u0301 https://example.test/漢");
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)?.url).toBe(url);
    expect(selection()).toBe("漢e\u0301 https://example.test/漢");
    fixture.produce();
    // Negative control: corrupt a submitted render snapshot, not core text.
    fixture.frame().codepoints![4] = "X".codePointAt(0)!;
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)).toBeNull();
  } finally {
    fixture.dispose();
  }
});

it("does not join producer hard breaks after a corrected wide wrap", async () => {
  const fixture = await realFrameFixture(26, 8);
  const first = `https://example.test/漢${"a".repeat(26)}`;
  const second = "http://second.test/b";
  try {
    fixture.write(`漢e\u0301 ${first}\r\n${second}`);
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(0, 2)).toEqual({
      url: first,
      start: 4,
      end: 52,
      cells: range(4, 50),
      id: `0:0:4:52:${first}`,
    });
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(0, 3)).toEqual({
      url: second,
      start: 0,
      end: 20,
      cells: range(78, 20),
      id: `0:3:0:20:${second}`,
    });
  } finally {
    fixture.dispose();
  }
});

it("retains whole-line image paths and literal spaces across a wide-wrap spacer", async () => {
  const fixture = await realFrameFixture(26, 8);
  const path = `/tmp/${"a".repeat(20)}漢 image.png`;
  try {
    fixture.write(path);
    for (const [col, row] of [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [10, 1],
    ] as const) {
      fixture.produce();
      expect(fixture.runtime.getVisibleLinkAtClientPoint(col, row)).toEqual({
        url: path,
        start: 0,
        end: 36,
        cells: range(0, 38),
        id: `0:0:0:36:${path}`,
      });
    }
  } finally {
    fixture.dispose();
  }
});

it("recognizes a fully visible retained wide-wrap line, refuses clipping and survives reflow and alternate screen", async () => {
  const fixture = await realFrameFixture(26, 4);
  const url = `https://example.test/漢${"a".repeat(26)}`;
  try {
    fixture.write(`漢e\u0301 ${url}\r\ntrail-0\r\ntrail-1\r\ntrail-2`);
    fixture.runtime.scroll.scrollViewportByLines(-100);
    fixture.produce();
    expect(fixture.wasm.exports.restty_scrollbar_offset!(fixture.handle)).toBe(
      0,
    );
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)).toEqual({
      url,
      start: 4,
      end: 52,
      cells: range(4, 50),
      id: `0:0:4:52:${url}`,
    });
    fixture.runtime.scroll.scrollViewportByLines(1);
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(0, 0)).toBeNull();
    fixture.runtime.scroll.scrollViewportByLines(-100);
    fixture.wasm.resize(fixture.handle, 26, 2);
    fixture.produce();
    // A visible spacer precedes a continuation that extends below the grid.
    expect(fixture.frame().wide?.[25]).toBe(3);
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)).toBeNull();
    fixture.wasm.resize(fixture.handle, 80, 4);
    fixture.runtime.scroll.scrollViewportByLines(-100);
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)?.url).toBe(url);
    fixture.write(`\u001b[?1049h\u001b[2J\u001b[H漢e\u0301 ${url}`);
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)?.url).toBe(url);
    fixture.write("\u001b[?1049l");
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(4, 0)?.url).toBe(url);
  } finally {
    fixture.dispose();
  }
});

it("refuses a URL with a spacer on the last visible row until its continuation is visible", async () => {
  const fixture = await realFrameFixture(26, 2);
  const url = `https://example.test/aaaa${`漢${"a".repeat(23)}`.repeat(3)}`;
  try {
    fixture.write(url);
    fixture.runtime.scroll.scrollViewportByLines(-100);
    fixture.produce();
    expect(fixture.wasm.exports.restty_scrollbar_offset!(fixture.handle)).toBe(
      0,
    );
    expect(fixture.frame().wide?.[51]).toBe(3);
    expect(fixture.runtime.getVisibleLinkAtClientPoint(0, 0)).toBeNull();
    fixture.wasm.resize(fixture.handle, 26, 4);
    fixture.runtime.scroll.scrollViewportByLines(-100);
    fixture.produce();
    expect(fixture.runtime.getVisibleLinkAtClientPoint(0, 0)).toEqual({
      url,
      start: 0,
      end: 97,
      cells: range(0, 103),
      id: `0:0:0:97:${url}`,
    });
  } finally {
    fixture.dispose();
  }
});

it("keeps exact proofs across a real Ghostty page-end spacer and an ordinary adjacent spacer", async () => {
  const fixture = await realFrameFixture(26, 8);
  const url = `https://example.test/aaaa${`漢${"a".repeat(23)}`.repeat(3)}`;
  try {
    // In the pinned WASM's 26-column layout the first page has 2,022 rows.
    // The public formatter queries below distinguish its final row from the
    // ordinary preceding spacer. This is not a synthetic page-boundary flag.
    fixture.write(
      `${"lead\r\n".repeat(2020)}${url}\r\ntrail-0\r\ntrail-1\r\ntrail-2`,
    );
    fixture.produce();
    expect(fixture.wasm.exports.restty_scrollbar_offset!(fixture.handle)).toBe(
      2019,
    );
    expect([51, 77, 103].map((i) => fixture.frame().wide?.[i])).toEqual([
      3, 3, 3,
    ]);
    const q = (row: number, end: number) =>
      fixture.wasm.getSelectionText(fixture.handle, row, 0, row, end);
    expect(q(1, 25)).toBe("https://example.test/aaaa漢");
    expect(q(1, 24)).toBe("https://example.test/aaaa");
    expect(q(2, 25)).toBe(`漢${"a".repeat(23)}`);
    expect(q(2, 24)).toBe(`漢${"a".repeat(23)}`);
    for (const [col, row] of [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ] as const) {
      fixture.produce();
      expect(fixture.runtime.getVisibleLinkAtClientPoint(col, row)).toEqual({
        url,
        start: 0,
        end: 97,
        cells: range(26, 103),
        id: `2019:1:0:97:${url}`,
      });
    }
  } finally {
    fixture.dispose();
  }
});
