import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { checkpointOptions } =
  require("../fixtures/ssh-packaged-options.cjs") as {
    checkpointOptions: (env: NodeJS.ProcessEnv) => {
      extensionVersion: string;
      appearance: boolean;
      catalogMode: string | undefined;
      timeout: number;
      scope: string;
    };
  };

it.each(["0.3.0", "0.3.1"])(
  "admits the explicit SSH %s appearance checkpoint",
  (version) => {
    expect(
      checkpointOptions({
        OMXTERM_SSH_PACKAGED_EXTENSION_VERSION: version,
        OMXTERM_SSH_PACKAGED_APPEARANCE: "1",
      }),
    ).toMatchObject({
      extensionVersion: version,
      appearance: true,
      catalogMode: undefined,
      timeout: 240000,
    });
  },
);

it.each(["0.1.0", "0.2.0", "0.3.1-rc.1", "0.3.2", "0.4.0", "1.0.0"])(
  "rejects unsupported SSH %s appearance checkpoints",
  (version) => {
    expect(() =>
      checkpointOptions({
        OMXTERM_SSH_PACKAGED_EXTENSION_VERSION: version,
        OMXTERM_SSH_PACKAGED_APPEARANCE: "1",
      }),
    ).toThrow("targets SSH 0.3.0 or 0.3.1");
  },
);

it("preserves the historical default and canonical version requirement", () => {
  expect(checkpointOptions({})).toMatchObject({
    extensionVersion: "0.1.0",
    appearance: false,
    catalogMode: undefined,
    timeout: 120000,
  });
  expect(() =>
    checkpointOptions({ OMXTERM_SSH_PACKAGED_EXTENSION_VERSION: "v0.3.1" }),
  ).toThrow("canonical extension SemVer required");
  expect(() =>
    checkpointOptions({ OMXTERM_SSH_PACKAGED_APPEARANCE: "0" }),
  ).toThrow("APPEARANCE must be 1 or unset");
  expect(() =>
    checkpointOptions({ OMXTERM_SSH_PACKAGED_APPEARANCE: "1" }),
  ).toThrow("targets SSH 0.3.0 or 0.3.1");
});

it("requires the public-catalog digest and forbids mixing catalog and appearance", () => {
  const publicCatalog = {
    OMXTERM_SSH_PACKAGED_CATALOG: "public",
    OMXTERM_SSH_PACKAGED_CATALOG_SHA256: "a".repeat(64),
    OMXTERM_SSH_PACKAGED_EXTENSION_VERSION: "0.3.0",
  };
  expect(checkpointOptions(publicCatalog)).toMatchObject({
    extensionVersion: "0.3.0",
    catalogMode: "public",
    appearance: false,
    timeout: 180000,
  });
  expect(() =>
    checkpointOptions({
      ...publicCatalog,
      OMXTERM_SSH_PACKAGED_APPEARANCE: "1",
    }),
  ).toThrow(
    "appearance checkpoint must continue the synthetic Connect campaign",
  );
  for (const env of [
    { OMXTERM_SSH_PACKAGED_CATALOG: "public" },
    { ...publicCatalog, OMXTERM_SSH_PACKAGED_CATALOG_SHA256: "bad" },
    { OMXTERM_SSH_PACKAGED_CATALOG_SHA256: "a".repeat(64) },
    { OMXTERM_SSH_PACKAGED_CATALOG: "other" },
  ])
    expect(() => checkpointOptions(env)).toThrow();
});
