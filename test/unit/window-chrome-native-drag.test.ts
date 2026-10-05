import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
  dip: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("electron", () => ({ screen: { dipToScreenPoint: mocks.dip } }));
vi.mock("../fixtures/native-fixture-ownership", () => ({
  spawnFixtureProcess: mocks.spawn,
}));
import { exerciseWindowsHandleDrag } from "../fixtures/window-chrome-native-drag";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function setup() {
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  const child = Object.assign(new EventEmitter(), {
    pid: 123,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    kill: vi.fn(),
  });
  let finish: (
    error: Error | null,
    stdout: string,
    stderr: string,
  ) => void = () => {};
  mocks.execFile.mockImplementation(
    (
      _exe: unknown,
      _args: unknown,
      _options: unknown,
      callback: typeof finish,
    ) => {
      finish = callback;
      return child;
    },
  );
  mocks.spawn.mockImplementation((spawn: () => unknown) => spawn());
  mocks.dip.mockImplementation((point: unknown) => point);
  const window = {
    focus: vi.fn(),
    isFocused: vi.fn(() => false),
    getBounds: vi
      .fn()
      .mockReturnValueOnce({ x: 10, y: 20, width: 900, height: 600 })
      .mockReturnValue({ x: 60, y: 70, width: 900, height: 600 }),
    getContentBounds: vi
      .fn()
      .mockReturnValue({ x: 10, y: 20, width: 900, height: 600 }),
    getNativeWindowHandle: vi.fn(() => {
      const handle = Buffer.alloc(8);
      handle.writeBigUInt64LE(456n);
      return handle;
    }),
  };
  return {
    child,
    window,
    run: () =>
      exerciseWindowsHandleDrag(window as unknown as BrowserWindow, vi.fn()),
    finish: (error: Error | null = null, stderr = "") =>
      finish(error, "", stderr),
  };
}

it("prepares and registers the helper before one focus request and fresh geometry", async () => {
  const fixture = setup();
  let focusedDuringRegistration = false;
  let measuredDuringRegistration = false;
  mocks.spawn.mockImplementation((spawn: () => unknown) => {
    const child = spawn();
    fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
    focusedDuringRegistration = fixture.window.focus.mock.calls.length > 0;
    measuredDuringRegistration = fixture.window.getBounds.mock.calls.length > 0;
    return child;
  });
  const result = fixture.run();
  await Promise.resolve();
  fixture.finish();
  await result;
  expect(focusedDuringRegistration).toBe(false);
  expect(measuredDuringRegistration).toBe(false);
  expect(fixture.window.focus).toHaveBeenCalledTimes(1);
  expect(fixture.window.getContentBounds).toHaveBeenCalledTimes(1);
  expect(fixture.child.stdin.read() as unknown).toEqual(
    Buffer.from("456 460 28\n"),
  );
  await expect(result).resolves.toBe("verified");
  expect(mocks.execFile.mock.calls[0]?.[2]).toMatchObject({
    timeout: 15_000,
    windowsHide: true,
  });
});

it("does not focus or measure while readiness is incomplete", async () => {
  const fixture = setup();
  const result = fixture.run();
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_RE"));
  expect(fixture.window.focus).not.toHaveBeenCalled();
  expect(fixture.window.getBounds).not.toHaveBeenCalled();
  expect(fixture.window.getContentBounds).not.toHaveBeenCalled();
  fixture.child.stdout.emit("data", Buffer.from("ADY\r\n"));
  fixture.finish();
  await expect(result).resolves.toBe("verified");
  expect(fixture.window.focus).toHaveBeenCalledTimes(1);
});

it.each([null, new Error("helper failed")])(
  "rejects early exit without focus (%s)",
  async (error) => {
    const fixture = setup();
    const result = fixture.run();
    fixture.finish(error);
    await expect(result).rejects.toThrow();
    expect(fixture.window.focus).not.toHaveBeenCalled();
    expect(fixture.window.getBounds).not.toHaveBeenCalled();
    expect(fixture.child.stdin.destroyed).toBe(true);
    expect(fixture.child.stdout.listenerCount("data")).toBe(0);
  },
);

it.each(["BAD_READY\n", "x".repeat(33)])(
  "rejects invalid readiness and joins helper exit",
  async (message) => {
    const fixture = setup();
    const result = fixture.run();
    let settled = false;
    void result.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    fixture.child.stdout.emit("data", Buffer.from(message));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(fixture.child.kill).toHaveBeenCalledTimes(1);
    fixture.finish();
    await expect(result).rejects.toThrow();
    expect(fixture.window.focus).not.toHaveBeenCalled();
  },
);

it("rejects preparation stderr before focus", async () => {
  const fixture = setup();
  const result = fixture.run();
  fixture.child.stderr.emit("data", Buffer.from("compilation failed"));
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  fixture.finish(null, "compilation failed");
  await expect(result).rejects.toThrow();
  expect(fixture.window.focus).not.toHaveBeenCalled();
});

it("does not stimulate when ownership registration fails after ready", async () => {
  const fixture = setup();
  mocks.spawn.mockImplementation((spawn: () => unknown) => {
    spawn();
    fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
    throw new Error("registration failed");
  });
  const result = fixture.run();
  fixture.finish();
  await expect(result).rejects.toThrow("registration failed");
  expect(fixture.window.focus).not.toHaveBeenCalled();
  expect(fixture.child.kill).toHaveBeenCalledTimes(1);
});

it("rejects stdin delivery failure and releases its listener after pipe closure", async () => {
  const fixture = setup();
  const result = fixture.run();
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  fixture.child.stdin.emit("error", new Error("broken pipe"));
  fixture.finish();
  await expect(result).rejects.toThrow("command delivery failed");
  fixture.child.stdin.emit("close");
  expect(fixture.child.stdin.listenerCount("error")).toBe(0);
});

it("rejects duplicate readiness without repeating focus", async () => {
  const fixture = setup();
  const result = fixture.run();
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  fixture.finish();
  await expect(result).rejects.toThrow("Unexpected native drag helper output");
  expect(fixture.window.focus).toHaveBeenCalledTimes(1);
});

it("joins helper termination if geometry acquisition throws", async () => {
  const fixture = setup();
  fixture.window.getContentBounds.mockImplementation(() => {
    throw new Error("window gone");
  });
  const result = fixture.run();
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  expect(fixture.child.kill).toHaveBeenCalledTimes(1);
  fixture.finish();
  await expect(result).rejects.toThrow("window gone");
  expect(fixture.child.stdin.read() as unknown).toBe(null);
});

it("retains the movement assertion after successful helper completion", async () => {
  const fixture = setup();
  fixture.window.getBounds
    .mockReset()
    .mockReturnValue({ x: 10, y: 20, width: 900, height: 600 });
  const result = fixture.run();
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  fixture.finish();
  await expect(result).rejects.toThrow(
    "native handle drag moves the same window",
  );
});

it("keeps native guards before mouse-down after the stdin handshake", async () => {
  const fixture = setup();
  const result = fixture.run();
  const args = mocks.execFile.mock.calls[0]![1] as string[];
  const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
  const command = script.indexOf("$command = [Console]::ReadLine()");
  const foreground = script.indexOf(
    "if ([Pointer]::GetForegroundWindow().ToInt64() -ne $handle)",
  );
  const underPointer = script.indexOf(
    "if ([Pointer]::GetAncestor([Pointer]::WindowFromPoint($point), 2).ToInt64() -ne $handle)",
  );
  const mouseDown = script.indexOf("[Pointer]::mouse_event(2,");
  expect(command).toBeGreaterThan(script.indexOf("Add-Type"));
  expect(foreground).toBeGreaterThan(command);
  expect(underPointer).toBeGreaterThan(foreground);
  expect(mouseDown).toBeGreaterThan(underPointer);
  expect(script).not.toMatch(/SetForegroundWindow|AttachThreadInput/);
  fixture.child.stdout.emit("data", Buffer.from("OMXTERM_DRAG_READY\n"));
  fixture.child.stderr.emit(
    "data",
    Buffer.from("Owned window is not foreground"),
  );
  expect(fixture.child.kill).not.toHaveBeenCalled();
  fixture.finish(
    new Error("Owned window is not foreground"),
    "Owned window is not foreground",
  );
  await expect(result).rejects.toThrow("Owned window is not foreground");
});
