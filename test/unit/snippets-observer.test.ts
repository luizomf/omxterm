import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("test/fixtures/snippets-observer.cjs", "utf8");
function harness() {
  class Terminal extends EventEmitter {
    pid = 123;
    writes: string[] = [];
    forwarded = 0;
    constructor() {
      super();
      this._forwardEvents();
    }
    _forwardEvents() {
      this.forwarded++;
    }
    write(data: string) {
      this.writes.push(data);
      return "forwarded";
    }
    onData(listener: (data: string) => void) {
      this.on("data", listener);
      return { dispose: () => this.off("data", listener) };
    }
    onExit(listener: () => void) {
      this.on("exit", listener);
      return { dispose: () => this.off("exit", listener) };
    }
  }
  const originalForward = Terminal.prototype._forwardEvents;
  const originalWrite = Terminal.prototype.write;
  const child = Object.assign(new EventEmitter(), { pid: 456 });
  const originalFork = vi.fn(() => child);
  const childProcess = { fork: originalFork };
  const dialog = {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
  };
  const sync = vi.fn();
  type Observation = {
    ptys: { pid: number; writes: string[]; output: string; exited: boolean }[];
    children: {
      closed: boolean;
      exit: { code: number; signal: null } | null;
    }[];
    approvalCount(): number;
    restore(): void;
  };
  const exports = {} as {
    observe(options: object, load: (name: string) => unknown): Observation;
  };
  const module = { exports };
  runInNewContext(source, {
    module,
    require: (name: string) => {
      const modules: Record<string, unknown> = {
        "node:assert/strict": assert,
        electron: { dialog },
        "node:child_process": childProcess,
        "node:module": { syncBuiltinESMExports: sync },
        "node:path": path,
      };
      assert.ok(Object.hasOwn(modules, name));
      return modules[name];
    },
  });
  const observe = () =>
    module.exports.observe(
      {
        archive: "/fixture/snippets.omxext",
        archiveSha256: "digest",
        asar: "/fixture/app.asar",
        executable: "/fixture/omxterm",
      },
      (name) => {
        expect(name).toBe("node-pty/lib/terminal.js");
        return { Terminal };
      },
    );
  return {
    Terminal,
    originalForward,
    originalWrite,
    originalFork,
    childProcess,
    child,
    dialog,
    sync,
    observe,
  };
}

describe("Snippets fixture observation", () => {
  it("observes post-attachment instances without replacing a captured spawn binding", () => {
    const h = harness();
    const spawn = () => new h.Terminal();
    const baseline = spawn();
    const observation = h.observe();
    const session = spawn();
    expect(session.forwarded).toBe(1);
    expect(observation.ptys).toHaveLength(1);
    expect(baseline.write("baseline")).toBe("forwarded");
    expect(session.write(" exact\r")).toBe("forwarded");
    session.emit("data", "a".repeat(70000));
    expect(session.writes).toEqual([" exact\r"]);
    expect(observation.ptys[0]).toMatchObject({
      writes: [" exact\r"],
      output: "a".repeat(65536),
      exited: false,
    });
    session.emit("exit");
    expect(observation.ptys[0]?.exited).toBe(true);
    observation.restore();
    expect(h.Terminal.prototype._forwardEvents).toBe(h.originalForward);
    expect(session.write).toBe(h.originalWrite);
    expect(session.listenerCount("data")).toBe(0);
    expect(session.listenerCount("exit")).toBe(0);
    expect(h.childProcess.fork).toBe(h.originalFork);
  });

  it("refuses a nonpackaged backend before spawn and records exit separately from stream close", () => {
    const h = harness();
    const observation = h.observe();
    const fork = h.childProcess.fork as unknown as (
      ...args: unknown[]
    ) => EventEmitter;
    expect(() =>
      fork("/wrong/extension-runtime/bootstrap.mjs", [], {
        execPath: "/fixture/omxterm",
      }),
    ).toThrow();
    expect(h.originalFork).not.toHaveBeenCalled();
    fork("/fixture/app.asar/dist/extension-runtime/bootstrap.mjs", [], {
      execPath: "/fixture/omxterm",
    });
    h.child.emit("exit", 0, null);
    expect(observation.children[0]).toMatchObject({
      closed: false,
      exit: { code: 0, signal: null },
    });
    h.child.emit("close");
    expect(observation.children[0]?.closed).toBe(true);
    observation.restore();
  });

  it("binds controlled approval to the exact archive digest", async () => {
    const h = harness();
    const observation = h.observe();
    await expect(
      h.dialog.showMessageBox(null, {
        title: "Trust extension code?",
        detail: "other",
      }),
    ).rejects.toThrow();
    expect(observation.approvalCount()).toBe(0);
    await expect(
      h.dialog.showMessageBox(null, {
        title: "Trust extension code?",
        detail: "SHA256 digest",
      }),
    ).resolves.toMatchObject({ response: 1 });
    expect(observation.approvalCount()).toBe(1);
    observation.restore();
  });
});
