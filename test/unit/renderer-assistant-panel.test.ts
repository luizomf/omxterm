// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAssistantPanel } from "../../src/renderer/assistant/assistant-panel";
import { createTranslator } from "../../src/shared/i18n";
import {
  DEFAULT_ASSISTANT_SETTINGS,
  type AssistantEvent,
  type AssistantMessage,
  type AssistantState,
} from "../../src/shared/assistant";
import type { AssistantBridge } from "../../src/shared/terminal-bridge";

const flush = async () => {
  for (let count = 0; count < 5; count += 1)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

function bridge(enabled: boolean, saved: AssistantMessage[] = []) {
  let emit: ((event: AssistantEvent) => void) | undefined;
  const state: AssistantState = {
    settings: { ...DEFAULT_ASSISTANT_SETTINGS, enabled },
    keys: { groq: true },
    keyStorage: true,
  };
  const fake = {
    state: vi.fn(async () => state),
    saveSettings: vi.fn(async () => state),
    setKey: vi.fn(async () => state),
    models: vi.fn(async () => []),
    test: vi.fn(async () => 0),
    openKeyPage: vi.fn(async () => {}),
    chat: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    history: vi.fn(async () => saved),
    saveHistory: vi.fn(async () => {}),
    onEvent: (listener: (event: AssistantEvent) => void) => {
      emit = listener;
      return () => {};
    },
    onChanged: () => () => {},
    onToggle: () => () => {},
  } satisfies AssistantBridge;
  return { fake, emit: (event: AssistantEvent) => emit?.(event) };
}

function mount(fake: AssistantBridge, selection = "") {
  const typed: [string, boolean][] = [];
  const openPreferences = vi.fn();
  const notify = vi.fn();
  const panel = createAssistantPanel(document, {
    translator: createTranslator("en"),
    bridge: fake,
    notify,
    typeInTerminal: (text, submit) => typed.push([text, submit]),
    copyText: vi.fn(),
    selection: () => selection,
    openPreferences,
  });
  document.body.append(panel.element);
  panel.activate();
  return { panel, typed, openPreferences, notify };
}

const ask = (text: string) => {
  const input =
    document.querySelector<HTMLTextAreaElement>(".assistant-input")!;
  input.value = text;
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("assistant panel", () => {
  it("sends nothing while the assistant is off", async () => {
    const { fake } = bridge(false);
    const { openPreferences } = mount(fake);
    await flush();
    expect(document.querySelector<HTMLElement>(".assistant-on")!.hidden).toBe(
      true,
    );
    document.querySelector<HTMLButtonElement>(".assistant-off button")!.click();
    expect(openPreferences).toHaveBeenCalledOnce();
    expect(fake.chat).not.toHaveBeenCalled();
  });

  it("streams an answer and offers its commands", async () => {
    const { fake, emit } = bridge(true);
    const { typed } = mount(fake);
    await flush();
    expect(document.querySelector(".assistant-notice")!.textContent).toBe(
      "Messages are sent to Groq · llama-3.1-8b-instant.",
    );
    ask("list hidden files");
    await flush();
    const [requestId, messages] = fake.chat.mock.calls[0]! as unknown as [
      string,
      AssistantMessage[],
    ];
    expect(messages).toEqual([{ role: "user", content: "list hidden files" }]);
    emit({ requestId, type: "delta", text: "Use:\n```sh\nls -" });
    expect(document.querySelector(".assistant-code pre")!.textContent).toBe(
      "ls -",
    );
    expect(document.querySelector(".assistant-command-actions")).toBeNull();
    emit({ requestId, type: "delta", text: "la\n```\nDone." });
    emit({ requestId, type: "done" });
    await flush();
    expect(fake.saveHistory).toHaveBeenLastCalledWith([
      { role: "user", content: "list hidden files" },
      { role: "assistant", content: "Use:\n```sh\nls -la\n```\nDone." },
    ]);
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        ".assistant-command-actions button",
      ),
    ];
    buttons.find((button) => button.textContent === "Insert")!.click();
    expect(typed).toEqual([["ls -la", false]]);

    buttons.find((button) => button.textContent === "Run")!.click();
    await flush();
    expect(document.querySelector(".omx-modal p")!.textContent).toBe("ls -la");
    expect(typed).toHaveLength(1);
    document.querySelector<HTMLButtonElement>(".omx-button-danger")!.click();
    await flush();
    expect(typed.at(-1)).toEqual(["ls -la", true]);
  });

  it("includes the terminal selection only when asked", async () => {
    const { fake } = bridge(true);
    const { notify } = mount(fake, "");
    await flush();
    const include = document.querySelector<HTMLInputElement>(
      ".assistant-actions input[type=checkbox]",
    )!;
    include.checked = true;
    ask("explain");
    expect(notify).toHaveBeenCalledWith(
      "Select text in the terminal first, or uncheck the option.",
    );
    expect(fake.chat).not.toHaveBeenCalled();
    document.body.replaceChildren();

    const second = bridge(true);
    mount(second.fake, "permission denied");
    await flush();
    document.querySelector<HTMLInputElement>(
      ".assistant-actions input[type=checkbox]",
    )!.checked = true;
    ask("explain");
    await flush();
    const [, messages] = second.fake.chat.mock.calls[0]! as unknown as [
      string,
      AssistantMessage[],
    ];
    expect(messages[0]!.content).toBe(
      "Terminal selection:\n```\npermission denied\n```\n\nexplain",
    );
  });

  it("shows errors and keeps the conversation usable", async () => {
    const { fake, emit } = bridge(true, [
      { role: "user", content: "earlier" },
      { role: "assistant", content: "answer" },
    ]);
    mount(fake);
    await flush();
    expect(document.querySelectorAll(".assistant-message")).toHaveLength(2);
    ask("again");
    await flush();
    const [requestId] = fake.chat.mock.calls[0]! as unknown as [string];
    emit({ requestId, type: "error", message: "Groq did not answer in time." });
    expect(
      document.querySelector(".assistant-message.error")!.textContent,
    ).toBe("The assistant request failed: Groq did not answer in time.");
    document
      .querySelector<HTMLButtonElement>(
        ".assistant-actions .omx-button-default",
      )!
      .click();
    expect(document.querySelectorAll(".assistant-message")).toHaveLength(0);
    expect(fake.saveHistory).toHaveBeenLastCalledWith([]);
  });
});
