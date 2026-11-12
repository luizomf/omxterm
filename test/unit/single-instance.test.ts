import { describe, expect, it, vi } from "vitest";
import {
  claimSingleInstance,
  forwardedLaunchRequest,
} from "../../src/main/single-instance";

type Listener = (
  event: unknown,
  argv: string[],
  workingDirectory: string,
  additionalData: unknown,
) => void;

function fakeApp(options: { packaged: boolean; locked: boolean }) {
  const listeners: Listener[] = [];
  const app = {
    isPackaged: options.packaged,
    requestSingleInstanceLock: vi.fn(() => options.locked),
    on: vi.fn((_event: "second-instance", listener: Listener) => {
      listeners.push(listener);
    }),
    quit: vi.fn(),
  };
  // Simulates Electron delivering another launch's data to this process.
  const secondLaunch = (data: unknown) =>
    listeners.forEach((listener) =>
      listener({}, ["reordered", "argv"], "/somewhere", data),
    );
  return { app, secondLaunch };
}

const packagedArgv = (...args: string[]) => ["/opt/OMXTerm", ...args];

describe("claimSingleInstance", () => {
  it("starts and opens later launches in this process when it holds the lock", () => {
    const { app, secondLaunch } = fakeApp({ packaged: true, locked: true });
    const open = vi.fn();

    expect(claimSingleInstance(app, packagedArgv(), open)).toBe(true);
    expect(app.quit).not.toHaveBeenCalled();

    secondLaunch({
      launch: {
        kind: "explicit-command",
        executable: "/bin/sh",
        arguments: ["-lc", "echo -e ok"],
      },
    });
    secondLaunch({ launch: { kind: "default-shell" } });

    expect(open.mock.calls).toEqual([
      [
        {
          kind: "explicit-command",
          executable: "/bin/sh",
          arguments: ["-lc", "echo -e ok"],
        },
      ],
      [{ kind: "default-shell" }],
    ]);
  });

  it("hands its literal Launch Request to the running process and quits", () => {
    const { app } = fakeApp({ packaged: true, locked: false });
    const open = vi.fn();

    expect(
      claimSingleInstance(
        app,
        packagedArgv("--ozone-platform=x11", "-e", "htop", "-e", "--x"),
        open,
      ),
    ).toBe(false);

    expect(app.requestSingleInstanceLock).toHaveBeenCalledWith({
      launch: {
        kind: "explicit-command",
        executable: "htop",
        arguments: ["-e", "--x"],
      },
    });
    expect(app.quit).toHaveBeenCalledOnce();
    expect(app.on).not.toHaveBeenCalled();
  });

  it("leaves a malformed request to this process's startup failure", () => {
    const { app } = fakeApp({ packaged: true, locked: false });

    expect(claimSingleInstance(app, packagedArgv("-e"), vi.fn())).toBe(true);
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("never locks a source run", () => {
    const { app } = fakeApp({ packaged: false, locked: false });

    expect(
      claimSingleInstance(app, ["electron", "dist/main/index.js"], vi.fn()),
    ).toBe(true);
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
  });
});

describe("forwardedLaunchRequest", () => {
  it.each([
    undefined,
    null,
    "launch",
    {},
    { launch: { kind: "explicit-command" } },
    { launch: { kind: "explicit-command", executable: 7, arguments: [] } },
    {
      launch: { kind: "explicit-command", executable: "sh", arguments: [1] },
    },
    { launch: { kind: "explicit-command", executable: "sh", arguments: "x" } },
    { launch: { kind: "something-new" } },
  ])("opens the Default Shell for unreadable data %#", (data) => {
    expect(forwardedLaunchRequest(data)).toEqual({ kind: "default-shell" });
  });
});
