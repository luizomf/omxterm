import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { TerminalApplication } from "../../src/main/terminal-application";
import { waitFor } from "./window-chrome-exercise";
import { explicitFixtureReadyMarker } from "./restty-host-platform";
import {
  exerciseFeatureLanguage,
  type LanguageOptions,
} from "./feature-smoke-language";
import {
  FEATURE_SMOKE_PHASE_PREFIX,
  FEATURE_SMOKE_RESULT,
  FEATURE_SMOKE_SPLIT_SCRIPT,
  FEATURE_SMOKE_SPLIT_EXPECTED,
  type FEATURE_SMOKE_PHASES,
} from "./feature-native-smoke-contract";

// Observations belong only to this one fixture scenario, never to host policy.
export function createFeatureSmoke(enabled: boolean) {
  const output: string[] = [];
  const focused = new WeakMap<BrowserWindow, string>();
  let confirmations = 0;
  return {
    enabled,
    observeOutput(index: number, data: string) {
      if (enabled) output[index] = ((output[index] ?? "") + data).slice(-4096);
    },
    trackFocus(window: BrowserWindow, select: (id: string | null) => void) {
      return (id: string | null) => {
        if (enabled) {
          if (id === null) focused.delete(window);
          else focused.set(window, id);
        }
        select(id);
      };
    },
    async confirmClose() {
      if (enabled) confirmations += 1;
      return enabled;
    },
    async run(
      options: Omit<
        FeatureSmokeOptions,
        "language" | "focused" | "output" | "paneConfirmations"
      > &
        Omit<LanguageOptions, "first">,
    ) {
      return {
        features: await exerciseFeatureSmoke({
          ...options,
          focused: (window) => focused.get(window),
          output: (index) => output[index] ?? "",
          paneConfirmations: () => confirmations,
          language: { ...options, first: options.window },
        }),
      };
    },
  };
}

const evaluateFeature = <T>(window: BrowserWindow, script: string) =>
  window.webContents.executeJavaScript(script, true) as Promise<T>;
const ready = (window: BrowserWindow) =>
  evaluateFeature(window, "globalThis.__windowChromeHostReady()");
const panes = ".terminal-tab:not([hidden]) .terminal-surface";
const geometry = (window: BrowserWindow) =>
  evaluateFeature<number[]>(
    window,
    `[...document.querySelectorAll('${panes}')].map(pane => pane.getBoundingClientRect().width)`,
  );
const focus = (window: BrowserWindow, index: number) =>
  evaluateFeature(
    window,
    `document.querySelectorAll('${panes}')[${index}].querySelector('textarea').focus()`,
  );
const input = (window: BrowserWindow, text: string) =>
  evaluateFeature(
    window,
    `(() => {
    const input = document.activeElement;
    if (!(input instanceof HTMLTextAreaElement) || !input.closest('.terminal-surface')) throw Error('Smoke input lacks focused Surface');
    input.dispatchEvent(new InputEvent('input', {data:${JSON.stringify(text)},inputType:'insertText',bubbles:true}));
    for (const type of ['keydown','keyup']) input.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',bubbles:true}));
  })()`,
  );
const phase = (name: (typeof FEATURE_SMOKE_PHASES)[number]) =>
  process.stdout.write(`${FEATURE_SMOKE_PHASE_PREFIX}${name}\n`);

interface FeatureSmokeOptions {
  readonly window: BrowserWindow;
  readonly application: TerminalApplication<BrowserWindow>;
  readonly sessions: readonly LocalTerminalSession[];
  readonly sizes: ReadonlyArray<ReadonlyArray<{ cols: number; rows: number }>>;
  readonly ended: () => number;
  readonly paneConfirmations: () => number;
  readonly output: (index: number) => string;
  readonly focused: (window: BrowserWindow) => string | undefined;
  readonly language: Parameters<typeof exerciseFeatureLanguage>[0];
}

// The native case uses the existing real renderer/host, IPC and PTYs. These
// observations never replace pane ownership, geometry, or language behavior.
async function exerciseFeatureSmoke(options: FeatureSmokeOptions) {
  const { window, application, sessions, sizes } = options;
  const evaluate = <T>(script: string) => evaluateFeature<T>(window, script);
  window.focus();
  await ready(window);
  await waitFor(
    () =>
      sessions.length === 1 &&
      (sizes[0]?.length ?? 0) > 0 &&
      !!options.focused(window) &&
      options.output(0).includes(explicitFixtureReadyMarker),
    "first owned Surface and PTY",
  );
  const firstSession = sessions[0];
  const firstId = options.focused(window);
  const fullColumns = sizes[0]!.at(-1)!.cols;
  await evaluate(
    `globalThis.featureFirstCanvas = document.querySelector('${panes} canvas');`,
  );
  application.splitSelectedPane("right");
  await waitFor(
    async () =>
      sessions.length === 2 &&
      (sizes[1]?.length ?? 0) > 0 &&
      sizes[0]!.at(-1)!.cols < fullColumns &&
      Math.abs(sizes[0]!.at(-1)!.cols - sizes[1]!.at(-1)!.cols) <= 1 &&
      options.output(1).includes(explicitFixtureReadyMarker) &&
      (await geometry(window)).length === 2 &&
      options.focused(window) !== firstId &&
      (await evaluate<boolean>(
        `[...document.querySelectorAll('${panes}')].every(pane => pane.querySelector('canvas') && pane.querySelector('textarea')) && document.querySelectorAll('${panes}')[1].contains(document.activeElement)`,
      )),
    "two adopted split panes, focused input and PTY grids",
  );
  const secondId = options.focused(window);
  assert.ok(
    secondId && secondId !== firstId,
    "Split must select the new owned session",
  );
  assert.deepEqual(
    await evaluate(FEATURE_SMOKE_SPLIT_SCRIPT),
    FEATURE_SMOKE_SPLIT_EXPECTED,
  );
  const widths = await geometry(window);
  assert.ok(
    widths.every((width) => width > 100),
    "Both real pane bounds must be usable",
  );
  assert.ok(
    Math.abs(widths[0]! - widths[1]!) <= 2,
    "Initial split must be equal",
  );
  assert.equal(
    await evaluate(
      `globalThis.featureFirstCanvas === document.querySelector('${panes} canvas')`,
    ),
    true,
  );
  await evaluate(
    `globalThis.featurePaneCanvases = [...document.querySelectorAll('${panes}')].map(pane => pane.querySelector('canvas'));`,
  );
  phase("split");

  await focus(window, 0);
  await waitFor(
    () => options.focused(window) === firstId,
    "DOM focus reaches main's first pane ownership",
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('${panes}')[0].classList.contains('pane-focused') && document.querySelectorAll('${panes}')[0].contains(document.activeElement)`,
    ),
    true,
  );
  application.focusSelectedPane("next");
  await waitFor(
    async () =>
      options.focused(window) === secondId &&
      (await evaluate<boolean>(
        `document.querySelectorAll('${panes}')[1].contains(document.activeElement)`,
      )),
    "command focus reaches second pane DOM and main ownership",
  );
  await input(window, "right-native-smoke");
  await waitFor(
    () => options.output(1).includes("__EXPLICIT_INPUT__right-native-smoke"),
    "second real child acknowledges routed input",
  );
  assert.ok(
    !options.output(0).includes("right-native-smoke"),
    "Input must not reach the other child",
  );
  phase("focus-and-input");

  const before = [sizes[0]!.at(-1)!, sizes[1]!.at(-1)!];
  await evaluate("document.querySelector('.terminal-pane-divider').focus()");
  for (let step = 0; step < 6; step += 1) {
    window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
  }
  await waitFor(async () => {
    const changed = await geometry(window);
    return (
      changed[0]! > widths[0]! + 10 &&
      changed[1]! < widths[1]! - 10 &&
      sizes[0]!.at(-1)!.cols > before[0]!.cols &&
      sizes[1]!.at(-1)!.cols < before[1]!.cols
    );
  }, "real divider changes both bounds and both native PTY grids");
  assert.equal(
    await evaluate(
      "document.activeElement === document.querySelector('.terminal-pane-divider')",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `globalThis.featurePaneCanvases.every((canvas,index) => canvas === document.querySelectorAll('${panes}')[index].querySelector('canvas'))`,
    ),
    true,
  );
  assert.equal(options.ended(), 0);
  assert.equal(sessions[0], firstSession);
  phase("divider-and-grids");

  application.focusSelectedPane("next");
  // Divider focus leaves the second logical pane selected; next selects first.
  await waitFor(
    () => options.focused(window) === firstId,
    "focus cycles through the two actual panes",
  );
  application.focusSelectedPane("next");
  await waitFor(
    () => options.focused(window) === secondId,
    "close captures the second pane",
  );
  const splitColumns = sizes[0]!.at(-1)!.cols;
  await application.closeSelectedPane();
  await waitFor(
    async () =>
      options.ended() === 1 &&
      options.focused(window) === firstId &&
      (await geometry(window)).length === 1 &&
      sizes[0]!.at(-1)!.cols > splitColumns,
    "closed child exits and surviving pane refits",
  );
  assert.equal(options.paneConfirmations(), 1);
  assert.equal(window.isDestroyed(), false);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0], firstSession);
  assert.equal(
    await evaluate(
      `globalThis.featurePaneCanvases[0] === document.querySelector('${panes} canvas') && !globalThis.featurePaneCanvases[1].isConnected`,
    ),
    true,
  );
  await waitFor(
    async () =>
      await evaluate<boolean>(
        `document.querySelector('${panes}').contains(document.activeElement)`,
      ),
    "survivor input focus restored",
  );
  await input(window, "left-native-smoke");
  await waitFor(
    () => options.output(0).includes("__EXPLICIT_INPUT__left-native-smoke"),
    "surviving real child still acknowledges input",
  );
  assert.ok(!options.output(1).includes("left-native-smoke"));
  phase("close-and-survivor");

  await exerciseFeatureLanguage(options.language);
  assert.equal(sessions.length, 3);
  assert.equal(options.ended(), 1);
  assert.equal(sessions[0], firstSession);
  phase("language-and-drafts");
  return FEATURE_SMOKE_RESULT;
}
