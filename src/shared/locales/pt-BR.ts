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

  "menu.settings": "Configurações…",
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
  "dialog.closeTab.detail":
    "Todas as sessões de terminal dela serão encerradas.",
  "dialog.closePane.title": "Fechar Painel",
  "dialog.closePane.message": "Fechar este painel de terminal?",
  "dialog.closePane.detail": "A sessão de terminal dele será encerrada.",
  "menu.pane": "Painel",
  "menu.splitRight": "Dividir à Direita",
  "menu.splitDown": "Dividir Abaixo",
  "menu.closePane": "Fechar Painel",
  "menu.focusNextPane": "Focar Próximo Painel",
  "menu.focusPreviousPane": "Focar Painel Anterior",
  "menu.focusPaneLeft": "Focar Painel à Esquerda",
  "menu.focusPaneRight": "Focar Painel à Direita",
  "menu.focusPaneAbove": "Focar Painel Acima",
  "menu.focusPaneBelow": "Focar Painel Abaixo",
  "menu.equalizePanes": "Igualar Painéis",
  "pane.resize": "Redimensionar painéis",
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
  "terminal.tabs": "Abas do terminal",
  "terminal.userFileErrors": "Erros nos arquivos do usuário",
  "terminal.surfaceFailure": "Falha na superfície do terminal",
  "terminal.initializationFailure":
    "Falha ao inicializar a superfície do terminal do OMXTerm: {detail}",
  "terminal.backendLost":
    "O backend de renderização da superfície do terminal do OMXTerm foi perdido",
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
  "panel.width": "{width} pixels de largura",
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
  "snippets.insert": "Inserir",
  "snippets.run": "Executar · adiciona Enter",
  "snippets.preview": "Pré-visualizar",
  "snippets.previewNamed": "Pré-visualizar {name}",
  "snippetPreview.body": "Conteúdo do snippet",
  "snippetPreview.insert": "Inserir — sem adicionar Enter",
  "snippetPreview.run": "Executar — adiciona Enter",
  "snippetPreview.unavailable":
    "O terminal deste snippet foi encerrado. Nada será enviado.",

  "settings.title": "Configurações",
  "settings.page.general": "Geral",
  "settings.page.appearance": "Aparência",
  "settings.page.terminal": "Terminal",
  "settings.page.window": "Novas Janelas",
  "settings.page.file": "Arquivo de Configuração",
  "settings.language": "Idioma",
  "settings.english": "English (United States)",
  "settings.portuguese": "Português (Brasil)",
  "settings.confirmClose": "Confirmar antes de fechar sessões ocupadas",
  "settings.logLevel": "Nível de registro",
  "settings.errors": "Somente erros",
  "settings.info": "Informações",
  "settings.debug": "Depuração",
  "settings.shell": "Executável do shell",
  "settings.fontFamily": "Família da fonte",
  "settings.fontSize": "Tamanho da fonte",
  "settings.lineHeight": "Altura da linha",
  "settings.ligatures": "Ligaduras de programação",
  "settings.theme": "Arquivo de tema",
  "settings.bundledFont": "FiraCode Nerd Font Mono incluída",
  "settings.bundledTheme": "omtheme incluído",
  "settings.defaultShell": "Windows PowerShell",
  "settings.scrollback": "Linhas de histórico",
  "settings.padding.top": "Espaçamento superior",
  "settings.padding.right": "Espaçamento direito",
  "settings.padding.bottom": "Espaçamento inferior",
  "settings.padding.left": "Espaçamento esquerdo",
  "settings.optionAlt": "Tecla Option funciona como Alt",
  "settings.option.none": "Nenhuma",
  "settings.option.left": "Option esquerda",
  "settings.option.right": "Option direita",
  "settings.option.both": "Ambas",
  "settings.titleBar": "Mostrar barra de título",
  "settings.tabBar": "Mostrar barra de abas",
  "settings.alwaysOnTop": "Sempre no topo",
  "settings.range": "Fora do intervalo",
  "settings.loading": "Carregando configurações…",
  "settings.loadError": "Não foi possível carregar as configurações.",
  "settings.saving": "Salvando…",
  "settings.requestError": "Não salvo: a solicitação falhou.",
  "settings.fileGuidance":
    "{problem}. Alterações gráficas são verificadas no arquivo inteiro; corrija aqui ou na página Arquivo de Configuração.",
  "settings.saved": "Salvo.",
  "settings.notApplied":
    "Salvo em config.json, mas não foi possível aplicar: {notice}",
  "settings.lifetime.tabs": "Novas abas usam o valor.",
  "settings.lifetime.windows": "O valor se aplica a novas janelas.",
  "settings.lifetime.restart":
    "Novas abas usam o valor; reinicie o OMXTerm para aplicar às abas abertas.",
  "settings.save": "Salvar",
  "settings.reload": "Recarregar Arquivo",
  "settings.reloading": "Recarregando…",
  "settings.reloadError":
    "Não foi possível recarregar o arquivo. Seu rascunho foi mantido.",
  "settings.stale":
    "config.json mudou desde que você começou a editar. Seu rascunho foi mantido; o salvamento será recusado até recarregar o arquivo.",
  "settings.newer": "As edições mais recentes não foram salvas.",
  "settings.readError": "não foi possível ler config.json",
  "settings.utf8Error": "config.json não é UTF-8 válido",
  "settings.jsonError": "config.json não é JSON válido",
  "settings.objectError": "config.json deve conter um objeto",
  "settings.symlinkError":
    "config.json é um link simbólico. Edite o destino manualmente e recarregue a Configuração do Usuário; Configurações não grava através de links simbólicos.",
  "settings.conflict":
    "config.json mudou desde o início desta edição. Copie seu rascunho, recarregue o arquivo e reaplique suas alterações.",
  "settings.writeError":
    "Não foi possível gravar config.json. Nada foi alterado.",
  "settings.applicationError":
    "Falha inesperada ao aplicar. Algumas configurações podem já estar ativas; escolha Exibir -> Recarregar Configuração novamente.",
  "menu.exportSelection": "Exportar Seleção…",
  "menu.exportContent": "Exportar Conteúdo do Terminal…",
  "export.title.selection": "Exportar Seleção",
  "export.title.content": "Exportar Conteúdo do Terminal",
  "export.empty.selection": "A seleção não tem texto para exportar.",
  "export.empty.content": "O terminal não tem texto para exportar.",
  "export.overLimit.selection":
    "A seleção é maior que o limite de exportação de {limit} MiB. Nada foi salvo.",
  "export.overLimit.content":
    "O conteúdo do terminal é maior que o limite de exportação de {limit} MiB. Nada foi salvo.",
  "export.overLimit.selectionDetail":
    "Selecione menos texto e exporte de novo.",
  "export.overLimit.contentDetail":
    "Selecione parte da saída e escolha Exportar Seleção.",
  "export.failed": "Falha na Exportação",
  "export.dialogError":
    "O OMXTerm não conseguiu abrir o diálogo de salvar. Nada foi salvo.",
  "export.writeError": "O OMXTerm não conseguiu salvar o texto exportado.",
  "export.textFiles": "Texto",
};
