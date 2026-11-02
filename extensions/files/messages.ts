import type { SupportedLanguage } from "../../src/shared/i18n.js";

const englishPlural = new Intl.PluralRules("en-US");
const portuguesePlural = new Intl.PluralRules("pt-BR");

const english = {
  title: "Files",
  directory: "Directory",
  localFiles: "Local files",
  fileActions: "File actions",
  home: "Home",
  up: "Up",
  refresh: "Refresh",
  newFile: "New file",
  newFolder: "New folder",
  actions: "Actions…",
  go: "Go",
  homeHint: "Open the home directory",
  upHint: "Open the parent directory",
  refreshHint: "Refresh the current directory",
  newFolderHint: "Create a folder in the current directory",
  actionsHint: "Actions for the selection or current directory",
  goHint: "Open the entered directory (Enter in the address field)",
  noRootHint: "No directory is available yet",
  atRootHint: "Already at the filesystem root",
  mutationPendingHint: "A file operation is in progress",
  openDirectory: "Open directory",
  rename: "Rename / move",
  trash: "Move to Trash",
  prepareDelete: "Delete permanently…",
  delete: "Delete permanently",
  terminalDirectory: "Use terminal directory",
  apply: "Apply",
  cancel: "Cancel",
  folder: "Folder",
  link: "Link",
  readingFolder: "Reading folder…",
  emptyFolder: "Empty folder",
  truncatedFolder: "Truncated at 5,000 entries",
  readingDirectory: "Reading directory…",
  pending: "Operation in progress…",
  completed: "Operation completed.",
  refreshFailed:
    "Operation completed, but a listing could not be refreshed. Use Refresh to inspect it.",
  unknown:
    "Outcome unknown. Do not repeat the operation automatically. Refresh to inspect the directory.",
  invalidName: "Enter one file or folder name.",
  failed: (error: string) => `Operation not completed: ${error}.`,
  folderUnavailable: (error: string) => `Folder unavailable: ${error}`,
  directoryUnavailable: (error: string) => `Directory unavailable: ${error}`,
  kind: (kind: string) => (kind === "link" ? "symbolic link" : kind),
  entries: (count: number, truncated: boolean) =>
    `${count.toLocaleString("en-US")} visible ${englishPlural.select(count) === "one" ? "entry" : "entries"}${truncated ? " · Truncated at 5,000 per folder" : ""}`,
  create: (file: boolean, directory: string) =>
    `Create ${file ? "file" : "folder"} in ${directory}`,
  move: (path: string) =>
    `Rename / move ${path} to (absolute destination; never overwrite)`,
  confirmation: (path: string) =>
    `Permanently delete ${path}? This cannot be undone. Folders include their contents; symbolic links are removed without deleting their targets.`,
};
export type FilesMessages = {
  [Key in keyof typeof english]: (typeof english)[Key] extends string
    ? string
    : (typeof english)[Key];
};
const portuguese: FilesMessages = {
  title: "Files",
  directory: "Diretório",
  localFiles: "Arquivos locais",
  fileActions: "Ações de arquivos",
  home: "Pasta pessoal",
  up: "Acima",
  refresh: "Atualizar",
  newFile: "Novo arquivo",
  newFolder: "Nova pasta",
  actions: "Ações…",
  go: "Ir",
  homeHint: "Abrir a pasta pessoal",
  upHint: "Abrir o diretório superior",
  refreshHint: "Atualizar o diretório atual",
  newFolderHint: "Criar uma pasta no diretório atual",
  actionsHint: "Ações para a seleção ou o diretório atual",
  goHint: "Abrir o diretório informado (Enter no campo de endereço)",
  noRootHint: "Ainda não há um diretório disponível",
  atRootHint: "Já está na raiz do sistema de arquivos",
  mutationPendingHint: "Uma operação de arquivo está em andamento",
  openDirectory: "Abrir diretório",
  rename: "Renomear / mover",
  trash: "Mover para a Lixeira",
  prepareDelete: "Excluir permanentemente…",
  delete: "Excluir permanentemente",
  terminalDirectory: "Usar diretório do terminal",
  apply: "Aplicar",
  cancel: "Cancelar",
  folder: "Pasta",
  link: "Link",
  readingFolder: "Lendo pasta…",
  emptyFolder: "Pasta vazia",
  truncatedFolder: "Limitado a 5.000 entradas",
  readingDirectory: "Lendo diretório…",
  pending: "Operação em andamento…",
  completed: "Operação concluída.",
  refreshFailed:
    "Operação concluída, mas uma listagem não pôde ser atualizada. Use Atualizar para inspecioná-la.",
  unknown:
    "Resultado desconhecido. Não repita a operação automaticamente. Atualize para inspecionar o diretório.",
  invalidName: "Digite um único nome de arquivo ou pasta.",
  failed: (error) => `Operação não concluída: ${error}.`,
  folderUnavailable: (error) => `Pasta indisponível: ${error}`,
  directoryUnavailable: (error) => `Diretório indisponível: ${error}`,
  kind: (kind) =>
    ({
      directory: "pasta",
      file: "arquivo",
      link: "link simbólico",
      other: "outro",
    })[kind] ?? kind,
  entries: (count, truncated) =>
    `${count.toLocaleString("pt-BR")} ${portuguesePlural.select(count) === "one" ? "entrada visível" : "entradas visíveis"}${truncated ? " · Limitado a 5.000 por pasta" : ""}`,
  create: (file, directory) =>
    `Criar ${file ? "arquivo" : "pasta"} em ${directory}`,
  move: (path) =>
    `Renomear / mover ${path} para (destino absoluto; nunca sobrescrever)`,
  confirmation: (path) =>
    `Excluir ${path} permanentemente? Esta ação não pode ser desfeita. Pastas incluem seu conteúdo; links simbólicos são removidos sem excluir seus destinos.`,
};

/** Package-owned labels; paths, names and backend error codes remain literal. */
export function filesMessages(language: SupportedLanguage): FilesMessages {
  return language === "pt-BR" ? portuguese : english;
}
