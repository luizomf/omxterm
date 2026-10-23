import {
  BUILTIN_HIGHLIGHT_CONTEXTS,
  type HighlightSettings,
} from "../../shared/highlight-settings";
import type { HighlightsBridge } from "../../shared/terminal-bridge";
import { compileRuleSet, type CompiledRuleSet } from "./highlight-rules";
import {
  createOutputHighlighter,
  type OutputHighlighter,
} from "./output-highlighter";

export interface HighlightingController {
  createHighlighter(): OutputHighlighter;
  dispose(): void;
}

// One compiled rule set per window, rebuilt when settings change. While
// highlighting is off, pane highlighters only track terminal modes.
export function createHighlightingController(
  bridge: HighlightsBridge,
): HighlightingController {
  let rules: CompiledRuleSet | undefined;
  let disposed = false;
  const apply = (settings: HighlightSettings) => {
    if (disposed) return;
    rules = settings.enabled
      ? compileRuleSet(BUILTIN_HIGHLIGHT_CONTEXTS, settings)
      : undefined;
  };
  const removeListener = bridge.onChanged(apply);
  void bridge
    .get()
    .then(apply)
    .catch(() => undefined);
  return {
    createHighlighter: () => createOutputHighlighter({ rules: () => rules }),
    dispose() {
      disposed = true;
      rules = undefined;
      removeListener();
    },
  };
}
