// Renderer probes are serialized and executed inside the actual hosted views.
function usesChangedSshHeader(hostVersion, extensionVersion) {
  return hostVersion === "0.24.0" && extensionVersion === "0.3.1";
}

function assertChangedSshTrust(prompt, digest) {
  if (
    !/^[a-f0-9]{64}$/.test(digest) ||
    prompt.message !== "Install SSH Connect 0.3.1?" ||
    !prompt.detail.includes(`\n\nPackage: omxterm.ssh\nSHA-256: ${digest}\n`)
  )
    throw Error("SSH trust identity or digest mismatch");
}

function observeSshChildHeader() {
  const regions = document.querySelectorAll(
    '.application-page[role="region"][aria-label="SSH Connect"]',
  );
  if (regions.length !== 1) throw Error("SSH child region unavailable");
  const region = regions[0];
  if (
    document.querySelector(".application-page-header") ||
    [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].some(
      (heading) => heading.textContent.trim() === "SSH Connect",
    )
  )
    throw Error("SSH child header duplicates host identity");
  const language = document.documentElement.lang;
  const labels =
    language === "en-US"
      ? {
          quick: "Quick connect",
          connect: "Connect",
          search: "Search aliases",
          refresh: "Refresh",
          alias: "Connect to fixture-fast",
        }
      : language === "pt-BR"
        ? {
            quick: "Conexão rápida",
            connect: "Conectar",
            search: "Buscar aliases",
            refresh: "Atualizar",
            alias: "Conectar a fixture-fast",
          }
        : null;
  const shown = (element) => {
    if (!element?.isConnected) return false;
    for (let node = element; node; node = node.parentElement) {
      if (node.hasAttribute("hidden") || node.hasAttribute("inert"))
        return false;
      const style = getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      )
        return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const quick = region.querySelector(".quick-connect input");
  const connect = region.querySelector(".quick-connect button");
  const search = region.querySelector('.alias-toolbar input[type="search"]');
  const refresh = region.querySelector(".alias-toolbar button");
  const aliases = region.querySelectorAll(
    '.aliases button[data-alias="fixture-fast"]',
  );
  const alias = aliases[0];
  if (
    !labels ||
    ![region, quick, connect, search, refresh, alias].every(shown) ||
    quick.closest("label")?.textContent.trim() !== labels.quick ||
    connect.disabled ||
    connect.textContent.trim() !== labels.connect ||
    search.closest("label")?.textContent.trim() !== labels.search ||
    refresh.disabled ||
    refresh.textContent.trim() !== labels.refresh ||
    aliases.length !== 1 ||
    alias.disabled ||
    alias.textContent.trim() !== "fixture-fast" ||
    alias.getAttribute("aria-label") !== labels.alias
  )
    throw Error("SSH child controls unavailable or changed");
  return {
    region: "SSH Connect",
    language,
    duplicateTitle: false,
    quickConnect: true,
    aliasSearch: true,
    syntheticAlias: "fixture-fast",
  };
}

function observeSshHostHeader() {
  const panel = document.querySelector(".auxiliary-panel:not([hidden])");
  const header = panel?.querySelector(".auxiliary-header");
  const titles = header?.querySelectorAll("h2");
  const title = titles?.[0];
  const tools = header?.querySelector(".auxiliary-tools");
  if (
    !panel ||
    panel.getAttribute("aria-label") !== "SSH Connect" ||
    titles?.length !== 1 ||
    title.textContent.trim() !== "SSH Connect" ||
    title.hidden ||
    !tools?.hidden
  )
    throw Error("SSH host header identity unavailable");
  const slot = panel.querySelector(".companion-native-slot:not([hidden])");
  const terminal = document.querySelector(".terminal-surface");
  const shown = (element) => {
    if (!element?.isConnected) return false;
    for (let node = element; node; node = node.parentElement) {
      if (node.hasAttribute("hidden") || node.hasAttribute("inert"))
        return false;
      const style = getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      )
        return false;
    }
    return true;
  };
  if (![header, title, slot, terminal].every(shown))
    throw Error("SSH host header or slot is hidden");
  const rectangle = (element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  };
  const headerRect = rectangle(header);
  const titleRect = rectangle(title);
  const slotRect = rectangle(slot);
  const terminalRect = rectangle(terminal);
  const rects = [headerRect, titleRect, slotRect, terminalRect];
  if (
    rects.some(
      (r) =>
        ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
        r.width <= 0 ||
        r.height <= 0,
    ) ||
    title.scrollWidth > title.clientWidth + 1 ||
    titleRect.x < headerRect.x - 2 ||
    titleRect.y < headerRect.y - 2 ||
    titleRect.x + titleRect.width > headerRect.x + headerRect.width + 2 ||
    titleRect.y + titleRect.height > headerRect.y + headerRect.height + 2 ||
    slotRect.y < headerRect.y + headerRect.height - 2 ||
    slotRect.x < terminalRect.x + terminalRect.width - 2 ||
    headerRect.x < 0 ||
    headerRect.y < 0 ||
    headerRect.x + headerRect.width > innerWidth ||
    headerRect.y + headerRect.height > innerHeight ||
    slotRect.x + slotRect.width > innerWidth + 2 ||
    slotRect.y + slotRect.height > innerHeight + 2
  )
    throw Error("SSH host geometry invalid");
  return {
    identity: "SSH Connect",
    header: headerRect,
    title: titleRect,
    slot: slotRect,
    terminal: terminalRect,
    viewport: { width: innerWidth, height: innerHeight },
  };
}

async function captureSshHeader(window, core, view) {
  const natives = () =>
    window.contentView.children.filter((child) => child.webContents === view);
  const native = natives()[0];
  const checkNative = (slot) => {
    if (
      core.isDestroyed() ||
      view.isDestroyed() ||
      natives().length !== 1 ||
      natives()[0] !== native ||
      !native.getVisible() ||
      core.isFocused() ||
      !view.isFocused()
    )
      throw Error("SSH native slot or focus unavailable");
    const bounds = { ...native.getBounds() };
    if (
      !["x", "y", "width", "height"].every(
        (key) => Math.abs(bounds[key] - slot[key]) <= 2,
      )
    )
      throw Error("SSH native slot geometry differs from host");
    return bounds;
  };
  const bounded = async (operation) => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("SSH header observation timed out")),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const hostScript = `(${observeSshHostHeader.toString()})()`;
  const childScript = `(${observeSshChildHeader.toString()})()`;
  const host = await bounded(() => core.executeJavaScript(hostScript));
  const child = await bounded(() => view.executeJavaScript(childScript));
  const bounds = checkNative(host.slot);
  const revalidate = async () => {
    const currentHost = await bounded(() => core.executeJavaScript(hostScript));
    const currentChild = await bounded(() =>
      view.executeJavaScript(childScript),
    );
    const currentBounds = checkNative(currentHost.slot);
    if (
      JSON.stringify(currentHost) !== JSON.stringify(host) ||
      JSON.stringify(currentChild) !== JSON.stringify(child) ||
      JSON.stringify(currentBounds) !== JSON.stringify(bounds)
    )
      throw Error("SSH header changed during capture");
  };
  // Frame opportunities reduce stale captures but do not prove compositor paint.
  const frames =
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))";
  await bounded(() => core.executeJavaScript(frames));
  await bounded(() => view.executeJavaScript(frames));
  await revalidate();
  const header = host.header;
  const crop = {
    x: Math.floor(header.x),
    y: Math.floor(header.y),
    width: Math.ceil(header.x + header.width) - Math.floor(header.x),
    height: Math.ceil(header.y + header.height) - Math.floor(header.y),
  };
  const hostImage = await bounded(() => core.capturePage(crop));
  const childImage = await bounded(() => view.capturePage());
  if (hostImage.isEmpty() || childImage.isEmpty())
    throw Error("SSH header capture is empty");
  await revalidate();
  return {
    host,
    child,
    native: bounds,
    crop,
    frameOpportunities: { host: 2, child: 2 },
    hostImage,
    childImage,
  };
}

module.exports = {
  usesChangedSshHeader,
  assertChangedSshTrust,
  observeSshChildHeader,
  observeSshHostHeader,
  captureSshHeader,
};
