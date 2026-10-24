import type { Message } from "../i18n";
import type { MessageKey } from "./en-US";

// Brazilian Portuguese. Every key of the English catalog is required here, with
// the same `{name}` placeholders. Translations adapted from ruscher/omxterm PR
// #622 at b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export const brazilianPortugueseMessages: Readonly<
  Record<MessageKey, Message>
> = {
  "common.ok": "OK",
  "common.cancel": "Cancelar",
  "common.close": "Fechar",

  "menu.about": "Sobre o OMXTerm",
  "menu.quit": "Sair do {name}",
  "menu.edit": "Editar",
  "menu.copy": "Copiar",
  "menu.paste": "Colar",
  "menu.selectAll": "Selecionar Tudo",
  "menu.find": "Buscar…",
  "menu.file": "Arquivo",
  "menu.newWindow": "Nova Janela",
  "menu.newTab": "Nova Aba",
  "menu.openLocalImage": "Abrir Imagem Local…",
  "menu.closeTab": "Fechar Aba",
  "menu.closeWindow": "Fechar Janela",
  "menu.view": "Exibir",
  "menu.zoomIn": "Aumentar Zoom",
  "menu.zoomOut": "Diminuir Zoom",
  "menu.actualSize": "Tamanho Real",
  "menu.toggleSnippets": "Alternar Snippets",
  "menu.toggleTabBar": "Alternar Barra de Abas",
  "menu.toggleTitleBar": "Alternar Barra de Título",
  "menu.reloadConfiguration": "Recarregar Configuração",
  "menu.toggleDeveloperTools": "Alternar Ferramentas de Desenvolvedor",
  "menu.toggleFullScreen": "Alternar Tela Cheia",
  "menu.window": "Janela",
  "menu.minimize": "Minimizar",
  "menu.alwaysOnTop": "Sempre no Topo",
  "menu.showNextTab": "Mostrar Próxima Aba",
  "menu.showPreviousTab": "Mostrar Aba Anterior",
  "menu.selectTab": "Selecionar Aba",
  "menu.tab": "Aba {position}",

  "dialog.clipboardError.title": "Erro na Área de Transferência",
  "dialog.clipboardError.message":
    "A operação na área de transferência falhou.",
  "dialog.externalLinkError.title": "Erro ao Abrir Link",
  "dialog.externalLinkError.message": "Não foi possível abrir o link externo.",
  "dialog.protectedPaste.title": "Colagem Protegida",
  "dialog.protectedPaste.message":
    "Colar um texto que pode conter vários comandos?",
  "dialog.protectedPaste.detail":
    "O texto colado contém várias linhas ou caracteres de controle.",
  "dialog.protectedPaste.paste": "Colar",
  "dialog.quit.title": "Sair do OMXTerm",
  "dialog.quit.message":
    "Sair do OMXTerm e fechar todas as janelas de terminal?",
  "dialog.quit.detail":
    "Todas as sessões de terminal abertas serão encerradas.",
  "dialog.quit.button": "Sair",
  "dialog.closeWindow.title": "Fechar Janela",
  "dialog.closeWindow.message":
    "Fechar esta janela de terminal e todas as suas abas?",
  "dialog.closeWindow.detail":
    "Todas as sessões de terminal dela serão encerradas.",
  "dialog.closeTab.title": "Fechar Aba",
  "dialog.closeTab.message": "Fechar esta aba de terminal?",
  "dialog.closeTab.detail": "A sessão de terminal dela será encerrada.",
  "dialog.imageBaseFolder":
    "Escolha a pasta base local desta referência de imagem",
  "dialog.openLocalImage": "Abrir Imagem Local",
  "dialog.imageFilter": "Imagens PNG e JPEG",
  "dialog.allFiles": "Todos os Arquivos",

  "failure.rendering.title": "Falha na renderização do terminal",
  "failure.rendering.message":
    "O mecanismo de renderização foi perdido. A sessão de terminal foi fechada.",
  "failure.rendering.detail":
    "Reinicie o OMXTerm para criar uma nova sessão. As outras sessões não foram afetadas.",
  "failure.commandStart.title": "O comando não pôde iniciar",
  "failure.commandStart.message":
    "Não foi possível iniciar o comando solicitado.",
  "failure.shellStart.title": "O shell não pôde iniciar",
  "failure.shellStart.message": "Não foi possível iniciar o shell padrão.",
  "failure.spawnDetail": "Falha no ciclo de vida: spawn.",
  "failure.commandExit.title": "O comando terminou inesperadamente",
  "failure.commandExit.message":
    "O comando solicitado terminou inesperadamente.",
  "failure.shellExit.title": "O shell terminou inesperadamente",
  "failure.shellExit.message": "O shell padrão terminou inesperadamente.",
  "failure.signalDetail": "Sinal: {signal}.",
  "failure.unknownSignal": "desconhecido",
  "failure.start.title": "O OMXTerm não pôde iniciar",
  "failure.launchRequest": "A opção -e exige um executável.",
  "failure.rendererLoad.title": "A janela de terminal não pôde carregar",
  "failure.rendererLoad.message":
    "O OMXTerm não conseguiu carregar a interface da janela de terminal.",
  "failure.newWindow.title": "A janela de terminal não pôde abrir",
  "failure.newWindow.message":
    "O OMXTerm não conseguiu criar uma nova janela de terminal.",
  "failure.startup": "Não foi possível criar a janela de terminal inicial.",

  "notice.reloadFailed":
    "A recarga da configuração falhou. O OMXTerm manteve a última configuração válida. {detail} Corrija o arquivo e escolha Exibir -> Recarregar Configuração novamente.",
  "notice.reloadUnexpected":
    "Não foi possível carregar a configuração por causa de uma falha inesperada do aplicativo.",
  "notice.restartDeferred": {
    one: "As superfícies de terminal abertas continuam usando o valor anterior de {settings}. Reinicie o OMXTerm para aplicá-lo em todas; novas abas e janelas usam os valores validados mais recentes.",
    other:
      "As superfícies de terminal abertas continuam usando os valores anteriores de {settings}. Reinicie o OMXTerm para aplicá-los em todas; novas abas e janelas usam os valores validados mais recentes.",
  },
  "notice.and": "{first} e {second}",

  "chrome.windowControls": "Controles da janela",
  "chrome.minimize": "Minimizar",
  "chrome.maximize": "Maximizar",
  "chrome.restore": "Restaurar",
  "chrome.closeWindow": "Fechar Janela",

  "terminal.surface": "Superfície do terminal",
  "search.region": "Buscar no histórico do terminal",
  "search.placeholder": "Buscar no histórico",
  "search.clear": "Limpar",
  "search.matchAbove": "Resultado acima",
  "search.matchBelow": "Resultado abaixo",
  "search.close": "Fechar busca",

  "about.title": "Sobre o OMXTerm",
  "about.loading": "Carregando versão…",
  "about.version": "Versão {version}",
  "about.license": "Licença MIT. Fornecido sem garantia.",
  "about.project": "Projeto",
  "about.contributors": "Contribuidores",
  "about.issues": "Relatar um problema",
  "about.mitLicense": "Licença MIT",
  "about.linkError": "Não foi possível abrir o link.",
  "about.unavailable": "Informações do aplicativo indisponíveis.",

  "preview.region": "Pré-visualização de imagem local",
  "preview.closeHint": "Fechar · Esc",
  "preview.close": "Fechar a pré-visualização da imagem local",
  "preview.image": "Imagem local selecionada",
  "preview.named": "Pré-visualização de imagem local: {name}",
  "preview.errorRegion": "Erro na pré-visualização de imagem local",
  "preview.unsupported":
    "Formato de imagem não suportado. Escolha um PNG ou JPEG estático; WebP não é suportado.",
  "preview.error":
    "Não foi possível pré-visualizar esta imagem. O arquivo pode estar indisponível, ser inválido ou passar dos limites de PNG/JPEG estáticos (64 MiB, 8192 por lado, 32 milhões de pixels).",

  "panel.resize": "Redimensionar painel auxiliar",
  "panel.close": "Fechar painel auxiliar",
  "panel.tooNarrow": "Alargue a janela para abrir {view}",
  "snippets.title": "Snippets",
  "snippets.searchPlaceholder": "Buscar snippets",
  "snippets.search": "Buscar Snippets",
  "snippets.loading": "Carregando snippets…",
  "snippets.empty":
    "Nenhum snippet. Crie snippets.yaml ao lado de config.json.",
  "snippets.noMatch": "Nenhum snippet corresponde à busca.",
  "snippets.loadError":
    "Não foi possível carregar os snippets. Feche e abra Snippets de novo para tentar outra vez.",
};
