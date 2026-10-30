// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createSemanticInput } from "../../src/renderer/semantic-input";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});
const snippet = { name: "Exact", body: "  $HOME\n\u0000", execute: false };
function fixture() {
  const target = {
    live: () => true,
    deliver: vi.fn(),
    onUnavailable: () => () => {},
  };
  const capture = vi.fn(() => target);
  const focus = vi.fn();
  const overlays: (() => void)[] = [];
  const input = createSemanticInput(document, {
    capture,
    blocked: () => false,
    focusTerminal: focus,
    onPreviewActivity: () => {},
    openOverlay: (open) => overlays.push(open),
  });
  cleanup.push(() => input.preview.dispose());
  return { input, target, capture, focus, overlays };
}
it("captures before asynchronous overlay admission and never follows a replacement", () => {
  const f = fixture();
  void f.input.request(snippet, "preview");
  const replacement = { ...f.target, deliver: vi.fn() };
  f.capture.mockReturnValue(replacement);
  f.overlays[0]!();
  const button = document.querySelector<HTMLButtonElement>(
    ".snippet-preview-run",
  )!;
  button.click();
  button.click();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.target.deliver).toHaveBeenCalledExactlyOnceWith(snippet.body, true);
  expect(replacement.deliver).not.toHaveBeenCalled();
});
it("revokes a pending or open choice without revoking accepted delivery", () => {
  const f = fixture();
  const pending = new AbortController();
  void f.input.request(snippet, "preview", () => false, pending.signal);
  pending.abort();
  f.overlays[0]!();
  expect(document.querySelector("dialog")).toBeNull();
  const open = new AbortController();
  const returnFocus = vi.fn(() => true);
  void f.input.request(snippet, "preview", returnFocus, open.signal);
  f.overlays[1]!();
  open.abort();
  expect(document.querySelector("dialog")).toBeNull();
  expect(returnFocus).toHaveBeenCalledOnce();
  expect(f.target.deliver).not.toHaveBeenCalled();
  const accepted = new AbortController();
  void f.input.request(snippet, "insert", returnFocus, accepted.signal);
  accepted.abort();
  expect(f.target.deliver).toHaveBeenCalledExactlyOnceWith(snippet.body, false);
});
it("disposal revokes delayed previews and subsequent immediate input", () => {
  const f = fixture();
  void f.input.request(snippet, "preview");
  f.input.preview.dispose();
  f.overlays[0]!();
  void f.input.request(snippet, "run");
  expect(document.querySelector("dialog")).toBeNull();
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.target.deliver).not.toHaveBeenCalled();
});
it("does not capture already revoked requests", () => {
  const f = fixture();
  void f.input.request(snippet, "run", () => false, AbortSignal.abort());
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.target.deliver).not.toHaveBeenCalled();
});
