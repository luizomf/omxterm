import { describe, expect, it, vi } from "vitest";
import {
  createFixtureSessionInput,
  expectFixtureInputReply,
} from "../fixtures/fixture-session-input";
import { explicitFixtureReadyMarker } from "../fixtures/restty-host-platform";
import { capturePanelInput } from "../fixtures/auxiliary-panel-input";

const reply = "\u001b[?0u";
const request = "\u001b[?1004l\u001b[?u";
const da = "\u001b[?1;2c";

function session() {
  const owner = createFixtureSessionInput(explicitFixtureReadyMarker);
  const native = vi.fn();
  const input: string[] = [];
  return {
    owner,
    native,
    input,
    write: (data: string) => owner.write(data, native),
    read: () => {
      owner.isReady(); // Losing the native owner must fail a pending fence.
      return input.join("");
    },
    ready: () => owner.observeOutput(explicitFixtureReadyMarker),
    capture: () => owner.capture((data) => input.push(data)),
  };
}

// Deterministic bounded checks: a missing/faulty reply never becomes a sleep or
// a retry. Native consumers supply their existing phase deadline instead.
const waitFor = async (predicate: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 3; attempt += 1)
    if (await predicate()) return;
  throw new Error("Receipt not reached");
};

describe("fixture per-session native input ownership", () => {
  it("forwards late startup negotiation and refuses premature takeover", () => {
    const s = session();
    s.owner.observeOutput("surface sized; not native readiness");
    s.write(da);
    expect(s.native).toHaveBeenCalledWith(da);
    expect(s.owner.isReady()).toBe(false);
    expect(s.capture).toThrow("not ready");
    s.ready();
    s.capture();
    s.write("query");
    expect(s.input).toEqual(["query"]);
    expect(s.native).toHaveBeenCalledTimes(1);
  });

  it("recognizes the execution marker across every split, including Unicode", () => {
    for (let split = 1; split < explicitFixtureReadyMarker.length; split += 1) {
      const s = session();
      s.owner.observeOutput("x".repeat(100_000));
      s.owner.observeOutput(explicitFixtureReadyMarker.slice(0, split));
      expect(s.owner.isReady(), `split ${split}`).toBe(false);
      s.write(da);
      s.owner.observeOutput(explicitFixtureReadyMarker.slice(split));
      expect(s.owner.isReady(), `split ${split}`).toBe(true);
      expect(s.native).toHaveBeenCalledWith(da);
    }
  });

  it("does not join marker pieces across unrelated output", () => {
    const owner = createFixtureSessionInput("READY");
    owner.observeOutput("REA");
    owner.observeOutput("unrelated output".repeat(1000));
    owner.observeOutput("DY");
    expect(owner.isReady()).toBe(false);
    owner.observeOutput("READY");
    expect(owner.isReady()).toBe(true);
  });

  it("keeps a later peer's DA and focus traffic native, even after peer readiness", () => {
    const initial = [session(), session()];
    for (const s of initial) {
      s.ready();
      s.capture();
    }
    const peer = session();
    peer.write(da);
    peer.ready();
    peer.write("\u001b[O\u001b[I");
    initial[0]!.write("X");
    expect(initial[0]!.input).toEqual(["X"]);
    expect(initial[1]!.input).toEqual([]);
    expect(peer.input).toEqual([]);
    expect(peer.native.mock.calls).toEqual([[da], ["\u001b[O\u001b[I"]]);
  });

  it("releases capture deliberately without an old cleanup releasing a new capture", () => {
    const s = session();
    s.ready();
    const release = s.capture();
    expect(s.capture).toThrow("already captured");
    release();
    s.write("native");
    const releaseNext = s.capture();
    release();
    s.write("captured");
    expect(s.input).toEqual(["captured"]);
    releaseNext();
    s.write("native again");
    expect(s.native.mock.calls).toEqual([["native"], ["native again"]]);
  });

  it("fails ownership loss, clears capture, and tolerates repeated cleanup", () => {
    const s = session();
    s.ready();
    const release = s.capture();
    s.owner.dispose();
    s.owner.dispose();
    release();
    s.ready();
    expect(() => s.owner.isReady()).toThrow("owner lost");
    expect(s.capture).toThrow("owner lost");
    expect(() => s.write("late")).toThrow("owner lost");
    expect(s.input).toEqual([]);
    expect(s.native).not.toHaveBeenCalled();
  });
});

describe("panel capture phase", () => {
  function panel(
    onRequest?: (index: number, sessions: ReturnType<typeof session>[]) => void,
  ) {
    const sessions = [session(), session(), session()];
    sessions[0]!.ready();
    sessions[1]!.ready();
    const input: string[] = [];
    const sessionInput: string[][] = [[], []];
    const output = vi.fn((index: number, data: string) => {
      if (data === request) {
        if (onRequest) onRequest(index, sessions);
        else sessions[index]!.write(reply);
      }
    });
    return {
      sessions,
      input,
      sessionInput,
      wait: waitFor,
      options: {
        inputReady: (index: number) => sessions[index]!.owner.isReady(),
        captureInput: (index: number, listener: (data: string) => void) =>
          sessions[index]!.owner.capture(listener),
        output,
      },
    };
  }

  it("consumes only exact setup receipts, then preserves all nonleak/key evidence", async () => {
    const s = panel();
    const release = await capturePanelInput(s);
    expect(s.input).toEqual([]);
    s.sessions[2]!.write(da);
    s.sessions[2]!.ready();
    s.sessions[2]!.write("\u001b[I");
    s.sessions[0]!.write("query");
    s.sessions[1]!.write("X");
    expect(s.input.join("")).toBe("queryX");
    expect(s.sessionInput).toEqual([["query"], ["X"]]);
    release();
    expect(s.options.output.mock.calls).toEqual([
      [0, request],
      [1, request],
      [0, "\u001b[?1004h"],
      [1, "\u001b[?1004h"],
    ]);
    for (const child of s.sessions) child.write("\u001b[O");
    expect(s.input.join("")).toBe("queryX");
    expect(
      s.sessions.every((child) => child.native.mock.calls.length > 0),
    ).toBe(true);
  });

  it.each(["query", "wrong-session", "owner-lost"])(
    "releases both captures and restores modes when setup fails: %s",
    async (failure) => {
      const s = panel((index, sessions) => {
        if (failure === "owner-lost") sessions[index]!.owner.dispose();
        else if (failure === "wrong-session") sessions[1 - index]!.write(reply);
        else sessions[index]!.write("query" + reply);
      });
      await expect(capturePanelInput(s)).rejects.toThrow();
      expect(s.options.output.mock.calls.slice(-2)).toEqual([
        [0, "\u001b[?1004h"],
        [1, "\u001b[?1004h"],
      ]);
      // Session 1 is still live even when session 0 was lost; all surviving
      // input ownership must have been returned, not held by the failed phase.
      s.sessions[1]!.write("native again");
      expect(s.sessions[1]!.native).toHaveBeenCalledWith("native again");
      expect(s.input).toEqual([]);
    },
  );
});

describe("fresh exact same-core mode receipt", () => {
  function fence(
    s: ReturnType<typeof session>,
    output: (data: string) => void,
  ) {
    return expectFixtureInputReply({
      input: s.read,
      output,
      request,
      reply,
      waitFor,
      label: "focus isolation",
    });
  }
  function captured() {
    const s = session();
    s.ready();
    s.capture();
    return s;
  }

  it("waits for a late split response without erasing any evidence", async () => {
    const s = captured();
    s.write("old input");
    let checks = 0;
    await expectFixtureInputReply({
      input: s.read,
      output: (data) => expect(data).toBe(request),
      request,
      reply,
      label: "split response",
      waitFor: async (predicate) => {
        expect(await predicate()).toBe(false);
        s.write(reply.slice(0, 2));
        expect(await predicate()).toBe(false);
        checks += 1;
        s.write(reply.slice(2));
        expect(await predicate()).toBe(true);
      },
    });
    expect(checks).toBe(1);
    expect(s.read()).toBe("old input" + reply);
  });

  it("cannot use a stale reply as a fresh acknowledgement", async () => {
    const s = captured();
    s.write(reply);
    await expect(fence(s, () => {})).rejects.toThrow("Receipt not reached");
    await expect(fence(s, () => s.write(reply))).resolves.toBeUndefined();
    expect(s.read()).toBe(reply + reply);
  });

  it("cannot acknowledge a request with another session's response", async () => {
    const s = captured();
    const peer = captured();
    await expect(fence(s, () => peer.write(reply))).rejects.toThrow(
      "Receipt not reached",
    );
    expect(peer.read()).toBe(reply);
    await expect(fence(s, () => s.write(reply))).resolves.toBeUndefined();
  });

  it.each(["query", "X", "\u001b[O", "\u001b[27;1:3u"])(
    "does not silently accept unexpected setup bytes %j",
    async (extra) => {
      for (const response of [extra + reply, reply + extra]) {
        const s = captured();
        await expect(fence(s, () => s.write(response))).rejects.toThrow(
          "Unexpected input",
        );
        expect(s.read()).toBe(response);
      }
    },
  );

  it("leaves unexpected keyboard bytes intact after the receipt", async () => {
    const s = captured();
    await fence(s, () => s.write(reply));
    const before = s.read().length;
    s.write("query");
    expect(s.read().slice(before)).toBe("query");
    expect(s.read().slice(before)).not.toBe("");
  });

  it("fails a pending receipt on owner loss and releases its capture", async () => {
    const s = captured();
    await expect(fence(s, () => s.owner.dispose())).rejects.toThrow(
      "owner lost",
    );
    expect(s.input).toEqual([]);
  });
});
