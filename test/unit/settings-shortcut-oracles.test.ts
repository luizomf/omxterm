import { expect, it } from "vitest";
import { assertCaptureSample } from "../fixtures/settings-shortcut-oracles";
const before = { bytes: 6, actions: 2, menu: 1, quit: 0, fullScreen: false };
it("accepts only the exact fenced input and unchanged capture action observations", () => {
  expect(() =>
    assertCaptureSample("prefixESC", before, before, "synthetic", "ESC"),
  ).not.toThrow();
  expect(() =>
    assertCaptureSample("prefixxESC", before, before, "synthetic", "ESC"),
  ).toThrow("leaked to the actual PTY");
  for (const changed of [
    { actions: 3 },
    { menu: 2 },
    { quit: 1 },
    { fullScreen: true },
  ])
    expect(() =>
      assertCaptureSample(
        "prefixESC",
        before,
        { ...before, ...changed },
        "synthetic",
        "ESC",
      ),
    ).toThrow();
});
