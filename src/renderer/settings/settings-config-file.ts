import type {
  SettingsBridge,
  SettingsResult,
  SettingsSnapshot,
} from "../../shared/settings";
import type { MessageKey } from "../../shared/i18n";
import type { RendererLanguage, Translate } from "../renderer-language";
import { describeSettingsResult } from "./settings-results";

// Raw JSON keeps explicit Save. Relabeling never touches draft bytes, revision,
// selection, scroll or request generation; only actual snapshots may fill it.
export function renderConfigFile(
  document: Document,
  bridge: SettingsBridge,
  options: {
    readonly snapshot: () => SettingsSnapshot | undefined;
    readonly live: () => boolean;
    readonly adopt: (next: SettingsSnapshot) => void;
    readonly syncs: (() => void)[];
    readonly labels: ((t: Translate) => void)[];
    readonly language: RendererLanguage;
  },
): HTMLElement {
  const { snapshot, live, adopt, syncs, labels, language } = options;
  const panel = document.createElement("div");
  panel.className = "settings-panel settings-config-file";
  const location = document.createElement("p");
  location.className = "settings-path";
  const editor = document.createElement("textarea");
  editor.spellcheck = false;
  editor.setAttribute("aria-label", "config.json");
  editor.placeholder = '{\n  "version": 1\n}';
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  const save = document.createElement("button");
  save.type = "button";
  const revert = document.createElement("button");
  revert.type = "button";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  actions.append(save, revert);
  let draftRevision: string | undefined;
  let dirty = false;
  let generation = 0;
  let pending = false;
  let status:
    | { key: MessageKey }
    | { result: SettingsResult; newer: boolean }
    | undefined;
  const paint = (t: Translate) => {
    save.textContent = t("settings.save");
    revert.textContent = t("settings.reload");
    message.textContent = !status
      ? ""
      : "key" in status
        ? t(status.key)
        : describeSettingsResult(status.result, t).text +
          (status.newer ? ` ${t("settings.newer")}` : "");
  };
  labels.push(paint);
  const report = (key?: MessageKey) => {
    status = key ? { key } : undefined;
    paint(language.t);
  };
  const busy = (value: boolean) => {
    pending = value;
    save.disabled = revert.disabled = value;
  };
  const fill = () => {
    const current = snapshot();
    if (!current) return;
    location.textContent = current.configurationPath;
    if (dirty) {
      if (draftRevision !== current.revision) report("settings.stale");
      return;
    }
    editor.value = current.text ?? "";
    draftRevision = current.revision;
  };
  syncs.push(fill);
  editor.addEventListener("input", () => {
    generation += 1;
    dirty = true;
  });
  revert.addEventListener("click", () => {
    if (pending) return;
    const submitted = generation;
    busy(true);
    report("settings.reloading");
    void bridge.snapshot().then(
      (next) => {
        if (!live()) return;
        busy(false);
        if (generation === submitted) dirty = false;
        report();
        adopt(next);
      },
      () => {
        if (!live()) return;
        busy(false);
        report("settings.reloadError");
      },
    );
  });
  save.addEventListener("click", () => {
    const revision = draftRevision ?? snapshot()?.revision;
    if (!revision || pending) return;
    const submitted = generation;
    busy(true);
    report("settings.saving");
    void bridge.saveText(editor.value, revision).then(
      (result) => {
        if (!live()) return;
        busy(false);
        if (result.status === "saved") {
          dirty = generation !== submitted;
          draftRevision = result.snapshot.revision;
        }
        adopt(result.snapshot);
        status = { result, newer: result.status === "saved" && dirty };
        paint(language.t);
      },
      () => {
        if (!live()) return;
        busy(false);
        report("settings.requestError");
      },
    );
  });
  panel.append(location, editor, actions, message);
  return panel;
}
