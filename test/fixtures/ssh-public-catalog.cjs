// Passive release-test observation of the unchanged host's IPC and HTTPS streams.
// Diagnostics do not replace or route requests, responses or TLS transport.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { assertPublicSshTrust } = require("./ssh-packaged-header.cjs");

const endpoint =
  "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json";
const channel = "omxterm:extensions";

function startSshPublicObservation({
  ipcMain,
  diagnostics,
  catalogSha256,
  archiveSha256,
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

  const onRequest = ({ request }) => {
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
      (card) => card.id === "omxterm.ssh",
    );
    assert.equal(cards.length, 1, "one SSH card");
    const card = cards[0];
    assert.equal(card.name, offer.name);
    assert.equal(card.version, offer.version);
    assert.equal(card.compatible, true, "selected Linux ARM64 target");
    assert.equal(card.action, expectedInstalled ? "reinstall" : "install");
    assert.equal(
      card.installedVersion,
      expectedInstalled ? offer.version : null,
    );
    assert.match(card.selection, /^[a-f0-9-]{36}$/);
    if (selection)
      assert.equal(card.selection, selection, "catalog generation changed");
    else selection = card.selection;
  }
  const handler = async (event, ...args) => {
    const value = args[0];
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
      assert.ok(installed < 2, "unexpected additional catalog install");
    }
    const operation = { kind: isCatalog ? "catalog" : "archive", requests: [] };
    active = operation;
    try {
      const result = await originalHandler(event, ...args);
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
          (entry) => entry.id === "omxterm.ssh",
        );
        assert.equal(releases.length, 1, "one SSH offer");
        offer = releases[0];
        assert.equal(offer.name, "SSH Connect");
        assert.equal(offer.version, "0.3.1");
        assert.deepEqual(offer.targets, ["linux-arm64"]);
        assert.equal(offer.archive.sha256, archiveSha256);
        assert.ok(
          Number.isSafeInteger(offer.archive.bytes) && offer.archive.bytes > 0,
        );
        assert.ok(
          typeof offer.archive.url === "string" &&
            /^https:\/\/github\.com\/luizomf\/omxterm\/releases\/download\/ext-[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.omxext$/.test(
              offer.archive.url,
            ),
          "invalid SSH release archive URL",
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
  ipcMain.removeHandler(channel);
  try {
    ipcMain.handle(channel, handler);
    diagnostics.subscribe("http.client.request.start", onRequest);
    diagnostics.subscribe("http.client.response.finish", onResponse);
  } catch (error) {
    diagnostics.unsubscribe("http.client.request.start", onRequest);
    diagnostics.unsubscribe("http.client.response.finish", onResponse);
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, originalHandler);
    throw error;
  }
  return {
    verifyTrust(prompt) {
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
      assertPublicSshTrust(prompt, offer.archive.sha256, installed);
      attempts.push({
        selection,
        catalogGeneration,
        expectedGeneration: installed,
        sha256: response.digest,
        bytes: response.size,
      });
      approvals++;
    },
    summary() {
      assert.equal(unexpected.length, 0, "unexpected HTTPS request");
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
    stop() {
      if (stopped) return;
      stopped = true;
      const ownsHandler = ipcMain._invokeHandlers.get(channel) === handler;
      try {
        diagnostics.unsubscribe("http.client.request.start", onRequest);
      } finally {
        try {
          diagnostics.unsubscribe("http.client.response.finish", onResponse);
        } finally {
          if (ownsHandler) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, originalHandler);
          }
        }
      }
      assert.ok(ownsHandler, "SSH observation hook changed");
    },
  };
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

module.exports = { startSshPublicObservation, sshPublicManagementState };
