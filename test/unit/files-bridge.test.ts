import { describe, expect, it, vi } from "vitest";
import type { IpcRenderer } from "electron";
import { createFilesBridge } from "../../src/preload/files-bridge";
import { fileBrowserIpc } from "../../src/shared/file-browser";

function ipc(answer: unknown) {
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();
  const fake = {
    invoke: vi.fn(async () => answer),
    on: vi.fn(
      (
        channel: string,
        listener: (event: unknown, payload: unknown) => void,
      ) => {
        listeners.set(channel, listener);
      },
    ),
    removeListener: vi.fn(),
  };
  return {
    bridge: createFilesBridge(fake as unknown as IpcRenderer),
    fake,
    emit: (channel: string, payload: unknown) =>
      listeners.get(channel)?.({}, payload),
  };
}

describe("preload Files bridge", () => {
  it("sends only validated paths, names and sessions", async () => {
    const { bridge, fake } = ipc({ ok: true });
    await bridge.rename("/home/me/a", "b");
    expect(fake.invoke).toHaveBeenCalledWith(fileBrowserIpc.rename, {
      path: "/home/me/a",
      name: "b",
    });
    expect(() => bridge.rename("/home/me/a", "../b")).toThrow(TypeError);
    expect(() => bridge.trash([])).toThrow(TypeError);
    expect(() => bridge.remoteDelete("not a session", ["/x"])).toThrow(
      TypeError,
    );
    await bridge.remoteDelete("s3", ["/srv/x"]);
    expect(fake.invoke).toHaveBeenLastCalledWith(fileBrowserIpc.remoteDelete, {
      sessionId: "s3",
      paths: ["/srv/x"],
    });
  });

  it("rejects malformed answers", async () => {
    await expect(ipc({ path: "/x" }).bridge.list("/x")).rejects.toThrow(
      TypeError,
    );
    await expect(ipc({ ok: "yes" }).bridge.open("/x")).rejects.toThrow(
      TypeError,
    );
    await expect(ipc({ kind: "remote" }).bridge.location("s1")).rejects.toThrow(
      TypeError,
    );
  });

  it("passes on only well-formed transfer events", () => {
    const { bridge, emit } = ipc(undefined);
    const listener = vi.fn();
    bridge.onTransfer(listener);
    const event = {
      id: "t",
      name: "a.txt",
      direction: "upload",
      transferred: 1,
      state: "running",
    };
    emit(fileBrowserIpc.transfer, event);
    emit(fileBrowserIpc.transfer, { ...event, state: "exploded" });
    expect(listener).toHaveBeenCalledOnce();
  });
});
