import type { Translator } from "../../shared/i18n";
import type { SessionsBridge } from "../../shared/terminal-bridge";
import type { EndedOffer, PaneLaunch } from "../terminal-tab-model";

// OpenSSH's own wording when every offered method was refused.
const AUTHENTICATION_FAILURE =
  /Permission denied \(|Too many authentication failures/u;

// When an agent or key Saved Session fails to authenticate, its ended banner
// offers switching the session to a password typed at ssh's prompt and
// reconnecting. Other failures, Quick Connect and password sessions keep the
// plain Reconnect.
export function passwordOffer(
  sessions: Pick<SessionsBridge, "list" | "saveSession">,
  translator: Translator,
) {
  return async (
    launch: PaneLaunch,
    output: string,
  ): Promise<EndedOffer | undefined> => {
    const spec = launch.spec;
    if (spec?.kind !== "saved-session" || !AUTHENTICATION_FAILURE.test(output))
      return undefined;
    const session = (await sessions.list()).sessions.find(
      (candidate) => candidate.id === spec.id,
    );
    if (session?.kind !== "ssh" || session.authentication === "password")
      return undefined;
    return {
      message: translator.t("sessions.offer.password"),
      label: translator.t("sessions.offer.passwordAction"),
      async apply() {
        await sessions.saveSession({ ...session, authentication: "password" });
      },
    };
  };
}
