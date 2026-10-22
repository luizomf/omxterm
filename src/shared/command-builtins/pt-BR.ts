// Brazilian Portuguese names, descriptions, categories and field labels for
// the built-in commands. Command text and option values are never translated.
interface CommandOverlay {
  readonly name: string;
  readonly description: string;
  readonly fields?: Readonly<Record<string, string>>;
}

const PROCESSES = "Mostra os processos que mais usam CPU.";
const PING = "Verifica se um host responde e com que rapidez.";
const TRACE = "Mostra o caminho de rede até um host.";
const LISTENING = "Mostra as portas TCP abertas para conexões.";
const DNS = "Consulta registros DNS de um nome.";
const TAIL =
  "Mostra o final de um arquivo e, se quiser, continua acompanhando.";
const ARCHIVE_FIELDS = {
  input: "Arquivo compactado",
  output: "Pasta de destino",
};
const PACKAGE_FIELDS = { action: "Ação", package: "Pacote" };

export const BUILTIN_COMMANDS_PT_BR: {
  readonly categories: Readonly<Record<string, string>>;
  readonly commands: Readonly<Record<string, CommandOverlay>>;
} = {
  categories: {
    Files: "Arquivos",
    Archives: "Compactação",
    Processes: "Processos",
    System: "Sistema",
    "Services and logs": "Serviços e logs",
    Packages: "Pacotes",
    Network: "Rede",
    SSH: "SSH",
    Git: "Git",
    Docker: "Docker",
  },
  commands: {
    builtin_find: {
      name: "Localizar Arquivos",
      description:
        "Procura arquivos por nome, tipo, tamanho, idade ou conteúdo.",
      fields: {
        path: "Pasta onde procurar",
        depth: "Procurar em subpastas",
        name: "Padrão do nome",
        type: "Tipo",
        size: "Tamanho",
        modified: "Modificado",
        content: "Contendo o texto",
      },
    },
    builtin_ls: {
      name: "Listar Arquivos",
      description: "Lista todos os arquivos da pasta atual com detalhes.",
    },
    win_list_files: {
      name: "Listar Arquivos",
      description:
        "Lista todos os arquivos, inclusive ocultos, da pasta atual.",
    },
    disk_usage: {
      name: "Tamanho da Pasta",
      description: "Mostra o tamanho total de uma pasta.",
      fields: { path: "Pasta" },
    },
    win_folder_size: {
      name: "Tamanho da Pasta",
      description: "Mostra o tamanho total de uma pasta em megabytes.",
      fields: { path: "Pasta" },
    },
    builtin_compress: {
      name: "Compactar",
      description: "Cria um arquivo compactado a partir de arquivos e pastas.",
      fields: {
        format: "Formato",
        input: "Arquivos e pastas",
        output: "Nome do arquivo compactado",
      },
    },
    builtin_extract: {
      name: "Extrair",
      description: "Extrai um arquivo tar (gz, bz2, xz e zst são detectados).",
      fields: ARCHIVE_FIELDS,
    },
    extract_zip: {
      name: "Extrair ZIP",
      description: "Extrai um arquivo ZIP.",
      fields: ARCHIVE_FIELDS,
    },
    win_compress: {
      name: "Compactar",
      description: "Cria um arquivo ZIP a partir de arquivos e pastas.",
      fields: {
        input: "Arquivo ou pasta",
        output: "Nome do arquivo compactado",
      },
    },
    win_extract: {
      name: "Extrair ZIP",
      description: "Extrai um arquivo ZIP.",
      fields: ARCHIVE_FIELDS,
    },
    top_processes: {
      name: "Processos Mais Ativos",
      description: PROCESSES,
      fields: { count: "Linhas" },
    },
    mac_top_processes: {
      name: "Processos Mais Ativos",
      description: PROCESSES,
      fields: { count: "Linhas" },
    },
    win_top_processes: {
      name: "Processos Mais Ativos",
      description: PROCESSES,
      fields: { count: "Linhas" },
    },
    kill_process: {
      name: "Encerrar Processo",
      description: "Envia um sinal a um processo pelo ID.",
      fields: { signal: "Sinal", pid: "ID do processo" },
    },
    win_kill_process: {
      name: "Encerrar Processo",
      description: "Encerra um processo pelo ID.",
      fields: { pid: "ID do processo", force: "Forçar" },
    },
    memory_linux: {
      name: "Uso de Memória",
      description: "Mostra o uso de memória e swap.",
    },
    memory_mac: {
      name: "Uso de Memória",
      description: "Mostra estatísticas de memória virtual.",
    },
    memory_windows: {
      name: "Uso de Memória",
      description: "Mostra a memória física livre e total (KB).",
    },
    disk_free: {
      name: "Espaço em Disco",
      description: "Mostra o espaço livre nos sistemas de arquivos montados.",
    },
    win_disk_free: {
      name: "Espaço em Disco",
      description: "Mostra o espaço livre de cada unidade.",
    },
    cpu_linux: {
      name: "Informações da CPU",
      description: "Mostra detalhes do processador.",
    },
    cpu_mac: {
      name: "Informações da CPU",
      description: "Mostra o modelo do processador.",
    },
    cpu_windows: {
      name: "Informações da CPU",
      description: "Mostra o modelo e os núcleos do processador.",
    },
    system_linux: {
      name: "Informações do Sistema",
      description: "Mostra o nome do host, o sistema operacional e o kernel.",
    },
    system_mac: {
      name: "Informações do Sistema",
      description: "Mostra a versão do macOS e a arquitetura.",
    },
    system_windows: {
      name: "Informações do Sistema",
      description: "Mostra a versão do Windows e um resumo do hardware.",
    },
    builtin_systemctl: {
      name: "Systemctl",
      description: "Gerencia serviços do systemd.",
      fields: {
        action: "Ação",
        service: "Serviço",
        scope: "Serviço do usuário",
      },
    },
    builtin_journalctl: {
      name: "Journalctl",
      description: "Lê os logs do systemd.",
      fields: {
        unit: "Unidade",
        follow: "Acompanhar novas entradas",
        lines: "Últimas linhas",
        priority: "Prioridade",
        since: "Desde",
      },
    },
    mac_launchctl: {
      name: "Serviços",
      description: "Lista os serviços do launchd, com filtro opcional.",
      fields: { filter: "Filtro" },
    },
    win_services: {
      name: "Serviços",
      description:
        "Lista os serviços do Windows, com filtro opcional por nome.",
      fields: { name: "Padrão do nome" },
    },
    win_events: {
      name: "Eventos do Sistema",
      description: "Mostra os eventos mais recentes do log System do Windows.",
      fields: { count: "Eventos" },
    },
    tail_file: {
      name: "Acompanhar Arquivo de Log",
      description: TAIL,
      fields: {
        file: "Arquivo",
        lines: "Últimas linhas",
        follow: "Acompanhar",
      },
    },
    win_tail_file: {
      name: "Acompanhar Arquivo de Log",
      description: TAIL,
      fields: {
        file: "Arquivo",
        lines: "Últimas linhas",
        follow: "Acompanhar",
      },
    },
    builtin_pacman: {
      name: "Pacman",
      description:
        "Instala, remove, pesquisa e atualiza pacotes do Arch Linux.",
      fields: PACKAGE_FIELDS,
    },
    apt: {
      name: "APT",
      description:
        "Instala, remove, pesquisa e atualiza pacotes do Debian ou Ubuntu.",
      fields: PACKAGE_FIELDS,
    },
    dnf: {
      name: "DNF",
      description: "Instala, remove, pesquisa e atualiza pacotes do Fedora.",
      fields: PACKAGE_FIELDS,
    },
    brew: {
      name: "Homebrew",
      description: "Instala, remove, pesquisa e atualiza pacotes do Homebrew.",
      fields: PACKAGE_FIELDS,
    },
    winget: {
      name: "winget",
      description:
        "Instala, remove, pesquisa e atualiza aplicativos do Windows.",
      fields: PACKAGE_FIELDS,
    },
    builtin_ping: {
      name: "Ping",
      description: PING,
      fields: { target: "Host", count: "Pacotes" },
    },
    win_ping: {
      name: "Ping",
      description: PING,
      fields: { target: "Host", count: "Pacotes" },
    },
    traceroute: {
      name: "Rastrear Rota",
      description: TRACE,
      fields: { target: "Host" },
    },
    win_traceroute: {
      name: "Rastrear Rota",
      description: TRACE,
      fields: { target: "Host" },
    },
    listening_linux: {
      name: "Portas em Escuta",
      description: "Mostra as portas TCP e UDP abertas para conexões.",
    },
    listening_mac: { name: "Portas em Escuta", description: LISTENING },
    listening_windows: { name: "Portas em Escuta", description: LISTENING },
    dns_lookup: {
      name: "Consulta DNS",
      description: DNS,
      fields: { name: "Nome", type: "Registro" },
    },
    win_dns_lookup: {
      name: "Consulta DNS",
      description: DNS,
      fields: { name: "Nome", type: "Registro" },
    },
    http_headers: {
      name: "Cabeçalhos HTTP",
      description: "Mostra os cabeçalhos de resposta de um endereço web.",
      fields: { url: "Endereço" },
    },
    ssh_keygen: {
      name: "Criar Chave SSH",
      description: "Cria um novo par de chaves Ed25519; será pedida uma senha.",
      fields: { comment: "Comentário", file: "Arquivo da chave" },
    },
    ssh_copy_id: {
      name: "Instalar Chave SSH em um Servidor",
      description:
        "Adiciona sua chave pública às chaves autorizadas do servidor.",
      fields: { target: "usuario@host", port: "Porta" },
    },
    git_status: {
      name: "Status do Git",
      description: "Mostra o branch e os arquivos alterados.",
    },
    git_log: {
      name: "Histórico do Git",
      description: "Mostra os commits recentes em forma de grafo.",
      fields: { count: "Commits" },
    },
    git_switch: {
      name: "Trocar de Branch",
      description: "Troca para um branch, criando-o se quiser.",
      fields: { create: "Criar o branch", branch: "Branch" },
    },
    docker_ps: {
      name: "Contêineres",
      description: "Lista os contêineres em execução, ou todos.",
      fields: { all: "Incluir contêineres parados" },
    },
    docker_logs: {
      name: "Logs do Contêiner",
      description: "Mostra os logs de um contêiner.",
      fields: {
        container: "Contêiner",
        tail: "Últimas linhas",
        follow: "Acompanhar",
      },
    },
    docker_shell: {
      name: "Shell do Contêiner",
      description: "Abre um shell interativo em um contêiner em execução.",
      fields: { container: "Contêiner", shell: "Shell" },
    },
    docker_disk: {
      name: "Uso de Disco do Docker",
      description: "Mostra o espaço usado por imagens, contêineres e volumes.",
    },
  },
};
