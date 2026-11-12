import type { SupportedLanguage } from "../../src/shared/i18n.js";

const english = {
  hint: "Typing goes to every checked pane; paste stops mirroring.",
  learnMore: "Learn more",
  panes: "Panes",
  pane: (ordinal: number, title: string) => `Pane ${ordinal} · ${title}`,
  current: "Current pane",
  start: "Start mirroring",
  refresh: "Refresh",
  noPanes: "Open Mirror Typing from a tab with two or more panes.",
  refused: "Mirroring didn't start. Choose Refresh to try again.",
  unknown:
    "Mirroring may have started: mirrored panes show ↔. Choose Refresh to set it up again.",
  unavailable: "This OMXTerm version doesn't support Mirror Typing.",
};
type Messages = {
  [K in keyof typeof english]: (typeof english)[K] extends string
    ? string
    : (typeof english)[K];
};
const portuguese: Messages = {
  hint: "A digitação vai para todos os painéis marcados; colar interrompe o espelhamento.",
  learnMore: "Saiba mais",
  panes: "Painéis",
  pane: (ordinal, title) => `Painel ${ordinal} · ${title}`,
  current: "Painel atual",
  start: "Começar a espelhar",
  refresh: "Atualizar",
  noPanes: "Abra o Mirror Typing a partir de uma aba com dois ou mais painéis.",
  refused: "O espelhamento não começou. Escolha Atualizar para tentar de novo.",
  unknown:
    "O espelhamento pode ter começado: painéis espelhados mostram ↔. Escolha Atualizar para configurar de novo.",
  unavailable: "Esta versão do OMXTerm não oferece o Mirror Typing.",
};
export type MirrorNotice = "noPanes" | "refused" | "unknown" | "unavailable";
export const mirrorMessages = (language: SupportedLanguage): Messages =>
  language === "pt-BR" ? portuguese : english;
