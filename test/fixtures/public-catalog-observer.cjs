// Passive release-test observation of the unchanged host's IPC and HTTPS streams.
// Diagnostics do not replace or route requests, responses or TLS transport.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const endpoint =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
const channel = "omxterm:extensions";

function startSshPublicObservation(options) {
  const { assertPublicSshTrust } = require("./ssh-packaged-header.cjs");
  return startPublicCatalogObservation({
    ...options,
    release: {
      id: "omxterm.ssh",
      name: "SSH Connect",
      version: "0.3.1",
      targets: ["linux-arm64"],
      additionalTargetSets: [["linux-arm64", "darwin-arm64"]],
      archiveUrl:
        "https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.3.1/ssh-0.3.1.omxext",
      archiveBytes: 11606,
      label: "SSH",
      generations: [0, 1],
      forbidFallback: true,
      verifyTrust: (prompt, digest, _index, generation) =>
        assertPublicSshTrust(prompt, digest, generation),
    },
  });
}

function startFilesPublicObservation(options) {
  assert.equal(
    options.archiveSha256,
    "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143",
    "original Files 0.6.0 digest",
  );
  assert.equal(typeof options.verifyTrust, "function");
  return startPublicCatalogObservation({
    ...options,
    release: {
      id: "omxterm.files",
      name: "Files — ARM64 preview",
      version: "0.6.0",
      targets: ["linux-arm64"],
      archiveUrl:
        "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.6.0/files-0.6.0.omxext",
      archiveBytes: 17331,
      label: "Files",
      generations: [0, 1, 5],
      forbidFallback: true,
      verifyTrust: options.verifyTrust,
    },
  });
}

function startSnippetsUpdateObservation(options) {
  assert.equal(
    options.archiveSha256,
    "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b",
    "published Snippets 0.1.1 digest",
  );
  assert.equal(typeof options.verifyTrust, "function");
  return startPublicCatalogObservation({
    ...options,
    release: {
      id: "omxterm.snippets",
      name: "Snippets — Linux, macOS and Windows ARM64 preview",
      version: "0.1.1",
      initialVersion: "0.1.0",
      targets: ["linux-arm64", "darwin-arm64", "linux-x64", "win32-arm64"],
      archiveUrl:
        "https://github.com/luizomf/omxterm/releases/download/ext-snippets-v0.1.1/snippets-0.1.1.omxext",
      archiveBytes: 82635,
      label: "Snippets",
      generations: [1],
      forbidFallback: true,
      verifyTrust: options.verifyTrust,
    },
  });
}

function startPublicCatalogObservation({
  ipcMain,
  diagnostics,
  catalogSha256,
  archiveSha256,
  release,
}) {
  assert.match(catalogSha256, /^[a-f0-9]{64}$/);
  assert.match(archiveSha256, /^[a-f0-9]{64}$/);
  const originalHandler = ipcMain._invokeHandlers?.get(channel);
  assert.equal(
    typeof originalHandler,
    "function",
    "production IPC handler unavailable",
  );
  const unexpected = [];
  const pending = new Map();
  let active;
  let offer;
  let selection;
  let catalogGeneration = 0;
  let approvals = 0;
  let installed = 0;
  let catalogBytes;
  const attempts = [];
  let stopped = false;
  let quitting = false;
  let removedForQuit = false;
  const originalRemove = ipcMain.removeHandler;
  const removeDescriptor = Object.getOwnPropertyDescriptor(
    ipcMain,
    "removeHandler",
  );
  const observedRemove = function (...args) {
    if (args[0] === channel) {
      if (
        quitting &&
        !removedForQuit &&
        ipcMain._invokeHandlers.get(channel) === handler
      )
        removedForQuit = true;
      else unexpected.push({ error: "unexpected IPC handler removal" });
    }
    return originalRemove.apply(this, args);
  };
  function restoreRemove() {
    if (ipcMain.removeHandler !== observedRemove) return false;
    if (removeDescriptor)
      Object.defineProperty(ipcMain, "removeHandler", removeDescriptor);
    else delete ipcMain.removeHandler;
    return true;
  }

  const onRequest = ({ request }) => {
    if (stopped) return;
    // Diagnostic callbacks must not throw into the production event loop.
    try {
      const operation = active;
      const record = {
        url: `${request.protocol}//${request.getHeader("host")}${request.path}`,
        method: request.method,
        chunks: [],
        size: 0,
        hash: createHash("sha256"),
        ended: false,
      };
      (operation?.requests ?? unexpected).push(record);
      pending.set(request, { operation, record });
    } catch {
      unexpected.push({ error: "request observation failed" });
    }
  };
  const onResponse = ({ request, response }) => {
    if (stopped) return;
    try {
      const found = pending.get(request);
      pending.delete(request);
      if (!found) {
        unexpected.push({ error: "response without observed request" });
        return;
      }
      const { operation, record } = found;
      record.status = response.statusCode;
      record.location = response.headers.location;
      record.tlsAuthorized =
        response.socket?.encrypted === true &&
        response.socket?.authorized === true;
      const emit = response.emit;
      response.emit = function (event, ...args) {
        if (stopped) return emit.call(this, event, ...args);
        try {
          if (event === "data") {
            const chunk = Buffer.from(args[0]);
            record.size += chunk.length;
            record.hash.update(chunk);
            if (operation?.kind === "catalog" && record.size <= 256 * 1024)
              record.chunks.push(chunk);
          } else if (event === "end") {
            record.ended = true;
            record.digest = record.hash.digest("hex");
          }
        } catch {
          record.observationError = true;
        }
        return emit.call(this, event, ...args);
      };
    } catch {
      unexpected.push({ error: "response observation failed" });
    }
  };
  function checkedResponse(operation, firstUrl) {
    const records = operation.requests;
    assert.ok(
      records.length >= 1 && records.length <= 6,
      "HTTPS request count",
    );
    let expected = firstUrl;
    for (const [index, record] of records.entries()) {
      // Redirect query strings can contain short-lived signatures; never put
      // either URL in assertion errors or retained failure receipts.
      assert.ok(
        record.url === expected,
        "HTTPS redirect or initial URL mismatch",
      );
      assert.equal(record.method, "GET");
      assert.equal(
        record.tlsAuthorized,
        true,
        "actual HTTPS TLS authorization",
      );
      assert.notEqual(
        record.observationError,
        true,
        "response observation failed",
      );
      if (index === records.length - 1) {
        assert.equal(record.status, 200, "actual HTTPS final response");
        assert.equal(record.ended, true, "actual HTTPS body completed");
      } else {
        assert.ok([301, 302, 303, 307, 308].includes(record.status));
        let next;
        try {
          next = new URL(record.location, record.url);
        } catch {
          throw Error("Invalid HTTPS redirect");
        }
        assert.equal(next.protocol, "https:");
        assert.ok(!next.username && !next.password && !next.hash);
        expected = next.href;
      }
    }
    assert.equal(unexpected.length, 0, "unexpected HTTPS request");
    return records.at(-1);
  }
  function checkCard(result, expectedInstalled) {
    assert.equal(result?.ok, true, "catalog IPC failed");
    assert.equal(result.catalog?.loaded, true);
    assert.equal(result.catalog?.stale, false);
    const cards = result.catalog.entries.filter(
      (card) => card.id === release.id,
    );
    assert.equal(cards.length, 1, `one ${release.label} card`);
    const card = cards[0];
    assert.equal(card.name, offer.name);
    assert.equal(card.version, offer.version);
    assert.equal(card.compatible, true, "selected Linux ARM64 target");
    assert.equal(
      card.action,
      expectedInstalled
        ? "reinstall"
        : release.initialVersion
          ? "update"
          : "install",
    );
    assert.equal(
      card.installedVersion,
      expectedInstalled ? offer.version : (release.initialVersion ?? null),
    );
    assert.match(card.selection, /^[a-f0-9-]{36}$/);
    if (selection)
      assert.equal(card.selection, selection, "catalog generation changed");
    else selection = card.selection;
  }
  const handle = async (event, ...args) => {
    const value = args[0];
    if (
      release.forbidFallback &&
      ["install", "install-link"].includes(value?.operation)
    ) {
      unexpected.push({ error: "unapproved installation fallback" });
      throw Error("public catalog forbids installation fallback");
    }
    if (!["catalog-refresh", "catalog-install"].includes(value?.operation))
      return originalHandler(event, ...args);
    assert.equal(active, undefined, "overlapping catalog operation");
    const isCatalog = value.operation === "catalog-refresh";
    if (isCatalog)
      assert.equal(catalogGeneration, 0, "unexpected catalog refresh");
    else {
      assert.equal(catalogGeneration, 1, "catalog generation not captured");
      assert.equal(
        value.selection,
        selection,
        "clicked catalog selection mismatch",
      );
      assert.equal(approvals, installed, "previous consent incomplete");
      assert.ok(
        installed < release.generations.length,
        "unexpected additional catalog install",
      );
    }
    const operation = { kind: isCatalog ? "catalog" : "archive", requests: [] };
    active = operation;
    try {
      const result = await originalHandler(event, ...args);
      if (stopped) return result;
      if (isCatalog) {
        const response = checkedResponse(operation, endpoint);
        assert.equal(
          response.digest,
          catalogSha256,
          "actual catalog byte hash",
        );
        assert.ok(response.size <= 256 * 1024);
        catalogBytes = response.size;
        const parsed = JSON.parse(
          Buffer.concat(response.chunks).toString("utf8"),
        );
        assert.equal(parsed.schemaVersion, 1);
        const releases = parsed.entries.filter(
          (entry) => entry.id === release.id,
        );
        assert.equal(releases.length, 1, `one ${release.label} offer`);
        offer = releases[0];
        assert.equal(offer.name, release.name);
        assert.equal(offer.version, release.version);
        const allowedTargets = [
          release.targets,
          ...(release.additionalTargetSets ?? []),
        ];
        assert.ok(
          Array.isArray(offer.targets) &&
            allowedTargets.some(
              (targets) =>
                targets.length === offer.targets.length &&
                targets.every(
                  (target, index) => target === offer.targets[index],
                ),
            ),
          `${release.label} release targets`,
        );
        assert.equal(offer.archive.sha256, archiveSha256);
        assert.ok(
          Number.isSafeInteger(offer.archive.bytes) && offer.archive.bytes > 0,
        );
        assert.ok(
          typeof offer.archive.url === "string" &&
            /^https:\/\/github\.com\/luizomf\/omxterm\/releases\/download\/ext-[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.omxext$/.test(
              offer.archive.url,
            ),
          `invalid ${release.label} release archive URL`,
        );
        if (release.archiveUrl)
          assert.equal(
            offer.archive.url,
            release.archiveUrl,
            "release archive URL",
          );
        if (release.archiveBytes)
          assert.equal(
            offer.archive.bytes,
            release.archiveBytes,
            "release archive size",
          );
        checkCard(result, false);
        catalogGeneration++;
      } else {
        assert.equal(approvals, installed + 1, "native consent not observed");
        checkCard(result, true);
        installed++;
      }
      return result;
    } finally {
      active = undefined;
    }
  };
  const handler = async (event, ...args) => {
    try {
      return await handle(event, ...args);
    } catch (error) {
      if (
        !stopped &&
        ["catalog-refresh", "catalog-install"].includes(args[0]?.operation)
      )
        unexpected.push({ error: "catalog operation observation failed" });
      throw error;
    }
  };
  ipcMain.removeHandler(channel);
  try {
    ipcMain.handle(channel, handler);
    ipcMain.removeHandler = observedRemove;
    diagnostics.subscribe("http.client.request.start", onRequest);
    diagnostics.subscribe("http.client.response.finish", onResponse);
  } catch (error) {
    diagnostics.unsubscribe("http.client.request.start", onRequest);
    diagnostics.unsubscribe("http.client.response.finish", onResponse);
    restoreRemove();
    originalRemove.call(ipcMain, channel);
    ipcMain.handle(channel, originalHandler);
    throw error;
  }
  return {
    verifyTrust(prompt) {
      assert.equal(stopped, false, "observation stopped");
      assert.equal(
        active?.kind,
        "archive",
        "consent outside catalog installation",
      );
      assert.equal(approvals, installed, "duplicate consent");
      const response = checkedResponse(active, offer.archive.url);
      assert.equal(
        response.size,
        offer.archive.bytes,
        "actual archive byte count",
      );
      assert.equal(
        response.digest,
        offer.archive.sha256,
        "actual archive byte hash",
      );
      const expectedGeneration = release.generations[installed];
      release.verifyTrust(
        prompt,
        offer.archive.sha256,
        installed,
        expectedGeneration,
      );
      attempts.push({
        selection,
        catalogGeneration,
        expectedGeneration,
        sha256: response.digest,
        bytes: response.size,
      });
      approvals++;
    },
    beginQuit() {
      assert.equal(quitting, false, "Quit already requested");
      assert.equal(
        ipcMain.removeHandler,
        observedRemove,
        "IPC removal observer changed",
      );
      assert.equal(
        ipcMain._invokeHandlers.get(channel),
        handler,
        "IPC handler changed before Quit",
      );
      assert.equal(unexpected.length, 0, "unexpected public observation");
      quitting = true;
    },
    summary() {
      assert.equal(unexpected.length, 0, "unexpected public observation");
      assert.equal(
        ipcMain.removeHandler,
        observedRemove,
        "IPC removal observer changed",
      );
      assert.ok(
        removedForQuit
          ? quitting && !ipcMain._invokeHandlers.has(channel)
          : ipcMain._invokeHandlers.get(channel) === handler,
        "IPC handler changed during observation",
      );
      assert.equal(pending.size, 0, "unfinished HTTPS request observation");
      assert.equal(active, undefined, "catalog operation still active");
      return {
        catalogGeneration,
        selection,
        catalogSha256,
        catalogBytes,
        archiveSha256,
        offer,
        approvals,
        installed,
        attempts: [...attempts],
        generationMeaning:
          "observer ordinal for the one successful production refresh; selection is the host's opaque snapshot identity",
      };
    },
    stop({ allowRemoved = false } = {}) {
      if (stopped) return;
      stopped = true;
      pending.clear();
      const ownsHandler = ipcMain._invokeHandlers.get(channel) === handler;
      const validQuitRemoval =
        allowRemoved &&
        quitting &&
        removedForQuit &&
        !ipcMain._invokeHandlers.has(channel) &&
        unexpected.length === 0;
      let ownsRemove;
      try {
        diagnostics.unsubscribe("http.client.request.start", onRequest);
      } finally {
        try {
          diagnostics.unsubscribe("http.client.response.finish", onResponse);
        } finally {
          ownsRemove = restoreRemove();
          if (ownsHandler) {
            originalRemove.call(ipcMain, channel);
            if (!allowRemoved) ipcMain.handle(channel, originalHandler);
          }
        }
      }
      assert.ok(
        ownsRemove &&
          (allowRemoved ? validQuitRemoval : ownsHandler && !quitting),
        `${release.label} observation hook changed`,
      );
    },
  };
}

// Validate before allowing a receipt, but always attempt observer and hook cleanup.
function sealPublicObservation(
  observation,
  expected,
  restore,
  check = () => {},
) {
  const failures = [];
  try {
    check();
  } catch (error) {
    failures.push(error);
  }
  try {
    assert.deepEqual(observation.summary(), expected);
  } catch (error) {
    failures.push(error);
  }
  try {
    observation.stop({ allowRemoved: true });
  } catch (error) {
    failures.push(error);
  }
  try {
    restore();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length)
    throw new AggregateError(failures, "Public observation shutdown failed");
}

// Serialized into the production Settings renderer; do not match unrelated rows.
function sshPublicManagementState(document, generation, state, local, action) {
  const rows = [
    ...document.querySelectorAll(".extensions-panel section"),
  ].filter((row) =>
    [...row.querySelectorAll(":scope > p")].some((paragraph) =>
      paragraph.textContent.startsWith("omxterm.ssh · generation "),
    ),
  );
  if (rows.length !== 1 || rows[0].closest("[hidden], [inert]")) return false;
  const row = rows[0];
  const text = [...row.querySelectorAll(":scope > p")].find((paragraph) =>
    paragraph.textContent.startsWith("omxterm.ssh · generation "),
  )?.textContent;
  if (
    text !==
    `omxterm.ssh · generation ${generation} · ${state} · local ${local} · other instances unknown`
  )
    return false;
  if (
    state !== "uninstalled" &&
    row.querySelector(":scope > h3")?.textContent !== "SSH Connect · 0.3.1"
  )
    return false;
  if (!action) return true;
  const buttons = [...row.querySelectorAll("button")].filter(
    (button) =>
      button.textContent === action &&
      !button.disabled &&
      !button.closest("[hidden], [inert]"),
  );
  return buttons.length === 1;
}

module.exports = {
  startPublicCatalogObservation,
  startSshPublicObservation,
  startFilesPublicObservation,
  startSnippetsUpdateObservation,
  sealPublicObservation,
  sshPublicManagementState,
};
