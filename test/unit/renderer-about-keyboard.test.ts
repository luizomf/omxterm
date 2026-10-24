// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it } from "vitest";
import { createAboutDialog } from "../../src/renderer/about/about-dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});
function setup(page: Document = document) {
  const prototype = Object.getPrototypeOf(
    page.createElement("dialog"),
  ) as HTMLDialogElement;
  prototype.showModal = HTMLDialogElement.prototype.showModal;
  prototype.close = HTMLDialogElement.prototype.close;
  const terminal = page.createElement("textarea");
  page.body.append(terminal);
  const input: string[] = [];
  const receive = (event: KeyboardEvent) => {
    if (page.activeElement === terminal)
      input.push(`${event.type}:${event.code}:${event.repeat}`);
  };
  page.defaultView!.addEventListener("keydown", receive);
  page.defaultView!.addEventListener("keyup", receive);
  const about = createAboutDialog(page, {
    info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
    openLink: async () => {},
    focusTerminal: () => terminal.focus(),
    onActivityChange: () => {},
  });
  cleanups.push(() => {
    about.dispose();
    page.defaultView!.removeEventListener("keydown", receive);
    page.defaultView!.removeEventListener("keyup", receive);
  });
  function key(type: string, name = "Escape", code = name, repeat = false) {
    const event = new KeyboardEvent(type, {
      key: name,
      code,
      repeat,
      bubbles: true,
      cancelable: true,
    });
    page.activeElement!.dispatchEvent(event);
    return event;
  }
  function dismiss(name = "Escape", code = name) {
    about.open();
    key("keydown", name, code);
    // jsdom has no native dialog/button default actions. Model their observed
    // ordering: Escape cancel / Enter click occurs before focus-changing keyup.
    if (name === "Escape")
      page
        .querySelector("dialog")!
        .dispatchEvent(new Event("cancel", { cancelable: true }));
    else page.querySelector<HTMLButtonElement>(".about-close")!.click();
    expect(page.activeElement).toBe(terminal);
  }
  return { about, terminal, input, key, dismiss };
}

it.each(["Escape", "Enter"])(
  "does not swallow a new %s press after a missed release",
  (name) => {
    const { input, key, dismiss } = setup();
    dismiss(name);
    key("keydown", name);
    key("keydown", name, name, true);
    key("keyup", name);
    expect(input).toEqual([
      `keydown:${name}:false`,
      `keydown:${name}:true`,
      `keyup:${name}:false`,
    ]);
  },
);

it.each(["blur", "dispose"])("clears outstanding ownership on %s", (reason) => {
  const { about, input, key, dismiss } = setup();
  dismiss();
  if (reason === "blur") window.dispatchEvent(new Event("blur"));
  else about.dispose();
  key("keyup");
  expect(input).toEqual(["keyup:Escape:false"]);
});

it("distinguishes the held Enter from a terminal-owned keypad Enter", () => {
  const { input, key, dismiss } = setup();
  dismiss("Enter");
  key("keydown", "Enter", "NumpadEnter");
  key("keyup", "Enter", "NumpadEnter");
  key("keydown", "Enter", "Enter", true);
  key("keyup", "Enter");
  expect(input).toEqual([
    "keydown:NumpadEnter:false",
    "keyup:NumpadEnter:false",
  ]);
});

it("keeps Space activation's native keyup default and mouse Close independent of dismissal ownership", () => {
  const { about, input, key } = setup();
  about.open();
  key("keydown", " ", "Space");
  key("keydown", " ", "Space", true);
  expect(key("keyup", " ", "Space").defaultPrevented).toBe(false);
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  expect(input).toEqual([]);
  key("keydown", " ", "Space");
  key("keyup", " ", "Space");
  about.open();
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  key("keydown", "Enter");
  key("keyup", "Enter");
  expect(input).toEqual([
    "keydown:Space:false",
    "keyup:Space:false",
    "keydown:Enter:false",
    "keyup:Enter:false",
  ]);
});

it("does not acquire Enter ownership for link activation", () => {
  const { about, input, key } = setup();
  about.open();
  document.querySelector<HTMLButtonElement>(".about-links button")!.focus();
  key("keydown", "Enter");
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  key("keyup", "Enter");
  expect(input).toEqual(["keyup:Enter:false"]);
});

it("keeps ownership and disposal independent across windows", () => {
  const first = setup();
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const second = setup(frame.contentDocument!);
  second.terminal.focus();
  second.key("keydown");
  first.dismiss();
  second.terminal.focus();
  second.key("keyup");
  expect(second.input).toEqual(["keydown:Escape:false", "keyup:Escape:false"]);
  second.dismiss("Enter");
  first.about.dispose();
  second.key("keyup", "Enter");
  expect(second.input).toHaveLength(2);
});

it.each(["Enter", "NumpadEnter"])(
  "retains Close activation with %s through release",
  (code) => {
    const { input, key, dismiss } = setup();
    dismiss("Enter", code);
    key("keydown", "Enter", code, true);
    key("keyup", "Enter", code);
    expect(input).toEqual([]);
    key("keydown", "Enter", code);
    key("keyup", "Enter", code);
    expect(input).toEqual([`keydown:${code}:false`, `keyup:${code}:false`]);
  },
);

it("retains the closing Escape repeats and release, but delivers the next terminal gesture", () => {
  const { input, key, dismiss } = setup();
  dismiss();
  key("keydown", "Escape", "Escape", true);
  key("keyup");
  expect(input).toEqual([]);
  key("keydown");
  key("keyup");
  expect(input).toEqual(["keydown:Escape:false", "keyup:Escape:false"]);
});
