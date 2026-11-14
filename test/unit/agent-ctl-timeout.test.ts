import { expect, it } from "vitest";
import { parse } from "../../src/agent-ctl/commands";

it("refuses a timeout that looks like seconds and suggests milliseconds", () => {
  expect(() => parse(["wait", "s2", "--timeout", "30"])).toThrow(/30000/u);
  expect(() => parse(["wait", "s2", "--timeout", "0"])).toThrow(
    /at least 100/u,
  );
});

it("accepts a timeout of 100 ms or more", () => {
  expect(parse(["wait", "s2", "--timeout", "100"]).timeout).toBe(100);
});
