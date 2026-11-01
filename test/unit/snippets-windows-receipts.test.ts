import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { countWindowsProbeReceipts } =
  require("../fixtures/snippets-scenario.cjs") as {
    countWindowsProbeReceipts(output: string, marker: string): number | null;
  };
const marker = "SNIPPETS_INSERT_DRAFT_RECEIPT";
const markers = [
  marker,
  "SNIPPETS_INSERT_RECEIPT",
  "SNIPPETS_RUN_RECEIPT",
  "SNIPPETS_RUN_DRAFT_RECEIPT",
  "SNIPPETS_DRAFT_CLEARED",
  "SNIPPETS_AFTER_RETIREMENT",
  "SNIPPETS_DIAGNOSTIC_INSERT_RECEIVED",
];

it.each(markers)("counts only exact completed %s receipts", (value) => {
  const output = `\u001b[6n\u001b[2;1H${value}\r\n${value}\n`;
  expect(countWindowsProbeReceipts(output, value)).toBe(2);
  expect(output).toBe(`\u001b[6n\u001b[2;1H${value}\r\n${value}\n`);
});

it.each(["1", "2", "42"])(
  "recognizes a complete cursor-position row %s at column one",
  (row) => {
    expect(
      countWindowsProbeReceipts(`\u001b[${row};1H${marker}\r\n`, marker),
    ).toBe(1);
  },
);

it("waits for a complete terminator and handles every accumulated chunk split", () => {
  const output = `\u001b[6n\u001b[2;1H${marker}\r\n`;
  for (let split = 0; split < output.length; split++) {
    const first = output.slice(0, split);
    expect([0, null]).toContain(countWindowsProbeReceipts(first, marker));
    expect(countWindowsProbeReceipts(first + output.slice(split), marker)).toBe(
      1,
    );
  }
  expect(countWindowsProbeReceipts(`${marker}`, marker)).toBeNull();
  expect(countWindowsProbeReceipts(`${marker}\r`, marker)).toBeNull();
  expect(
    countWindowsProbeReceipts(`${marker}\n${marker}\r`, marker),
  ).toBeNull();
});

it("does not accept an earlier count while a framed duplicate is arriving in chunks", () => {
  const complete = `\u001b[2;1H${marker}\r\n`;
  for (let length = 1; length <= marker.length; length++) {
    const pending = complete + "\u001b[3;1H" + marker.slice(0, length);
    expect(countWindowsProbeReceipts(pending, marker)).toBeNull();
    expect(
      countWindowsProbeReceipts(
        pending + marker.slice(length) + "\r\n",
        marker,
      ),
    ).toBe(2);
  }
});

it.each([
  `prefix${marker}\r\n`,
  `${marker}_EXTRA\r\n`,
  `\u001b[2;2H${marker}\r\n`,
  `\u001b[0;1H${marker}\r\n`,
  `\u001b[2;01H${marker}\r\n`,
  `\u001b[2;1f${marker}\r\n`,
  `\u001b[2;1H${marker}\rX`,
  `\u001b[2;1H${marker}\u001b[0m\r\n`,
])("rejects unframed, malformed or non-column-one receipt %j", (output) => {
  expect(() => countWindowsProbeReceipts(output, marker)).toThrow(
    "Invalid controlled probe receipt framing",
  );
});

it.each(["", "SNIPPETS.*", "SNIPPETS-RECEIPT", "lowercase"])(
  "rejects an invalid marker argument %j",
  (invalid) => {
    expect(() => countWindowsProbeReceipts("", invalid)).toThrow();
  },
);

it("refuses an invalid marker substring even if an exact receipt was already observed", () => {
  const output = `\u001b[2;1H${marker}\r\nnot-${marker}\r\n`;
  expect(() => countWindowsProbeReceipts(output, marker)).toThrow(
    "Invalid controlled probe receipt framing",
  );
});
