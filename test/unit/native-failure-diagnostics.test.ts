import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordInitializationStage } from "../fixtures/initialization-cancellation-diagnostics";

let output: string[];
beforeEach(() => {
  output = [];
  vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    output.push(String(value));
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());

it("retains fixed initialization boundaries/timestamps without claiming completion of a begun operation", () => {
  vi.spyOn(Date, "now")
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(200)
    .mockReturnValueOnce(210);
  recordInitializationStage("fonts", "app-ready", "begin");
  recordInitializationStage("fonts", "app-ready", "complete");
  recordInitializationStage("fonts", "window-load", "begin");
  expect(
    output.map(
      (line) =>
        JSON.parse(
          line.slice("__OMXTERM_INITIALIZATION_STAGE__".length),
        ) as unknown,
    ),
  ).toEqual([
    {
      version: 1,
      boundary: "fonts",
      stage: "app-ready",
      status: "begin",
      at: 100,
    },
    {
      version: 1,
      boundary: "fonts",
      stage: "app-ready",
      status: "complete",
      at: 200,
    },
    {
      version: 1,
      boundary: "fonts",
      stage: "window-load",
      status: "begin",
      at: 210,
    },
  ]);
  expect(output.every((line) => line.length < 200)).toBe(true);
  expect(output.join("")).not.toContain("__OMXTERM_CANCELLATION_RESULT__");
});

it("rejects arbitrary stage/context strings without logging user data", () => {
  recordInitializationStage(
    "fonts",
    "private terminal payload" as never,
    "begin",
  );
  recordInitializationStage("private font" as never, "app-ready", "begin");
  recordInitializationStage(
    "runtime",
    "app-ready",
    "private clipboard" as never,
  );
  expect(output).toEqual([]);
});

it("diagnostic sink failures cannot replace an original failure or prevent the next native operation", () => {
  vi.mocked(process.stdout.write).mockImplementation(() => {
    throw new Error("sink failure");
  });
  expect(() =>
    recordInitializationStage("runtime", "b-held", "begin"),
  ).not.toThrow();
});
