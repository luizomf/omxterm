import type { SupportedLanguage } from "../../src/shared/i18n.js";
import type { AliasIndex } from "./discovery.js";

const english = {
  subtitle: "OpenSSH connections",
  quick: "Quick connect",
  placeholder: "user@host:port or user@[::1]:port",
  connect: "Connect",
  aliases: "From your SSH config",
  search: "Search aliases",
  filter: "Filter the listed aliases",
  refresh: "Refresh",
  explanation:
    "Uses your current OpenSSH configuration; configured commands and forwards still apply. OpenSSH handles authentication and may update known_hosts. This incomplete, read-only alias index does not evaluate Match conditions. Use quick connect for omitted aliases. ASCII names only; IPv6 requires brackets and does not support zone identifiers.",
  opening: "Opening terminal…",
  accepted: "Terminal accepted. Authentication continues in the terminal.",
  missing:
    "OpenSSH client not found on the application PATH. Install OpenSSH or start OMXTerm with its directory on PATH.",
  unknown:
    "A terminal may already have opened; check your tabs. This request will not be retried automatically.",
  failed:
    "Unable to open a terminal. The extension or its source window/session may no longer be available.",
  invalid:
    "Invalid target. Use [user@]host[:port], at most 384 characters, ASCII names and a port from 1 to 65535. IPv6 requires a valid address in brackets without a zone identifier.",
  unavailable:
    "This host does not provide SSH Connect. Install a compatible Linux ARM64 preview host.",
  capabilities: "Host capabilities unavailable.",
  reading: "Reading aliases…",
  discovery:
    "Alias discovery is unavailable or may still be reading. Quick connect remains available; no automatic retry.",
  invalidated:
    "The discovery result was invalidated. Choose Refresh to read again.",
  incomplete: "Incomplete index",
  omitted: "Quick connect accepts omitted aliases.",
  summary: (visible: number, total: number) =>
    `${visible} of ${total} indexed aliases${total === 0 ? " — use Quick connect or Refresh" : ""}`,
  connectTo: (alias: string) => `Connect to ${alias}`,
};
type Messages = {
  [K in keyof typeof english]: (typeof english)[K] extends string
    ? string
    : (typeof english)[K];
};
const portuguese: Messages = {
  subtitle: "Conexões OpenSSH",
  quick: "Conexão rápida",
  placeholder: "usuário@host:porta ou usuário@[::1]:porta",
  connect: "Conectar",
  aliases: "Da sua configuração SSH",
  search: "Buscar aliases",
  filter: "Filtrar os aliases listados",
  refresh: "Atualizar",
  explanation:
    "Usa sua configuração atual do OpenSSH; comandos e encaminhamentos configurados continuam ativos. O OpenSSH gerencia a autenticação e pode atualizar known_hosts. Este índice incompleto e somente leitura não avalia condições Match. Use a conexão rápida para aliases omitidos. Somente nomes ASCII; IPv6 exige colchetes e não aceita identificadores de zona.",
  opening: "Abrindo terminal…",
  accepted: "Terminal aceito. A autenticação continua no terminal.",
  missing:
    "Cliente OpenSSH não encontrado no PATH do aplicativo. Instale o OpenSSH ou inicie o OMXTerm com o diretório dele no PATH.",
  unknown:
    "Um terminal pode já ter sido aberto; confira suas abas. Esta solicitação não será repetida automaticamente.",
  failed:
    "Não foi possível abrir um terminal. A extensão ou sua janela/sessão de origem pode não estar mais disponível.",
  invalid:
    "Destino inválido. Use [usuário@]host[:porta], no máximo 384 caracteres, nomes ASCII e uma porta de 1 a 65535. IPv6 exige um endereço válido entre colchetes, sem identificador de zona.",
  unavailable:
    "Este host não oferece SSH Connect. Instale uma versão de prévia compatível para Linux ARM64.",
  capabilities: "Recursos do host indisponíveis.",
  reading: "Lendo aliases…",
  discovery:
    "A descoberta de aliases está indisponível ou ainda pode estar lendo. A conexão rápida continua disponível; não há repetição automática.",
  invalidated:
    "O resultado da descoberta foi invalidado. Escolha Atualizar para ler novamente.",
  incomplete: "Índice incompleto",
  omitted: "A conexão rápida aceita aliases omitidos.",
  summary: (visible, total) =>
    `${visible} de ${total} aliases indexados${total === 0 ? " — use Conexão rápida ou Atualizar" : ""}`,
  connectTo: (alias) => `Conectar a ${alias}`,
};
export type SshNotice =
  | "opening"
  | "accepted"
  | "missing"
  | "unknown"
  | "failed"
  | "invalid"
  | "unavailable"
  | "capabilities";
export const sshMessages = (language: SupportedLanguage): Messages =>
  language === "pt-BR" ? portuguese : english;

const reasons: Record<keyof AliasIndex["reasons"], [string, string]> = {
  syntax: ["syntax", "sintaxe"],
  conditional: ["conditional", "condicional"],
  unsupported: ["unsupported", "não suportado"],
  cycle: ["cycle", "ciclo"],
  unreadable: ["unreadable", "ilegível"],
  "non-regular": ["non-regular file", "arquivo não regular"],
  "depth-limit": ["depth limit", "limite de profundidade"],
  "file-limit": ["file limit", "limite de arquivos"],
  "byte-limit": ["byte limit", "limite de bytes"],
  "line-limit": ["line limit", "limite de linhas"],
  "glob-limit": ["glob limit", "limite de padrões glob"],
  "alias-limit": ["alias limit", "limite de aliases"],
};
export function sshIndexWarning(
  counts: AliasIndex["reasons"],
  language: SupportedLanguage,
): string {
  const messages = sshMessages(language);
  const details = Object.entries(counts)
    .map(([reason, count]) => {
      const label = reasons[reason as keyof typeof reasons];
      return `${label?.[language === "pt-BR" ? 1 : 0] ?? messages.incomplete}: ${count}`;
    })
    .join("; ");
  return `${messages.incomplete} — ${details}. ${messages.omitted}`;
}
