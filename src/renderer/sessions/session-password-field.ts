import type { Translator } from "../../shared/i18n";
import type { SshAuthentication } from "../../shared/saved-sessions";
import {
  isSessionPassword,
  type SessionPasswordState,
} from "../../shared/session-ipc";
import { checkbox, field, textInput, type FormField } from "../ui/form";
import { icon } from "../ui/icons";

// What saving the editor does to the stored password.
export type PasswordChange =
  | { readonly kind: "keep" }
  | { readonly kind: "set"; readonly password: string }
  | { readonly kind: "clear" };

export interface PasswordFields {
  readonly elements: readonly HTMLElement[];
  readonly field: FormField;
  // Shows or hides the fields for the chosen authentication.
  sync(authentication: string): void;
  // undefined after showing an inline error.
  change(authentication: string): PasswordChange | undefined;
}

// The Password authentication's fields: a hidden password with a show/hide
// toggle, and "typed when prompted" for not storing one. A stored password
// is never shown again; the field then only replaces it. Without a secure
// keyring (or askpass support) storing is unavailable and ssh asks instead.
export function passwordFields(
  document: Document,
  t: Translator["t"],
  state: SessionPasswordState,
  current: SshAuthentication | undefined,
): PasswordFields {
  const input = textInput(document, "", {
    type: "password",
    ...(state.saved
      ? { placeholder: t("sessions.password.savedPlaceholder") }
      : {}),
  });
  input.autocomplete = "new-password";
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "omx-icon-button omx-password-reveal";
  const syncReveal = () => {
    const shown = input.type === "text";
    const label = t(
      shown ? "sessions.password.hide" : "sessions.password.show",
    );
    reveal.replaceChildren(icon(document, shown ? "eyeOff" : "eye"));
    reveal.setAttribute("aria-label", label);
    reveal.setAttribute("aria-pressed", String(shown));
    reveal.title = label;
  };
  reveal.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    syncReveal();
    input.focus();
  });
  syncReveal();
  const wrapper = document.createElement("div");
  wrapper.className = "omx-password-input";
  wrapper.append(input, reveal);
  const canStore = state.storage === "available";
  const password = field(
    document,
    t("sessions.field.password"),
    wrapper,
    canStore
      ? undefined
      : t(
          state.storage === "unsupported"
            ? "sessions.password.unsupported"
            : "sessions.password.noKeyring",
        ),
  );
  const prompt = checkbox(
    document,
    t("sessions.password.prompt"),
    !canStore || (current === "password" && !state.saved),
  );
  prompt.input.disabled = !canStore;
  const syncPrompt = () => {
    const typed = !prompt.input.checked;
    input.disabled = !typed;
    reveal.disabled = !typed;
    if (!typed) {
      input.value = "";
      input.type = "password";
      syncReveal();
      password.setError(undefined);
    }
  };
  prompt.input.addEventListener("change", syncPrompt);
  syncPrompt();
  return {
    elements: [password.element, prompt.element],
    field: password,
    sync(authentication) {
      const visible = authentication === "password";
      password.setVisible(visible);
      prompt.element.hidden = !visible;
    },
    change(authentication) {
      const clear = { kind: state.saved ? "clear" : "keep" } as const;
      if (authentication !== "password" || prompt.input.checked) return clear;
      if (input.value === "") {
        if (state.saved) return { kind: "keep" };
        password.setError(t("sessions.validation.password"));
        input.focus();
        return undefined;
      }
      if (!isSessionPassword(input.value)) {
        password.setError(t("sessions.validation.passwordText"));
        input.focus();
        return undefined;
      }
      return { kind: "set", password: input.value };
    },
  };
}
