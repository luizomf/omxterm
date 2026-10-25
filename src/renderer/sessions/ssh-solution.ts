import type { MessageKey, Translator } from "../../shared/i18n";
import { parseSshTarget } from "../../shared/saved-session-primitives";
import type { SessionDefinition } from "../../shared/saved-sessions";
import {
  isSshSessionReference,
  type SshSessionReference,
} from "../../shared/session-ipc";
import {
  diagnoseSshFailure,
  isUserKnownHostsFile,
  type SshFailure,
} from "../../shared/ssh-failure";
import type { SessionsBridge } from "../../shared/terminal-bridge";
import type { PaneLaunch } from "../terminal-tab-model";
import { openModal, type ModalAction } from "../ui/modal";

type Choice = "cancel" | "reconnect" | "forget" | "password";

const TITLES: Readonly<Record<SshFailure["kind"], MessageKey>> = {
  "host-key-changed": "solution.hostKeyChanged.title",
  "host-key-unverified": "solution.hostKeyUnverified.title",
  authentication: "solution.authentication.title",
  refused: "solution.refused.title",
  timeout: "solution.timeout.title",
  unreachable: "solution.unreachable.title",
  "unknown-host": "solution.unknownHost.title",
  unknown: "solution.unknown.title",
};

const BODIES: Readonly<Record<SshFailure["kind"], MessageKey>> = {
  "host-key-changed": "solution.hostKeyChanged.body",
  "host-key-unverified": "solution.hostKeyUnverified.body",
  authentication: "solution.authentication.body",
  refused: "solution.refused.body",
  timeout: "solution.timeout.body",
  unreachable: "solution.unreachable.body",
  "unknown-host": "solution.unknownHost.body",
  unknown: "solution.unknown.body",
};

// The ended banner's Solution for an SSH session that failed with ssh's
// error status: it names the cause found in the final output and offers the
// safe next step. A changed host key is never accepted for the user: the old
// key is removed only on request, after the fingerprint is shown, and ssh
// then asks about the new key in the terminal.
export function sshSolution(
  document: Document,
  sessions: Pick<SessionsBridge, "list" | "saveSession" | "forgetHostKey">,
  translator: Translator,
) {
  return (launch: PaneLaunch, output: string, reconnect: () => void): void => {
    const reference = launch.spec;
    if (!isSshSessionReference(reference)) return;
    void showSolution(
      document,
      sessions,
      translator,
      reference,
      diagnoseSshFailure(output),
    ).then((choice) => {
      if (choice !== "cancel") reconnect();
    });
  };
}

async function showSolution(
  document: Document,
  sessions: Pick<SessionsBridge, "list" | "saveSession" | "forgetHostKey">,
  translator: Translator,
  reference: SshSessionReference,
  failure: SshFailure,
): Promise<Choice> {
  const t = translator.t.bind(translator);
  const session =
    reference.kind === "saved-session"
      ? (await sessions.list().catch(() => undefined))?.sessions.find(
          (candidate) => candidate.id === reference.id,
        )
      : undefined;
  const host = displayHost(reference, session);
  const knownHostsName = hostKeyName(reference, session);
  const body = document.createElement("div");
  body.className = "ssh-solution";
  const paragraph = (text: string, className?: string) => {
    const element = document.createElement("p");
    if (className) element.className = className;
    element.textContent = text;
    body.append(element);
    return element;
  };
  paragraph(
    t(BODIES[failure.kind], {
      host,
      detail: failure.kind === "unknown" ? (failure.detail ?? "") : "",
    }),
  );
  const actions: ModalAction<Choice>[] = [];
  let canForget = false;
  if (failure.kind === "host-key-changed") {
    if (failure.fingerprint)
      paragraph(
        t("solution.hostKeyChanged.fingerprint", {
          fingerprint: failure.fingerprint,
        }),
        "ssh-solution-fingerprint",
      );
    canForget =
      failure.knownHostsFile === undefined ||
      isUserKnownHostsFile(failure.knownHostsFile);
    paragraph(
      canForget
        ? t("solution.hostKeyChanged.verify")
        : t("solution.hostKeyChanged.otherFile", {
            file: failure.knownHostsFile ?? "",
            name: knownHostsName,
          }),
    );
  }
  const canUsePassword =
    failure.kind === "authentication" &&
    session?.kind === "ssh" &&
    session.authentication !== "password";
  if (canUsePassword) paragraph(t("sessions.offer.password"));
  const status = paragraph("", "ssh-solution-status");
  status.setAttribute("role", "alert");
  actions.push({ label: t("common.cancel"), value: "cancel" });
  if (canForget)
    actions.push({
      label: t("solution.hostKeyChanged.remove"),
      value: "forget",
      kind: "danger",
    });
  else if (canUsePassword)
    actions.push({
      label: t("sessions.offer.passwordAction"),
      value: "password",
      kind: "primary",
    });
  else
    actions.push({
      label: t("sessions.reconnect"),
      value: "reconnect",
      kind: "primary",
    });
  const choice = await openModal<Choice>(document, {
    title: t(TITLES[failure.kind]),
    body,
    className: "ssh-solution-dialog",
    actions,
    beforeResolve: async (value) => {
      try {
        if (value === "forget") await sessions.forgetHostKey(reference);
        if (value === "password" && session?.kind === "ssh")
          await sessions.saveSession({
            ...session,
            authentication: "password",
          });
        return true;
      } catch {
        status.textContent =
          value === "forget"
            ? t("solution.hostKeyChanged.failed", { name: knownHostsName })
            : t("sessions.password.saveFailed");
        return false;
      }
    },
  });
  return choice ?? "cancel";
}

// user@host:port for the dialog, from the definition when there is one.
function displayHost(
  reference: SshSessionReference,
  session: SessionDefinition | undefined,
): string {
  if (session?.kind !== "ssh")
    return reference.kind === "quick-ssh" ? reference.target : "";
  const user = session.user ? `${session.user}@` : "";
  const port =
    session.port !== undefined && session.port !== 22 ? `:${session.port}` : "";
  return `${user}${session.host}${port}`;
}

// The host as ssh-keygen -R names it, for the manual instructions.
function hostKeyName(
  reference: SshSessionReference,
  session: SessionDefinition | undefined,
): string {
  const target =
    session?.kind === "ssh"
      ? { host: session.host, port: session.port }
      : reference.kind === "quick-ssh"
        ? (parseSshTarget(reference.target) ?? { host: reference.target })
        : { host: "" };
  const host = target.host.replace(/^\[(.*)\]$/u, "$1");
  return target.port !== undefined && target.port !== 22
    ? `[${host}]:${target.port}`
    : host;
}
