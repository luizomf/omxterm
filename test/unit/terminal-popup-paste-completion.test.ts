import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { exerciseTerminalPopup } from "../fixtures/terminal-popup-native-exercise";
import { observePopupInput } from "../fixtures/terminal-popup-input-admission";
import { popupPtyObservation } from "../fixtures/terminal-popup-native-pty";
import { terminalClipboardContextMenuTemplate } from "../../src/main/application-menu";

const port = vi.hoisted(() => ({
  focused: undefined as unknown,
  paste: undefined as (() => void) | undefined,
}));
vi.mock("electron", () => ({
  BrowserWindow: { getFocusedWindow: () => port.focused },
  clipboard: { writeText() {} },
  nativeImage: {},
  screen: {},
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return {
    execFile: Object.assign(
      () => {
        throw new Error("Expected promisified command");
      },
      {
        [promisify.custom]: async (file: string, args: string[]) => {
          expect(file).toBe("/usr/bin/xdotool");
          expect(args).toEqual([
            "key",
            "--clearmodifiers",
            "Home",
            "Down",
            "Return",
          ]);
          port.paste!();
          return { stdout: "", stderr: "" };
        },
      },
    ),
  };
});
afterEach(() => {
  port.paste = undefined;
  port.focused = undefined;
});

const expected = "\u001b[200~native-paste\u001b[201~";
const checked = "CONTROL: complete initial Paste accepted";
const rejected =
  "Only the exact native popup Paste may reach the clicked child";

async function exercise(first: string, second: string, alternate = "") {
  const children = [0, 1].map(() => ({
    terminal: { hasForegroundChildProcess: () => true },
    observation: popupPtyObservation(),
    exited: false,
  }));
  for (const child of children) child.observation.observe("__POPUP_READY__\n");
  const deliver = (index: number, bytes: string) => {
    if (!bytes) return;
    children[index]!.observation.observe(
      `__POPUP_INPUT__${Buffer.from(bytes).toString("hex")}\n`,
    );
  };
  let openings = 0;
  const popups: unknown[] = [];
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    async executeJavaScript(script: string) {
      if (script.includes("contextmenu")) {
        if (++openings === 2) throw new Error(checked);
        popups.push({
          shown: true,
          menu: {
            items: terminalClipboardContextMenuTemplate({
              copy() {},
              paste() {},
              selectAll() {},
              exportText: { kind: "content", click() {} },
              closePane: { click() {}, accelerator: "Ctrl+W" },
            }),
          },
        });
      }
      if (script.includes(".length")) return 2;
      return undefined;
    },
  });
  const window = Object.assign(new EventEmitter(), {
    id: 1,
    webContents: contents,
    isDestroyed: () => false,
    isFocused: () => port.focused === window,
    focus() {
      port.focused = window;
    },
  });
  const admission = observePopupInput(window, () =>
    port.focused === window ? window : null,
  );
  const submitted: string[] = [];
  const prevented: boolean[] = [];
  let nextTurn: Promise<void> | undefined;
  port.paste = () => {
    if (alternate) deliver(0, alternate);
    deliver(1, first);
    nextTurn = new Promise<void>((resolve) => {
      setImmediate(() => {
        deliver(1, second);
        resolve();
      });
    });
  };
  const options = {
    window,
    windows: [window],
    children,
    popups,
    activationWindows: [1],
    capture: false,
    application: { splitSelectedPane() {} },
    configuration: () => ({
      language: "en-US",
      keybinds: { closePane: "Ctrl+W" },
    }),
    async admitNativeInput() {
      await admission.calibrate(async (key) => {
        submitted.push(key);
        const event = { preventDefault: vi.fn() };
        contents.emit("before-input-event", event, {
          type: "keyDown",
          key,
          code: key,
          isAutoRepeat: false,
          alt: false,
          control: false,
          meta: false,
          shift: false,
        });
        prevented.push(event.preventDefault.mock.calls.length > 0);
      });
    },
  } as unknown as Parameters<typeof exerciseTerminalPopup>[0];
  let failure: unknown;
  try {
    await exerciseTerminalPopup(options);
  } catch (error) {
    failure = error;
  } finally {
    await nextTurn;
    admission.dispose();
  }
  return {
    failure,
    openings,
    submitted,
    prevented,
    clicked: children[1]!.observation.input(),
    alternate: children[0]!.observation.input(),
  };
}

it("waits for the actual observer's complete 18+6 byte Paste across event turns before exact comparison", async () => {
  expect(Buffer.byteLength(expected)).toBe(24);
  const result = await exercise(expected.slice(0, 18), expected.slice(18));
  expect(result.failure).toBeInstanceOf(Error);
  expect(
    result.failure instanceof Error ? result.failure.message : undefined,
  ).toBe(checked);
  expect(result.openings).toBe(2);
  expect(result.submitted).toEqual(["F5", "F6"]);
  expect(result.prevented).toEqual([true, true]);
  expect(result.clicked).toBe(expected);
  expect(result.alternate).toBe("");
});

it.each([
  ["wrong closing bracket", expected.slice(0, 18), "\u001b[202~"],
  ["extra suffix", expected.slice(0, 18), `${expected.slice(18)}X`],
  ["extra prefix", `X${expected.slice(0, 18)}`, expected.slice(18)],
])(
  "still rejects contaminated accumulated bytes: %s",
  async (_name, first, second) => {
    const result = await exercise(first!, second!);
    expect(result.failure).toBeInstanceOf(Error);
    expect(
      result.failure instanceof Error ? result.failure.message : undefined,
    ).toBe(rejected);
    expect(result.openings).toBe(1);
    expect(result.alternate).toBe("");
    expect(result.clicked).not.toBe(expected);
  },
);

it("retains the empty alternate-child oracle after complete clicked-child Paste", async () => {
  const result = await exercise(expected, "", "X");
  expect(result.failure).toMatchObject({ actual: "X", expected: "" });
  expect(result.openings).toBe(1);
  expect(result.clicked).toBe(expected);
});
