import { expect, it, vi } from "vitest";
import { createFixtureMetricReplyRouter } from "../fixtures/restty-host-metric-replies";

const query = "\u001b[16t";
const reply = "\u001b[6;50;21t";
function fixture(deliverOutput = vi.fn<(data: string) => void>()) {
  const native = { write: vi.fn(), resize: vi.fn(), close: vi.fn() };
  const evidence = {
    inputs: [] as string[],
    resizes: [] as Array<{ cols: number; rows: number }>,
  };
  return {
    native,
    evidence,
    output: deliverOutput,
    ...createFixtureMetricReplyRouter(native, deliverOutput, evidence),
  };
}

it("keeps a fixture-owned metric reply observable but out of the real PTY", () => {
  const f = fixture();
  f.deliverOutput(query);
  expect(f.output).toHaveBeenCalledExactlyOnceWith(query);
  f.terminal.write(reply);
  expect(f.native.write).not.toHaveBeenCalled();
  expect(f.evidence.inputs).toEqual([reply]);
  // A subsequent real producer's reply has no fixture owner.
  f.terminal.write(reply);
  expect(f.native.write).toHaveBeenCalledExactlyOnceWith(reply);
  expect(f.evidence.inputs).toEqual([reply, reply]);
});

it("owns the reply before synchronous output delivery can respond", () => {
  const f = fixture(
    vi.fn(() => {
      f.terminal.write(reply);
    }),
  );
  f.deliverOutput(query);
  f.deliverOutput(query);
  expect(f.native.write).not.toHaveBeenCalled();
  expect(f.evidence.inputs).toEqual([reply, reply]);
});

it("forwards ordinary input and unrelated replies without consuming ownership", () => {
  const f = fixture();
  const ordinary = ["typed", "\u001b[3;5R", "prefix" + reply, reply + "suffix"];
  f.deliverOutput(query);
  for (const data of ordinary) f.terminal.write(data);
  f.terminal.write(reply);
  expect(f.native.write.mock.calls).toEqual(ordinary.map((data) => [data]));
  expect(f.evidence.inputs).toEqual([...ordinary, reply]);
});

it("leaves ordinary output and unsolicited native-client replies untouched", () => {
  const f = fixture();
  f.deliverOutput("reference.png");
  f.terminal.write(reply);
  expect(f.output).toHaveBeenCalledExactlyOnceWith("reference.png");
  expect(f.native.write).toHaveBeenCalledExactlyOnceWith(reply);
});

it("does not consume another session's reply", () => {
  const first = fixture();
  const second = fixture();
  first.deliverOutput(query);
  second.terminal.write(reply);
  first.terminal.write(reply);
  expect(first.native.write).not.toHaveBeenCalled();
  expect(second.native.write).toHaveBeenCalledExactlyOnceWith(reply);
});

it("rejects overlapping fixture queries rather than losing reply ownership", () => {
  const f = fixture();
  f.deliverOutput(query);
  expect(() => f.deliverOutput(query)).toThrow(
    "Overlapping fixture cell-metric query",
  );
  expect(f.output).toHaveBeenCalledTimes(1);
});

it("preserves real resize evidence and the remaining session operations", () => {
  const f = fixture();
  const size = { cols: 51, rows: 22 };
  f.terminal.resize(size);
  expect(f.native.resize).toHaveBeenCalledExactlyOnceWith(size);
  expect(f.evidence.resizes).toEqual([size]);
  expect(f.terminal.close).toBe(f.native.close);
});
