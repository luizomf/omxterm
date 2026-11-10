// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createFilesTerminalDropTarget } from "../../src/renderer/files-terminal-drop-target";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import type { TerminalTabs } from "../../src/renderer/terminal-tabs";
import {
  FILES_ENTRY_DRAG_TYPE,
  FILES_TERMINAL_DRAG_TYPE,
} from "../../src/shared/files-terminal-drag";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();
});
function fixture() {
  const area = document.createElement("main");
  document.body.append(area);
  let blocked = false;
  const language = createRendererLanguage();
  const bridge = {
    claim: vi.fn(() => true),
    handoff: vi.fn(() => new Promise<never>(() => {})),
  };
  const target = {
    live: () => true,
    isCurrent: () => true,
    deliver() {},
    onUnavailable: () => () => {},
  };
  const tabs = {
    fileDropArea: () => area,
    captureSnippetTarget: () => target,
    selectionRevision: () => 7,
  } as unknown as TerminalTabs;
  const owner = createFilesTerminalDropTarget(
    document,
    bridge,
    tabs,
    language,
    () => blocked,
  );
  cleanups.push(owner.dispose);
  const event = new Event("drop", { cancelable: true }) as DragEvent;
  const data = {
    types: [FILES_ENTRY_DRAG_TYPE, FILES_TERMINAL_DRAG_TYPE],
    files: [],
    getData: (type: string) =>
      type === FILES_ENTRY_DRAG_TYPE
        ? "1"
        : "11111111-1111-4111-8111-111111111111",
    dropEffect: "none",
  };
  Object.defineProperty(event, "dataTransfer", { value: data });
  return {
    owner,
    event,
    data,
    language,
    bridge,
    area,
    block() {
      blocked = true;
    },
  };
}
it("relabels the bounded candidate in place without claiming, recapturing or exposing a path", () => {
  const f = fixture();
  f.owner.over(f.event);
  const hint = f.area.querySelector(".files-terminal-drop-hint")!;
  expect(hint.textContent).toBe("Drop to insert path (not run)");
  f.language.set("pt-BR");
  expect(hint.textContent).toBe("Solte para inserir o caminho (sem executar)");
  expect(f.area.querySelector(".files-terminal-drop-hint")).toBe(hint);
  expect(f.bridge.claim).not.toHaveBeenCalled();
});
it("removes candidate feedback and refuses a drop while native/overlay input is blocked", () => {
  const f = fixture();
  f.owner.over(f.event);
  f.block();
  f.owner.over(f.event);
  f.owner.drop(f.event);
  expect(f.data.dropEffect).toBe("none");
  expect(f.area.children).toHaveLength(0);
  expect(f.bridge.claim).not.toHaveBeenCalled();
  expect(f.bridge.handoff).not.toHaveBeenCalled();
});
it("never retains a failed claim and bounds capture lookup to the exact single-use ticket", () => {
  const f = fixture();
  f.bridge.claim.mockReturnValueOnce(false);
  f.owner.drop(f.event);
  expect(
    f.owner.takeTarget("11111111-1111-4111-8111-111111111111"),
  ).toBeUndefined();
  f.owner.drop(f.event);
  expect(
    f.owner.takeTarget("22222222-2222-4222-8222-222222222222"),
  ).toBeUndefined();
  expect(
    f.owner.takeTarget("11111111-1111-4111-8111-111111111111"),
  ).toBeDefined();
  expect(
    f.owner.takeTarget("11111111-1111-4111-8111-111111111111"),
  ).toBeUndefined();
});
it("tells the user where they dropped when main holds no gesture for the drop", () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    f.bridge.claim.mockReturnValueOnce(false);
    f.owner.over(f.event);
    f.owner.drop(f.event);
    const hint = f.area.querySelector(".files-terminal-drop-hint")!;
    expect(hint.textContent).toBe(
      "Path not inserted. Drag it again from Files in this window.",
    );
    f.language.set("pt-BR");
    expect(hint.textContent).toBe(
      "Caminho não inserido. Arraste de novo pelo Files desta janela.",
    );
    expect(f.bridge.handoff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(f.area.children).toHaveLength(0);
    f.owner.over(f.event);
    expect(hint.textContent).toBe(
      "Solte para inserir o caminho (sem executar)",
    );
  } finally {
    vi.useRealTimers();
  }
});

it("replaces the refusal with the next drag's candidate", () => {
  const f = fixture();
  f.bridge.claim.mockReturnValueOnce(false);
  f.owner.drop(f.event);
  f.owner.over(f.event);
  const hints = f.area.querySelectorAll(".files-terminal-drop-hint");
  expect(hints).toHaveLength(1);
  expect(hints[0]!.textContent).toBe("Drop to insert path (not run)");
});
