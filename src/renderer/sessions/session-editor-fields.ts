import type { Translator } from "../../shared/i18n";
import {
  formatForward,
  parseForwardLine,
  SESSION_COLOR,
  validateSshOption,
  type LocalSessionDefinition,
  type SavedSessionsDocument,
  type SessionDefinition,
  type SshSessionDefinition,
} from "../../shared/saved-sessions";
import type {
  SessionFileChoice,
  SessionPasswordState,
} from "../../shared/session-ipc";
import {
  checkbox,
  field,
  lines,
  pathInput,
  section,
  selectInput,
  textArea,
  textInput,
  type FormField,
} from "../ui/form";
import { passwordFields, type PasswordChange } from "./session-password-field";
import { folderPath } from "./session-tree";

export type Choose = (kind: SessionFileChoice) => Promise<string | null>;

// A group of editor fields: its elements, named fields for validation
// messages, and a reader that returns values or undefined after showing an
// inline error.
export interface FieldGroup {
  readonly elements: readonly HTMLElement[];
  readonly fields: Readonly<Record<string, FormField>>;
  read(): Record<string, unknown> | undefined;
}

const DEFAULT_COLOR = "#4f8ff7";

export const optionalText = (value: string) =>
  value.trim() === "" ? undefined : value.trim();
const optionalNumber = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

export function definedEntries(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

export function commonFields(
  document: Document,
  t: Translator["t"],
  sessions: SavedSessionsDocument,
  existing: SessionDefinition | undefined,
  folderId: string | undefined,
): FieldGroup & { readonly kind: HTMLSelectElement } {
  const name = field(
    document,
    t("common.name"),
    textInput(document, existing?.name),
  );
  const kind = field(
    document,
    t("sessions.field.kind"),
    selectInput(
      document,
      [
        ["ssh", t("sessions.kind.ssh")],
        ["local", t("sessions.kind.local")],
      ],
      existing?.kind ?? "ssh",
    ),
  );
  const folder = field(
    document,
    t("sessions.folderTitle"),
    selectInput(
      document,
      [
        ["", t("sessions.noFolder")],
        ...sessions.folders.map(
          (item) => [item.id, folderPath(sessions, item.id)] as const,
        ),
      ],
      existing?.folderId ?? folderId ?? "",
    ),
  );
  const useColor = checkbox(
    document,
    t("sessions.field.color"),
    Boolean(existing?.color),
  );
  const color = textInput(document, existing?.color ?? DEFAULT_COLOR, {
    type: "color",
  });
  color.setAttribute("aria-label", t("sessions.field.color"));
  color.disabled = !useColor.input.checked;
  useColor.input.addEventListener("change", () => {
    color.disabled = !useColor.input.checked;
  });
  const colorRow = document.createElement("div");
  colorRow.className = "omx-inline";
  colorRow.append(useColor.element, color);
  const favorite = checkbox(
    document,
    t("sessions.field.favorite"),
    existing?.favorite ?? false,
  );
  const description = field(
    document,
    t("sessions.field.description"),
    textArea(document, existing?.description, 2),
  );
  return {
    kind: kind.control,
    elements: [
      name.element,
      kind.element,
      folder.element,
      colorRow,
      favorite.element,
    ],
    fields: { name, description },
    read: () => ({
      ...(existing ? { id: existing.id } : {}),
      kind: kind.control.value,
      name: name.control.value.trim(),
      ...(folder.control.value ? { folderId: folder.control.value } : {}),
      ...(useColor.input.checked && SESSION_COLOR.test(color.value)
        ? { color: color.value }
        : {}),
      ...(favorite.input.checked ? { favorite: true } : {}),
      ...definedEntries({
        description: optionalText(description.control.value),
        lastUsedAt: existing?.lastUsedAt,
      }),
    }),
  };
}

export function sshFields(
  document: Document,
  t: Translator["t"],
  ssh: Partial<SshSessionDefinition>,
  choose: Choose,
  passwordState: SessionPasswordState,
): FieldGroup & {
  passwordChange(): PasswordChange | undefined;
} {
  const host = field(
    document,
    t("sessions.field.host"),
    textInput(document, ssh.host),
  );
  const port = field(
    document,
    t("sessions.field.port"),
    textInput(document, ssh.port?.toString() ?? "", {
      type: "number",
      placeholder: "22",
    }),
  );
  const user = field(
    document,
    t("sessions.field.user"),
    textInput(document, ssh.user),
  );
  const authentication = field(
    document,
    t("sessions.field.auth"),
    selectInput(
      document,
      [
        ["agent", t("sessions.auth.agent")],
        ["key", t("sessions.auth.key")],
        ["password", t("sessions.auth.password")],
      ],
      ssh.authentication ?? "agent",
    ),
  );
  const identity = pathInput(
    document,
    ssh.identityFile ?? "",
    t("sessions.browse"),
    () => choose("identity-file"),
  );
  const identityFile = field(
    document,
    t("sessions.field.identityFile"),
    identity.element,
  );
  const password = passwordFields(
    document,
    t,
    passwordState,
    ssh.authentication,
  );
  const syncIdentity = () => {
    identityFile.setVisible(authentication.control.value === "key");
    password.sync(authentication.control.value);
  };
  authentication.control.addEventListener("change", syncIdentity);
  syncIdentity();
  const proxyJump = field(
    document,
    t("sessions.field.proxyJump"),
    textInput(document, ssh.proxyJump, { placeholder: "user@bastion:22" }),
  );
  const connection = section(document, t("sessions.section.connection"));
  connection.append(
    host.element,
    port.element,
    user.element,
    authentication.element,
    ...password.elements,
    identityFile.element,
    proxyJump.element,
  );
  const advanced = sshAdvancedFields(document, t, ssh);
  return {
    elements: [connection, ...advanced.elements],
    fields: {
      host,
      port,
      user,
      identityFile,
      proxyJump,
      password: password.field,
      ...advanced.fields,
    },
    passwordChange: () => password.change(authentication.control.value),
    read() {
      const extra = advanced.read();
      if (!extra) return undefined;
      return {
        host: host.control.value.trim(),
        authentication: authentication.control.value,
        ...definedEntries({
          port: optionalNumber(port.control.value),
          user: optionalText(user.control.value),
          identityFile:
            authentication.control.value === "key"
              ? optionalText(identity.input.value)
              : undefined,
          proxyJump: optionalText(proxyJump.control.value),
        }),
        ...extra,
      };
    },
  };
}

function sshAdvancedFields(
  document: Document,
  t: Translator["t"],
  ssh: Partial<SshSessionDefinition>,
): FieldGroup {
  const flags = {
    forwardAgent: checkbox(
      document,
      t("sessions.field.forwardAgent"),
      ssh.forwardAgent ?? false,
    ),
    x11: checkbox(document, t("sessions.field.x11"), ssh.x11 ?? false),
    compression: checkbox(
      document,
      t("sessions.field.compression"),
      ssh.compression ?? false,
    ),
    multiplex: checkbox(
      document,
      t("sessions.field.multiplex"),
      ssh.multiplex ?? true,
    ),
  };
  flags.multiplex.element.title = t("sessions.field.multiplexHint");
  const hostKeyPolicy = field(
    document,
    t("sessions.field.hostKeyPolicy"),
    selectInput(
      document,
      [
        ["ask", t("sessions.hostKey.ask")],
        ["accept-new", t("sessions.hostKey.acceptNew")],
        ["yes", t("sessions.hostKey.yes")],
      ],
      ssh.hostKeyPolicy ?? "ask",
    ),
  );
  const seconds = (label: string, value: number | undefined) =>
    field(
      document,
      label,
      textInput(document, value?.toString() ?? "", {
        type: "number",
        placeholder: "30",
      }),
    );
  const keepAlive = seconds(
    t("sessions.field.keepAlive"),
    ssh.keepAliveInterval,
  );
  const connectTimeout = seconds(
    t("sessions.field.connectTimeout"),
    ssh.connectTimeout,
  );
  const forwards = field(
    document,
    t("sessions.field.forwards"),
    textArea(document, (ssh.forwards ?? []).map(formatForward).join("\n")),
    t("sessions.field.forwardsHint"),
  );
  const remoteCommand = field(
    document,
    t("sessions.field.remoteCommand"),
    textArea(document, ssh.remoteCommand, 2),
  );
  const options = field(
    document,
    t("sessions.field.extraOptions"),
    textArea(document, (ssh.options ?? []).join("\n"), 2),
    t("sessions.field.extraOptionsHint"),
  );
  const advanced = section(document, t("sessions.section.advanced"));
  advanced.append(
    ...Object.values(flags).map((flag) => flag.element),
    hostKeyPolicy.element,
    keepAlive.element,
    connectTimeout.element,
    forwards.element,
    remoteCommand.element,
    options.element,
  );
  return {
    elements: [advanced],
    fields: {
      keepAliveInterval: keepAlive,
      connectTimeout,
      forwards,
      remoteCommand,
      options,
    },
    read() {
      const parsed = [];
      for (const [index, line] of lines(forwards.control.value).entries()) {
        const forward = parseForwardLine(line);
        if (!forward) {
          forwards.setError(
            t("sessions.validation.forward", { line: index + 1 }),
          );
          return undefined;
        }
        parsed.push(forward);
      }
      const extra = lines(options.control.value);
      const invalid = extra.findIndex((option) => {
        try {
          validateSshOption(option);
          return false;
        } catch {
          return true;
        }
      });
      if (invalid >= 0) {
        options.setError(
          t("sessions.validation.option", { line: invalid + 1 }),
        );
        return undefined;
      }
      const policy = hostKeyPolicy.control.value;
      return {
        ...definedEntries({
          keepAliveInterval: optionalNumber(keepAlive.control.value),
          connectTimeout: optionalNumber(connectTimeout.control.value),
          remoteCommand: optionalText(remoteCommand.control.value),
          hostKeyPolicy: policy === "ask" ? undefined : policy,
        }),
        ...Object.fromEntries(
          Object.entries(flags)
            .filter(([key, flag]) => key !== "multiplex" && flag.input.checked)
            .map(([key]) => [key, true]),
        ),
        // Connection sharing defaults to on, so only "off" is written.
        ...(flags.multiplex.input.checked ? {} : { multiplex: false }),
        ...(parsed.length > 0 ? { forwards: parsed } : {}),
        ...(extra.length > 0 ? { options: extra } : {}),
      };
    },
  };
}

export function localFields(
  document: Document,
  t: Translator["t"],
  local: Partial<LocalSessionDefinition>,
  choose: Choose,
): FieldGroup {
  const directory = pathInput(
    document,
    local.workingDirectory ?? "",
    t("sessions.browse"),
    () => choose("directory"),
  );
  const workingDirectory = field(
    document,
    t("sessions.field.workingDirectory"),
    directory.element,
  );
  const programPath = pathInput(
    document,
    local.program ?? "",
    t("sessions.browse"),
    () => choose("program"),
  );
  const program = field(
    document,
    t("sessions.field.shell"),
    programPath.element,
    t("sessions.field.shellHint"),
  );
  const programArguments = field(
    document,
    t("sessions.field.arguments"),
    textArea(document, (local.arguments ?? []).join("\n"), 2),
    t("sessions.field.argumentsHint"),
  );
  const initialInput = field(
    document,
    t("sessions.field.initialInput"),
    textArea(document, local.initialInput, 2),
  );
  const group = section(document, t("sessions.section.local"));
  group.append(
    workingDirectory.element,
    program.element,
    programArguments.element,
    initialInput.element,
  );
  return {
    elements: [group],
    fields: {
      workingDirectory,
      program,
      arguments: programArguments,
      initialInput,
    },
    read() {
      // Arguments are literal: keep inner whitespace, drop empty lines only.
      const argumentList = programArguments.control.value
        .split(/\r?\n/u)
        .filter((line) => line.length > 0);
      return {
        ...definedEntries({
          workingDirectory: optionalText(directory.input.value),
          program: optionalText(programPath.input.value),
          initialInput: optionalText(initialInput.control.value),
        }),
        ...(argumentList.length > 0 ? { arguments: argumentList } : {}),
      };
    },
  };
}
