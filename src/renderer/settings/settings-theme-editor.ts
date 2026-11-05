import {
  DEFAULT_TERMINAL_THEME,
  TERMINAL_THEME_COLOR_KEYS,
  isTerminalThemeColor,
  isTerminalThemeName,
  type TerminalTheme,
  type TerminalThemeColorKey,
} from "../../shared/terminal-theme";
import { isThemeDocumentSave } from "../../shared/settings-theme-documents";
import type {
  ThemeDocumentBase,
  ThemeDocumentFailure,
  ThemeDocumentOpenResult,
  SettingsThemeDocumentsBridge,
} from "../../shared/settings-theme-documents";
import { englishLanguage, type Translate } from "../renderer-language";
import {
  createSettingsThemeEditorView,
  type ThemeEditorNotice,
} from "./settings-theme-editor-view";

interface ThemeEditorOptions {
  readonly live: () => boolean;
  readonly labels: ((t: Translate) => void)[];
  readonly saved: () => void;
  readonly busyChanged: (busy: boolean) => void;
  readonly use: (path: string, settled: () => void) => void;
}

// One complete in-memory document, never reconstructed from a palette card.
// Draft paint is scoped to the specimen; configuration remains the sole live
// appearance authority. No Surface, Adapter, PTY or browser draft storage.
class SettingsThemeEditor {
  private t = englishLanguage.t;
  private active = false;
  private pending = false;
  private epoch = 0;
  private edits = 0;
  private dirty = false;
  private theme: TerminalTheme = DEFAULT_TERMINAL_THEME;
  private base: ThemeDocumentBase | undefined;
  private returnFocus: HTMLElement | undefined;
  private readonly texts = new Map<TerminalThemeColorKey, string>();
  private notice: ThemeEditorNotice | undefined;
  private readonly view: ReturnType<typeof createSettingsThemeEditorView>;

  constructor(
    private readonly document: Document,
    private readonly bridge: SettingsThemeDocumentsBridge,
    private readonly options: ThemeEditorOptions,
  ) {
    this.view = createSettingsThemeEditorView(
      document,
      options.labels,
      (busy) => options.busyChanged(busy),
    );
    options.labels.push((translate) => {
      this.t = translate;
      this.paint();
    });
    const {
      role,
      name,
      hex,
      well,
      create,
      importButton,
      save,
      copy,
      exportButton,
      cancel,
      reload,
      use,
    } = this.view;
    role.addEventListener("change", this.chooseRole);
    name.addEventListener("input", this.changed);
    hex.addEventListener("input", () => {
      const key = this.selectedRole();
      this.texts.set(key, hex.value);
      if (isTerminalThemeColor(hex.value)) {
        this.theme = {
          ...this.theme,
          colors: { ...this.theme.colors, [key]: hex.value },
        };
        well.value = hex.value;
      }
      this.changed();
    });
    const pickColor = () => {
      if (hex.value === well.value) return;
      hex.value = well.value;
      hex.dispatchEvent(new Event("input"));
    };
    well.addEventListener("input", pickColor);
    well.addEventListener("change", pickColor);
    create.addEventListener("click", () => {
      if (!this.active && !this.pending && options.live()) {
        this.returnFocus = create;
        ++this.epoch;
        this.begin({
          ...DEFAULT_TERMINAL_THEME,
          name: this.t("settings.author.newName"),
        });
      }
    });
    importButton.addEventListener("click", () =>
      this.load(() => bridge.importTheme(), importButton),
    );
    save.addEventListener("click", () => this.persist(false));
    copy.addEventListener("click", () => this.persist(true));
    exportButton.addEventListener("click", () => this.exportTheme());
    cancel.addEventListener("click", () => this.cancel());
    reload.addEventListener("click", () => {
      if (this.base && !this.pending) {
        const path = this.base.path;
        this.active = false;
        this.load(() => bridge.openTheme(path), this.returnFocus);
      }
    });
    use.addEventListener("click", () => this.useSaved());
    this.paint();
  }

  get element() {
    return this.view.element;
  }
  busy() {
    return this.active || this.pending;
  }
  edit(path: string, focus: HTMLElement) {
    this.load(() => this.bridge.openTheme(path), focus);
  }
  editBundled(focus: HTMLElement) {
    if (!this.active && !this.pending && this.options.live()) {
      this.returnFocus = focus;
      ++this.epoch;
      this.begin(DEFAULT_TERMINAL_THEME);
    }
  }

  private selectedRole() {
    return this.view.role.value as TerminalThemeColorKey;
  }
  private valid() {
    return (
      isTerminalThemeName(this.view.name.value) &&
      TERMINAL_THEME_COLOR_KEYS.every((key) =>
        isTerminalThemeColor(this.texts.get(key)),
      )
    );
  }
  private paint() {
    this.view.paint({
      t: this.t,
      active: this.active,
      pending: this.pending,
      dirty: this.dirty,
      theme: this.theme,
      base: this.base,
      notice: this.notice,
      valid: this.valid(),
      colorValid: isTerminalThemeColor(this.texts.get(this.selectedRole())),
    });
  }
  private reportFailure(result: ThemeDocumentFailure) {
    this.view.reload.hidden =
      !this.base || !["conflict", "changed"].includes(result.reason);
    this.notice = {
      key: `settings.author.error.${result.reason}`,
      severity: "error",
      ...(result.detail ? { detail: result.detail } : {}),
      recovery: !this.view.reload.hidden,
    };
  }
  private chooseRole = () => {
    this.view.hex.value = this.texts.get(this.selectedRole()) ?? "";
    this.view.well.value = this.theme.colors[this.selectedRole()];
    this.paint();
  };
  private changed = () => {
    this.edits += 1;
    this.dirty = true;
    this.notice = undefined;
    this.paint();
  };
  private begin(next: TerminalTheme, nextBase?: ThemeDocumentBase) {
    this.active = true;
    this.base = nextBase;
    this.theme = structuredClone(next);
    this.dirty = !this.base;
    this.edits = 0;
    this.view.name.value = next.name;
    this.texts.clear();
    TERMINAL_THEME_COLOR_KEYS.forEach((key) =>
      this.texts.set(key, next.colors[key]),
    );
    this.view.role.value = "background";
    this.view.filename.value = "my-theme.json";
    this.view.copyFields.hidden = !!this.base;
    this.view.reload.hidden = true;
    this.notice = undefined;
    this.chooseRole();
    if (this.document.hasFocus()) this.view.name.focus({ preventScroll: true });
  }
  private accept(result: ThemeDocumentOpenResult) {
    if (result.status === "opened") this.begin(result.theme, result.base);
    else if (result.status === "failed") this.reportFailure(result);
    else this.notice = undefined;
  }
  private load(
    read: () => Promise<ThemeDocumentOpenResult>,
    focus?: HTMLElement,
  ) {
    if (this.active || this.pending || !this.options.live()) return;
    this.returnFocus = focus;
    const request = ++this.epoch;
    this.pending = true;
    this.notice = { key: "settings.author.busy", severity: "info" };
    this.paint();
    void read()
      .then(
        (result) => {
          if (this.options.live() && request === this.epoch)
            this.accept(result);
        },
        () => {
          if (this.options.live() && request === this.epoch)
            this.notice = {
              key: "settings.author.error.read",
              severity: "error",
            };
        },
      )
      .finally(() => {
        if (this.options.live() && request === this.epoch) {
          this.pending = false;
          this.paint();
        }
      });
  }
  private snapshot(): TerminalTheme {
    return { ...this.theme, name: this.view.name.value };
  }
  private persist(asCopy: boolean) {
    if (
      !this.active ||
      this.pending ||
      !this.valid() ||
      (!asCopy && !this.base) ||
      !this.options.live()
    )
      return;
    if (asCopy && this.view.copyFields.hidden) {
      this.view.copyFields.hidden = false;
      this.view.filename.focus();
      return;
    }
    const save = {
      theme: this.snapshot(),
      target: asCopy ? { newFilename: this.view.filename.value } : this.base!,
    };
    if (!isThemeDocumentSave(save)) {
      this.reportFailure({ status: "failed", reason: "invalid" });
      this.paint();
      return;
    }
    const request = this.epoch;
    const submitted = this.edits;
    this.pending = true;
    this.notice = { key: "settings.author.busy", severity: "info" };
    this.paint();
    void this.bridge
      .saveTheme(save)
      .then(
        (result) => {
          if (!this.options.live()) return;
          if (result.status === "saved") this.options.saved();
          if (request !== this.epoch) return;
          if (result.status === "saved") {
            this.base = result.base;
            this.dirty = this.edits !== submitted;
            this.view.copyFields.hidden = true;
            this.view.reload.hidden = true;
            this.notice = {
              key: "settings.author.saved",
              severity: result.warning || this.dirty ? "warning" : "success",
              newer: this.dirty,
              cleanup: !!result.warning,
            };
          } else this.reportFailure(result);
        },
        () => {
          if (this.options.live() && request === this.epoch)
            this.notice = { key: "settings.author.unknown", severity: "error" };
        },
      )
      .finally(() => {
        if (this.options.live() && request === this.epoch) {
          this.pending = false;
          this.paint();
        }
      });
  }
  private exportTheme() {
    if (!this.active || this.pending || !this.valid() || !this.options.live())
      return;
    const request = this.epoch;
    const submitted = this.edits;
    this.pending = true;
    this.notice = { key: "settings.author.busy", severity: "info" };
    this.paint();
    void this.bridge
      .exportTheme(this.snapshot())
      .then(
        (result) => {
          if (!this.options.live() || request !== this.epoch) return;
          if (result.status === "failed") this.reportFailure(result);
          else
            this.notice =
              result.status === "cancelled"
                ? undefined
                : {
                    key: "settings.author.exported",
                    severity:
                      result.warning || this.edits !== submitted
                        ? "warning"
                        : "success",
                    newer: this.edits !== submitted,
                    cleanup: !!result.warning,
                  };
        },
        () => {
          if (this.options.live() && request === this.epoch)
            this.notice = { key: "settings.author.unknown", severity: "error" };
        },
      )
      .finally(() => {
        if (this.options.live() && request === this.epoch) {
          this.pending = false;
          this.paint();
        }
      });
  }
  private cancel() {
    ++this.epoch;
    this.active = this.pending = false;
    this.notice = undefined;
    this.paint();
    if (this.returnFocus?.isConnected && !this.returnFocus.closest("[hidden]"))
      this.returnFocus.focus({ preventScroll: true });
  }
  private useSaved() {
    if (
      !this.base ||
      this.pending ||
      this.dirty ||
      !this.valid() ||
      !this.options.live()
    )
      return;
    const request = this.epoch;
    this.pending = true;
    this.notice = undefined;
    this.paint();
    this.options.use(this.base.path, () => {
      if (this.options.live() && request === this.epoch) {
        this.pending = false;
        this.paint();
      }
    });
  }
}

export function createSettingsThemeEditor(
  document: Document,
  bridge: SettingsThemeDocumentsBridge,
  options: ThemeEditorOptions,
) {
  const editor = new SettingsThemeEditor(document, bridge, options);
  return {
    element: editor.element,
    busy: () => editor.busy(),
    edit: (path: string, focus: HTMLElement) => editor.edit(path, focus),
    editBundled: (focus: HTMLElement) => editor.editBundled(focus),
  };
}
