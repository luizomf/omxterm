// @vitest-environment jsdom
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { focusThemeSeparator } from "../fixtures/theme-appearance-keyboard";

function fixture() {
  document.body.innerHTML = `<aside id="snippets-sidebar"><input></aside><button class="auxiliary-hide">Tab destination</button><div class="separator" tabindex="0"></div>`;
  const separator = document.querySelector<HTMLElement>(".separator")!;
  const focus = vi.spyOn(separator, "focus");
  // JSDOM cannot establish Chromium keyboard modality. Double only that native
  // CSS predicate; real DOM focus and the held transport ordering stay visible.
  const matches = separator.matches.bind(separator);
  vi.spyOn(separator, "matches").mockImplementation((selector) =>
    selector === ":focus-visible"
      ? document.activeElement === separator
      : matches(selector),
  );
  const listeners = new Map<string, EventListenerOrEventListenerObject>();
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation(
    (type, listener, options) => {
      if (type === "keydown" || type === "keyup")
        listeners.set(type, listener!);
      else add(type, listener, options);
    },
  );
  vi.spyOn(document, "removeEventListener").mockImplementation(
    (type, listener, options) => {
      if (listeners.get(type) === listener) listeners.delete(type);
      else remove(type, listener, options);
    },
  );
  const renderer = { document };
  let submitted!: () => void;
  const submission = new Promise<void>((resolve) => {
    submitted = resolve;
  });
  const sendInputEvent = vi.fn((event: { type: string }) => {
    if (event.type === "keyUp") submitted();
  });
  const evaluate = vi.fn(
    async (script: string) => runInNewContext(script, renderer) as unknown,
  );
  const focusContents = vi.fn();
  const contents = {
    sendInputEvent,
    executeJavaScript: evaluate,
    focus: focusContents,
  } as unknown as Parameters<typeof focusThemeSeparator>[0];
  // This is the external Chromium event-delivery boundary, not a fake proof of
  // native trust/modality. Native qualification exercises real sendInputEvent.
  function deliver(type: string, changes: Partial<KeyboardEvent> = {}) {
    const event = {
      type,
      key: "Tab",
      isTrusted: true,
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
      ...changes,
    } as KeyboardEvent;
    const listener = listeners.get(type);
    if (typeof listener === "function") listener(event);
    else listener?.handleEvent(event);
  }
  return {
    contents,
    focus,
    focusContents,
    separator,
    submission,
    sendInputEvent,
    listeners,
    deliver,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it("does not focus the separator until the submitted Tab down/default/up has actually arrived", async () => {
  const f = fixture();
  const operation = focusThemeSeparator(f.contents, ".separator");
  await f.submission;
  expect(f.sendInputEvent.mock.calls.map(([event]) => event.type)).toEqual([
    "keyDown",
    "keyUp",
  ]);
  // Submission success alone must not let executeJavaScript overtake Tab.
  await Promise.resolve();
  expect(f.focus).not.toHaveBeenCalled();
  f.deliver("keydown");
  document.querySelector("button")!.focus(); // Tab's actual default is external.
  await Promise.resolve();
  expect(f.focus).not.toHaveBeenCalled();
  f.deliver("keyup");
  await operation;
  expect(f.focus).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(f.separator);
  expect(f.listeners.size).toBe(0);
});

it("uses the real core panel control for keyboard modality when search is hosted", async () => {
  const f = fixture();
  const operation = focusThemeSeparator(
    f.contents,
    ".separator",
    ".auxiliary-hide",
  );
  await f.submission;
  expect(f.focusContents).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(
    document.querySelector(".auxiliary-hide"),
  );
  expect(f.focus).not.toHaveBeenCalled();
  f.deliver("keydown");
  f.deliver("keyup");
  await operation;
  expect(document.activeElement).toBe(f.separator);
  expect(f.listeners.size).toBe(0);
});

it("ignores untrusted, wrong-key/modifier/repeated and release-only receipts", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const operation = focusThemeSeparator(f.contents, ".separator");
  await f.submission;
  f.deliver("keyup");
  await vi.advanceTimersByTimeAsync(25);
  expect(f.focus).not.toHaveBeenCalled();
  for (const changes of [
    { isTrusted: false },
    { key: "F6" },
    { shiftKey: false },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { repeat: true },
  ]) {
    f.deliver("keydown", changes);
    f.deliver("keyup", changes);
    // Let the real consumer poll before replacing invalid input with a valid pair.
    await vi.advanceTimersByTimeAsync(25);
    expect(f.focus).not.toHaveBeenCalled();
  }
  f.deliver("keydown");
  // An earlier release cannot acknowledge this newly consumed down.
  await vi.advanceTimersByTimeAsync(25);
  expect(f.focus).not.toHaveBeenCalled();
  f.deliver("keyup");
  await vi.advanceTimersByTimeAsync(25);
  await operation;
  expect(f.focus).toHaveBeenCalledOnce();
  expect(f.listeners.size).toBe(0);
});

it("cleans up after missing keyup within the unchanged waitFor budget without focusing", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const operation = focusThemeSeparator(f.contents, ".separator");
  const rejected = expect(operation).rejects.toThrow(
    "Timed out waiting for theme Shift-Tab consumption",
  );
  await f.submission;
  f.deliver("keydown");
  await vi.advanceTimersByTimeAsync(25_000);
  await rejected;
  expect(f.focus).not.toHaveBeenCalled();
  expect(f.listeners.size).toBe(0);
});

it("removes both owned listeners when native submission throws", async () => {
  const f = fixture();
  f.sendInputEvent.mockImplementation(() => {
    throw new Error("native submission failed");
  });
  await expect(focusThemeSeparator(f.contents, ".separator")).rejects.toThrow(
    "native submission failed",
  );
  expect(f.focus).not.toHaveBeenCalled();
  expect(f.listeners.size).toBe(0);
});
