import type { SupportedLanguage } from "../../src/shared/i18n.js";

const english = {
  hint: "Save this window's tabs, splits and folders, then open them again with fresh shells.",
  reopenHint:
    "Your tabs, splits and folders come back when OMXTerm starts, and you can save a window to open again later.",
  learnMore: "Learn more",
  open: "Open in a new window",
  save: "Save this window",
  replace: "Replace with this window",
  forget: "Forget",
  retry: "Try again",
  loading: "Reading…",
  empty: "Nothing saved yet",
  invalid: "The saved layout can't be used",
  invalidDetail: "Replace it with this window, or forget it.",
  summary: (tabs: number, panes: number) =>
    `${tabs} ${tabs === 1 ? "tab" : "tabs"} · ${panes} ${panes === 1 ? "pane" : "panes"}`,
  saved: (date: string) => `Saved ${date}`,
  unreported:
    "Your shell didn't report its folder, so panes reopen where they started.",
  unsupported: "This version of OMXTerm can't save or open layouts.",
  readFailed: "Couldn't read the saved layout.",
  captureFailed:
    "Couldn't save this window. It needs at least one terminal tab, and at most 16 tabs and 32 panes.",
  conflict: "Another window changed the saved layout. This is the newer one.",
  writeUnknown: "Couldn't confirm the change. This is what's saved now.",
  writeFailed: "Couldn't change the saved layout. Try again.",
  openFailed: "Couldn't open the saved layout.",
  openUnknown:
    "A new window may already be open. Check your windows before trying again.",
  fallbacks: (count: number) =>
    count === 1
      ? "1 folder no longer exists, so that pane started in your home folder."
      : `${count} folders no longer exist, so those panes started in your home folder.`,
};
type Messages = {
  [K in keyof typeof english]: (typeof english)[K] extends string
    ? string
    : (typeof english)[K];
};
const portuguese: Messages = {
  hint: "Salve as abas, divisões e pastas desta janela e abra tudo de novo com shells novos.",
  reopenHint:
    "Suas abas, divisões e pastas voltam quando o OMXTerm abre, e você pode salvar uma janela para abrir de novo depois.",
  learnMore: "Saiba mais",
  open: "Abrir em uma nova janela",
  save: "Salvar esta janela",
  replace: "Substituir por esta janela",
  forget: "Esquecer",
  retry: "Tentar de novo",
  loading: "Lendo…",
  empty: "Nada salvo ainda",
  invalid: "O layout salvo não pode ser usado",
  invalidDetail: "Substitua por esta janela ou esqueça o layout.",
  summary: (tabs, panes) =>
    `${tabs} ${tabs === 1 ? "aba" : "abas"} · ${panes} ${panes === 1 ? "painel" : "painéis"}`,
  saved: (date) => `Salvo em ${date}`,
  unreported:
    "Seu shell não informou a pasta atual, então os painéis reabrem onde começaram.",
  unsupported: "Esta versão do OMXTerm não salva nem abre layouts.",
  readFailed: "Não foi possível ler o layout salvo.",
  captureFailed:
    "Não foi possível salvar esta janela. Ela precisa de pelo menos uma aba de terminal e no máximo 16 abas e 32 painéis.",
  conflict: "Outra janela mudou o layout salvo. Este é o mais recente.",
  writeUnknown:
    "Não foi possível confirmar a mudança. Isto é o que está salvo agora.",
  writeFailed: "Não foi possível mudar o layout salvo. Tente de novo.",
  openFailed: "Não foi possível abrir o layout salvo.",
  openUnknown:
    "Uma nova janela pode já ter sido aberta. Confira suas janelas antes de tentar de novo.",
  fallbacks: (count) =>
    count === 1
      ? "1 pasta não existe mais, então esse painel abriu na sua pasta pessoal."
      : `${count} pastas não existem mais, então esses painéis abriram na sua pasta pessoal.`,
};
export type RestorationMessages = Messages;
export const restorationMessages = (
  language: SupportedLanguage,
): RestorationMessages => (language === "pt-BR" ? portuguese : english);
