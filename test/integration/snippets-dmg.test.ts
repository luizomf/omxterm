import { it } from "vitest";
import { dmgInputs } from "../fixtures/snippets-dmg";
import { runDmgCampaign } from "../fixtures/snippets-dmg-campaign";

const values = dmgInputs();
it.skipIf(!values)(
  "qualifies the exact macOS ARM64 DMG-derived app with installed Snippets",
  { timeout: 360000 },
  (testContext) => runDmgCampaign(values, testContext),
);
