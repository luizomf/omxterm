import type { Translator } from "../../shared/i18n";
import {
  SessionValidationError,
  validateSession,
  type SavedSessionsDocument,
  type SessionDefinition,
} from "../../shared/saved-sessions";
import type { SessionPasswordState } from "../../shared/session-ipc";
import type { FormField } from "../ui/form";
import { openModal } from "../ui/modal";
import {
  commonFields,
  localFields,
  sshFields,
  type Choose,
} from "./session-editor-fields";

export interface SessionEditorContext {
  readonly document: Document;
  readonly translator: Translator;
  readonly sessions: SavedSessionsDocument;
  readonly chooseFile: Choose;
  readonly save: (candidate: unknown) => Promise<SessionDefinition>;
  readonly passwordState: (id?: string) => Promise<SessionPasswordState>;
  readonly setPassword: (id: string, password: string | null) => Promise<void>;
}

const NO_PASSWORD_STORAGE: SessionPasswordState = {
  storage: "unavailable",
  saved: false,
};

// Opens the editor for a new or existing Saved Session. Resolves true after a
// successful save. Values are validated with the same rules main applies,
// and main validates them again before writing sessions.json.
export async function editSession(
  context: SessionEditorContext,
  existing?: SessionDefinition,
  folderId?: string,
): Promise<boolean> {
  const { document } = context;
  const t = context.translator.t.bind(context.translator);
  const common = commonFields(
    document,
    t,
    context.sessions,
    existing,
    folderId,
  );
  // Without an answer the editor still works; ssh then asks for passwords.
  const passwordState = await context
    .passwordState(existing?.id)
    .catch(() => NO_PASSWORD_STORAGE);
  const ssh = sshFields(
    document,
    t,
    existing?.kind === "ssh" ? existing : {},
    context.chooseFile,
    passwordState,
  );
  const local = localFields(
    document,
    t,
    existing?.kind === "local" ? existing : {},
    context.chooseFile,
  );
  const form = document.createElement("div");
  form.className = "omx-form session-editor";
  form.append(
    ...common.elements,
    ...ssh.elements,
    ...local.elements,
    common.fields.description!.element,
  );
  const syncKind = () => {
    const isSsh = common.kind.value === "ssh";
    for (const element of ssh.elements) element.hidden = !isSsh;
    for (const element of local.elements) element.hidden = isSsh;
  };
  common.kind.addEventListener("change", syncKind);
  syncKind();

  const fields: Record<string, FormField> = {
    ...common.fields,
    ...ssh.fields,
    ...local.fields,
  };
  const messages: Readonly<Record<string, string>> = {
    name: t("sessions.validation.name"),
    host: t("sessions.validation.host"),
    port: t("sessions.validation.port"),
    user: t("sessions.validation.user"),
    proxyJump: t("sessions.validation.host"),
    workingDirectory: t("sessions.validation.path"),
  };
  // A new session keeps its id after the first save, so a retry after a
  // keyring failure updates it instead of adding a duplicate.
  let savedId = existing?.id;
  const read = () => {
    for (const item of Object.values(fields)) item.setError(undefined);
    const base = common.read();
    const specific = common.kind.value === "ssh" ? ssh.read() : local.read();
    return base && specific ? { ...base, ...specific } : undefined;
  };
  const showError = (cause: unknown) => {
    const name = fields.name!;
    if (!(cause instanceof SessionValidationError)) {
      name.setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    const key = cause.field
      .split(".")
      .at(-1)!
      .replace(/\[\d+\]$/u, "");
    const target = fields[key] ?? name;
    target.setError(messages[key] ?? cause.message);
    const control = target.control.matches("input, textarea, select")
      ? target.control
      : target.control.querySelector<HTMLElement>("input, textarea, select");
    control?.focus();
  };

  const result = await openModal(document, {
    title: existing ? t("sessions.editTitle") : t("sessions.newTitle"),
    body: form,
    className: "session-editor-dialog",
    initialFocus: fields.name!.control,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("common.save"), value: true, kind: "primary" },
    ],
    beforeResolve: async () => {
      const values = read();
      if (!values) return false;
      const change =
        common.kind.value === "ssh"
          ? ssh.passwordChange()
          : ({ kind: "keep" } as const);
      if (!change) return false;
      const candidate = savedId ? { ...values, id: savedId } : values;
      try {
        validateSession({ id: "pending", ...candidate });
        savedId = (await context.save(candidate)).id;
      } catch (cause) {
        showError(cause);
        return false;
      }
      try {
        if (change.kind === "set")
          await context.setPassword(savedId, change.password);
        else if (change.kind === "clear")
          await context.setPassword(savedId, null);
        return true;
      } catch {
        ssh.fields.password!.setError(t("sessions.password.saveFailed"));
        return false;
      }
    },
  });
  return result === true;
}
