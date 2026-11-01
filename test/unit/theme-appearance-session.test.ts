import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { expect, it } from "vitest";
import { extensionInvocationTarget } from "../../src/main/extension-invocation-target";
import { createThemeSessionTracking } from "../fixtures/theme-appearance-session";

it("tracks only the primary window's live focused pane for the extension invocation", () => {
  const contents = new EventEmitter();
  const primary = Object.assign(new EventEmitter(), { webContents: contents });
  const peer = Object.assign(new EventEmitter(), {
    webContents: new EventEmitter(),
  });
  const target = extensionInvocationTarget(primary as unknown as BrowserWindow);
  const tracking = createThemeSessionTracking(
    () => primary,
    () => target,
  );
  const capture = () => target.capture(() => undefined);
  for (const id of ["s1", "s2", "s3"]) tracking.started(primary, id);
  tracking.selected(primary, "s3");
  const original = capture();
  expect(original.sourceSessionId).toBe("s3");
  expect(original.signal.aborted).toBe(false);
  tracking.started(peer, "s1");
  tracking.selected(peer, "s1");
  tracking.ended(peer, "s3");
  expect(capture().sourceSessionId).toBe("s3");
  expect(original.signal.aborted).toBe(false);
  tracking.selected(primary, "s2");
  expect(capture().sourceSessionId).toBe("s2");
  expect(original.signal.aborted).toBe(false);
  tracking.ended(primary, "s3");
  expect(original.signal.aborted).toBe(true);
  expect(capture().signal.aborted).toBe(false);
  primary.emit("closed");
  expect(capture().signal.aborted).toBe(true);
});
