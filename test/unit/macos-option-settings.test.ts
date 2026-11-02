import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { optionShortcutInterpreter } from "../../src/main/macos-option-shortcut";
import { createSettingsService } from "../../src/main/settings-service";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function service(contents: string) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-option-settings-"));
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  const loadOptions = {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    platform: "darwin",
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  return {
    file,
    loadOptions,
    service: createSettingsService({
      loadOptions,
      reload: vi.fn(async () => ({ applied: true as const, notices: [] })),
    }),
  };
}

it("refuses an Option digit/keypad collision at save without rewriting the file", async () => {
  for (const [first, second] of [
    ["Alt+9", "Alt+num9"],
    ["Alt+num9", "Alt+9"],
  ]) {
    const view = await service(
      JSON.stringify({ version: 1, keybinds: { newTab: first } }),
    );
    const before = await readFile(view.file, "utf8");
    const result = await view.service.changeKeybind({
      action: "find",
      choice: { state: "custom", accelerator: second! },
    });
    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" && result.message).toContain("newTab");
    expect(await readFile(view.file, "utf8")).toBe(before);
  }
});

it("rejects a previously accepted Option digit/keypad pair through the resilient loader without changing the file", async () => {
  const view = await service(
    '{ "version": 1, "keybinds": { "newTab": "Alt+num9", "find": "Alt+9" } }\n',
  );
  const before = await readFile(view.file, "utf8");
  const loaded = await loadUserConfiguration(view.loadOptions);
  expect(loaded.fallback?.error.message).toContain("conflicts with");
  expect(loaded.configuration.keybinds.find).toBe(
    terminalDefaultKeybinds("darwin").find,
  );
  expect(await readFile(view.file, "utf8")).toBe(before);
});

const observed = [
  ["å", "KeyA", "a", "Alt+A"],
  ["ª", "Digit9", "9", "Alt+9"],
  ["‡", "KeyA", "q", "Alt+Q"],
  ["Ç", "Digit9", "9", "Alt+9"],
] as const;
it.each(
  ["none", "left", "right", "both"].flatMap((optionAsAlt) =>
    ["Left", "Right"].flatMap((side) =>
      observed.map(([glyph, code, identity, accelerator]) => ({
        optionAsAlt,
        side,
        glyph,
        code,
        identity,
        accelerator,
      })),
    ),
  ),
)(
  "records, saves and delivers $glyph with Option+$side independently of terminal mode $optionAsAlt",
  async ({ optionAsAlt, side, glyph, code, identity, accelerator }) => {
    const view = await service(
      JSON.stringify({ version: 1, keyboard: { optionAsAlt } }),
    );
    const capture = createKeybindCapture("darwin");
    const contents = Object.assign(new EventEmitter(), { send: vi.fn() });
    const invoke = vi.fn();
    let bindings = terminalDefaultKeybinds("darwin");
    const native = {
      resolve: vi.fn(
        (_handle: Buffer, actualCode: string, actualKey: string) =>
          actualCode === code && actualKey === glyph ? identity : null,
      ),
    };
    const interpret = optionShortcutInterpreter(
      { platform: "darwin", native },
      () => Buffer.alloc(8),
    );
    deliverKeybindsFromKeyEvents(
      contents,
      () => bindings,
      invoke,
      "darwin",
      capture,
      interpret,
    );
    const press = (overrides: Record<string, unknown>) => {
      const event = { preventDefault: vi.fn() };
      const input = {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        control: false,
        meta: false,
        alt: false,
        shift: false,
        isComposing: false,
        isAutoRepeat: false,
        _modifiers: 4,
        ...overrides,
      };
      contents.emit("before-input-event", event, input);
      return { event, input };
    };
    const modifier = { key: "Alt", code: `Alt${side}`, alt: true };
    const shortcut = { key: glyph, code, alt: true };
    capture.set(contents, { captureId: "option-character", active: true });
    expect(press(modifier).event.preventDefault).toHaveBeenCalledOnce();
    expect(press(shortcut).event.preventDefault).toHaveBeenCalledOnce();
    expect(contents.send).toHaveBeenCalledWith("settings:captured", {
      captureId: "option-character",
      shortcut: { accelerator },
    });
    expect(
      press({ ...shortcut, isAutoRepeat: true }).event.preventDefault,
    ).toHaveBeenCalledOnce();
    expect(
      press({ ...shortcut, type: "keyUp", isComposing: true }).event
        .preventDefault,
    ).toHaveBeenCalledOnce();
    expect(
      press({ ...modifier, type: "keyUp" }).event.preventDefault,
    ).toHaveBeenCalledOnce();
    const saved = await view.service.changeKeybind({
      action: "find",
      choice: { state: "custom", accelerator },
    });
    expect(saved.status).toBe("saved");
    const loaded = await loadUserConfiguration(view.loadOptions);
    expect(loaded.fallback).toBeUndefined();
    expect(loaded.configuration.optionKeyMode).toBe(optionAsAlt);
    bindings = loaded.configuration.keybinds;
    const delivered = press(shortcut);
    expect(delivered.event.preventDefault).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("find", delivered.input);
    expect(delivered.input.key).toBe(glyph);
    expect(native.resolve).toHaveBeenCalledTimes(2);
  },
);
