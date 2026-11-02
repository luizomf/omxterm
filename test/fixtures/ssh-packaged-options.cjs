const assert = require("node:assert/strict");
const { valid } = require("semver");

function checkpointOptions(env) {
  const extensionVersion =
    env.OMXTERM_SSH_PACKAGED_EXTENSION_VERSION ?? "0.1.0";
  assert.equal(
    valid(extensionVersion),
    extensionVersion,
    "canonical extension SemVer required",
  );
  const appearance = env.OMXTERM_SSH_PACKAGED_APPEARANCE;
  assert.ok(
    appearance === undefined || appearance === "1",
    "APPEARANCE must be 1 or unset",
  );
  const catalogMode = env.OMXTERM_SSH_PACKAGED_CATALOG;
  const sha256 = env.OMXTERM_SSH_PACKAGED_CATALOG_SHA256;
  assert.ok(catalogMode === undefined || catalogMode === "public");
  if (catalogMode) assert.match(sha256 ?? "", /^[a-f0-9]{64}$/);
  else assert.equal(sha256, undefined);
  const timeout = catalogMode ? 180000 : 120000;
  const scope = catalogMode
    ? "unchanged extracted AppImage; public SSH catalog consumption; controlled input/consent; no SSH client execution"
    : "unchanged extracted AppImage; separate SSH; synthetic client, no connectivity";
  if (appearance) {
    assert.ok(
      ["0.3.0", "0.3.1"].includes(extensionVersion),
      "appearance/language checkpoint targets SSH 0.3.0 or 0.3.1",
    );
    assert.equal(
      catalogMode,
      undefined,
      "appearance checkpoint must continue the synthetic Connect campaign",
    );
  }
  return {
    extensionVersion,
    appearance: !!appearance,
    catalogMode,
    timeout: appearance ? 240000 : timeout,
    scope,
  };
}

module.exports = { checkpointOptions };
