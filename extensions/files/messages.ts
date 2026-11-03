import type { SupportedLanguage } from "../../src/shared/i18n.js";

const englishPlural = new Intl.PluralRules("en-US");
const portuguesePlural = new Intl.PluralRules("pt-BR");

const english = {
  title: "Files",
  directory: "Directory",
  filterLoaded: "Filter loaded entries",
  filterDescription:
    "Filter names already loaded in expanded folders; collapsed folders are not searched.",
  noMatchingLoadedEntries: "No matching visible loaded entries",
  noMatchingVisibleDotfiles:
    "No matching visible loaded entries · Dotfiles hidden",
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
  actionsHint: "Actions for the selection or directory; show dotfiles",
  showDotfiles: "Show dotfiles (names starting with .)",
  shortcut: (keys: string) => `Shortcut: ${keys}`,
  goHint: "Open the entered directory (Enter in the address field)",
  noRootHint: "No directory is available yet",
  atRootHint: "Already at the filesystem root",
  mutationPendingHint: "A file operation is in progress",
  openDirectory: "Open directory",
  insertPath: "Insert path into terminal",
  insertPathPending: "Inserting path into terminal…",
  insertPathBusy:
    "A terminal input request is already in progress. Try again when it finishes.",
  insertPathUnavailable:
    "The terminal is unavailable or closed. Select a live terminal and try again.",
  insertPathIncomplete:
    "Path insertion did not complete; the terminal may have closed or paste was cancelled. Check the terminal before retrying.",
  insertPathUnknown:
    "Path insertion outcome is unknown. Check the terminal before retrying.",
  insertPathInvalid: "This path cannot be inserted: it is invalid or too long.",
  rename: "Rename / move",
  moveToFolder: "Move to folder…",
  moveFolderPrompt: (path: string) =>
    `Move ${path} into folder (absolute path; links are not folders)`,
  confirmMove: (source: string, directory: string) =>
    `Move ${source} into ${directory}? Existing entries will not be overwritten.`,
  moveAction: "Move",
  preparingMove: "Checking the source and destination…",
  reviewMove: "Review the move before confirming.",
  dropReady: (path: string) => `Drop to move into ${path}.`,
  dropInvalid: "Cannot drop here. Choose a different folder.",
  dropExternal: "Only entries dragged within Files can be moved here.",
  moveError: (error: string) =>
    ({
      "same-directory": "The entry is already in that folder.",
      "self-or-descendant":
        "A folder cannot be moved into itself or its descendants.",
      "target-not-directory":
        "The destination must be a folder, not a symbolic link.",
      "changed-entry":
        "The source or destination changed. Start the move again.",
      "expired-confirmation": "The move confirmation expired. Start again.",
      "invalid-path": "Enter an absolute local folder path.",
      conflict:
        "An entry with that name already exists. Nothing was overwritten.",
      "cross-device":
        "Moving between volumes is not supported; nothing was copied or deleted.",
      "not-found": "The source or destination no longer exists.",
      "not-directory":
        "A component of the source or destination path is not a folder.",
      permission: "Permission denied while moving the entry.",
      unsupported: "This filesystem does not support a no-overwrite move.",
    })[error] ?? `Operation not completed: ${error}.`,
  trash: "Move to Trash",
  prepareDelete: "Delete permanently…",
  delete: "Delete permanently",
  terminalDirectory: "Use last reported path",
  terminalDirectoryHint:
    "Active terminal; local folder. Unverified; may be stale or remote.",
  terminalDirectoryTooltip:
    "Open the active terminal's last reported path as a local folder. It is unverified and may be stale or come from a remote session.",
  terminalDirectoryUnavailable:
    "No local directory was reported for the active terminal. It may be remote or not report its directory. Use Home or enter a path.",
  terminalDirectoryChanged:
    "The active terminal changed or could not be confirmed. Try again.",
  terminalDirectoryBusy:
    "A terminal directory request is already in progress. Try again.",
  apply: "Apply",
  cancel: "Cancel",
  folder: "Folder",
  link: "Link",
  readingFolder: "Reading folder…",
  emptyFolder: "Empty folder",
  noVisibleEntries: "No visible entries",
  noVisibleDotfiles: "No visible entries · Dotfiles hidden",
  dotfilesHidden: "Dotfiles hidden",
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
  filterLoaded: "Filtrar entradas carregadas",
  filterDescription:
    "Filtre nomes já carregados nas pastas expandidas; pastas recolhidas não são pesquisadas.",
  noMatchingLoadedEntries: "Nenhuma entrada visível carregada corresponde",
  noMatchingVisibleDotfiles:
    "Nenhuma entrada visível carregada corresponde · Itens iniciados por ponto ocultos",
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
  actionsHint:
    "Ações para a seleção ou diretório; mostrar itens iniciados por ponto",
  showDotfiles: "Mostrar itens iniciados por ponto (.)",
  shortcut: (keys) => `Atalho: ${keys}`,
  goHint: "Abrir o diretório informado (Enter no campo de endereço)",
  noRootHint: "Ainda não há um diretório disponível",
  atRootHint: "Já está na raiz do sistema de arquivos",
  mutationPendingHint: "Uma operação de arquivo está em andamento",
  openDirectory: "Abrir diretório",
  insertPath: "Inserir caminho no terminal",
  insertPathPending: "Inserindo caminho no terminal…",
  insertPathBusy:
    "Uma solicitação de entrada no terminal já está em andamento. Tente novamente quando terminar.",
  insertPathUnavailable:
    "O terminal está indisponível ou foi fechado. Selecione um terminal ativo e tente novamente.",
  insertPathIncomplete:
    "A inserção não foi concluída; o terminal pode ter sido fechado ou a colagem cancelada. Confira o terminal antes de tentar novamente.",
  insertPathUnknown:
    "O resultado da inserção é desconhecido. Confira o terminal antes de tentar novamente.",
  insertPathInvalid:
    "Não é possível inserir este caminho: inválido ou longo demais.",
  rename: "Renomear / mover",
  moveToFolder: "Mover para pasta…",
  moveFolderPrompt: (path) =>
    `Mover ${path} para a pasta (caminho absoluto; links não são pastas)`,
  confirmMove: (source, directory) =>
    `Mover ${source} para ${directory}? Entradas existentes não serão sobrescritas.`,
  moveAction: "Mover",
  preparingMove: "Verificando a origem e o destino…",
  reviewMove: "Revise a movimentação antes de confirmar.",
  dropReady: (path) => `Solte para mover para ${path}.`,
  dropInvalid: "Não é possível soltar aqui. Escolha outra pasta.",
  dropExternal:
    "Somente entradas arrastadas dentro do Files podem ser movidas aqui.",
  moveError: (error) =>
    ({
      "same-directory": "A entrada já está nessa pasta.",
      "self-or-descendant":
        "Uma pasta não pode ser movida para si mesma ou suas subpastas.",
      "target-not-directory":
        "O destino deve ser uma pasta, não um link simbólico.",
      "changed-entry":
        "A origem ou o destino mudou. Inicie a movimentação novamente.",
      "expired-confirmation": "A confirmação expirou. Inicie novamente.",
      "invalid-path": "Digite o caminho absoluto de uma pasta local.",
      conflict: "Já existe uma entrada com esse nome. Nada foi sobrescrito.",
      "cross-device":
        "Mover entre volumes não é suportado; nada foi copiado ou excluído.",
      "not-found": "A origem ou o destino não existe mais.",
      "not-directory":
        "Um componente do caminho de origem ou destino não é uma pasta.",
      permission: "Permissão negada ao mover a entrada.",
      unsupported:
        "Este sistema de arquivos não suporta mover sem sobrescrever.",
    })[error] ?? `Operação não concluída: ${error}.`,
  trash: "Mover para a Lixeira",
  prepareDelete: "Excluir permanentemente…",
  delete: "Excluir permanentemente",
  terminalDirectory: "Usar último caminho informado",
  terminalDirectoryHint:
    "Terminal ativo; pasta local. Não verificado; pode ser antigo ou remoto.",
  terminalDirectoryTooltip:
    "Abra o último caminho informado pelo terminal ativo como pasta local. O caminho não verificado pode estar desatualizado ou vir de uma sessão remota.",
  terminalDirectoryUnavailable:
    "Nenhum diretório local foi informado pelo terminal ativo. Ele pode ser remoto ou não informar seu diretório. Use Pasta pessoal ou digite um caminho.",
  terminalDirectoryChanged:
    "O terminal ativo mudou ou não pôde ser confirmado. Tente novamente.",
  terminalDirectoryBusy:
    "Uma solicitação de diretório do terminal já está em andamento. Tente novamente.",
  apply: "Aplicar",
  cancel: "Cancelar",
  folder: "Pasta",
  link: "Link",
  readingFolder: "Lendo pasta…",
  emptyFolder: "Pasta vazia",
  noVisibleEntries: "Nenhuma entrada visível",
  noVisibleDotfiles:
    "Nenhuma entrada visível · Itens iniciados por ponto ocultos",
  dotfilesHidden: "Itens iniciados por ponto ocultos",
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
