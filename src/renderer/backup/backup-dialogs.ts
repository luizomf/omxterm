import type { Translator } from "../../shared/i18n";
import type { BackupBridge } from "../../shared/terminal-bridge";
import { field, textInput } from "../ui/form";
import { openModal } from "../ui/modal";

const MIN_PASSPHRASE_LENGTH = 8;

// Answers File > Back Up Settings… and Restore Settings… in this window.
export function installBackupDialogs(
  document: Document,
  options: {
    readonly bridge: BackupBridge;
    readonly translator: Translator;
    readonly notify: (message: string) => void;
  },
): () => void {
  let open = false;
  const run = (flow: () => Promise<void>) => {
    if (open) return;
    open = true;
    void flow()
      .catch((cause: unknown) => options.notify(reason(cause)))
      .finally(() => {
        open = false;
      });
  };
  return options.bridge.onRequest((kind) =>
    run(() =>
      kind === "create"
        ? createBackup(document, options)
        : restoreBackup(document, options),
    ),
  );
}

async function createBackup(
  document: Document,
  options: Parameters<typeof installBackupDialogs>[1],
): Promise<void> {
  const t = options.translator.t.bind(options.translator);
  const body = form(document, t("backup.createIntro"));
  const passphrase = field(
    document,
    t("backup.passphrase"),
    textInput(document, "", { type: "password" }),
    t("backup.passphraseHint"),
  );
  const repeat = field(
    document,
    t("backup.confirmPassphrase"),
    textInput(document, "", { type: "password" }),
  );
  body.append(passphrase.element, repeat.element);
  const saved = await openModal(document, {
    title: t("backup.createTitle"),
    body,
    initialFocus: passphrase.control,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("backup.save"), value: true, kind: "primary" },
    ],
    beforeResolve: async () => {
      passphrase.setError(undefined);
      repeat.setError(undefined);
      const value = passphrase.control.value;
      if (value.length < MIN_PASSPHRASE_LENGTH) {
        passphrase.setError(t("backup.tooShort"));
        return false;
      }
      if (repeat.control.value !== value) {
        repeat.setError(t("backup.mismatch"));
        return false;
      }
      try {
        return await options.bridge.create(value);
      } catch (cause) {
        passphrase.setError(reason(cause));
        return false;
      }
    },
  });
  if (saved) options.notify(t("backup.saved"));
}

async function restoreBackup(
  document: Document,
  options: Parameters<typeof installBackupDialogs>[1],
): Promise<void> {
  const t = options.translator.t.bind(options.translator);
  if (!(await options.bridge.choose())) return;
  const body = form(document, t("backup.restoreIntro"));
  const passphrase = field(
    document,
    t("backup.passphrase"),
    textInput(document, "", { type: "password" }),
  );
  body.append(passphrase.element);
  let restored = 0;
  const done = await openModal(document, {
    title: t("backup.restoreTitle"),
    body,
    initialFocus: passphrase.control,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("backup.restore"), value: true, kind: "danger" },
    ],
    beforeResolve: async () => {
      passphrase.setError(undefined);
      try {
        ({ restored } = await options.bridge.restore(passphrase.control.value));
        return true;
      } catch (cause) {
        passphrase.setError(reason(cause));
        return false;
      }
    },
  });
  if (done) options.notify(t("backup.restored", { count: restored }));
}

function form(document: Document, intro: string): HTMLElement {
  const body = document.createElement("div");
  body.className = "omx-form backup-form";
  const paragraph = document.createElement("p");
  paragraph.className = "omx-field-hint";
  paragraph.textContent = intro;
  body.append(paragraph);
  return body;
}

// Electron prefixes errors from main with the channel; keep the reason.
function reason(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.replace(
    /^Error invoking remote method '[^']+': (?:\w*Error: )?/u,
    "",
  );
}
