import { it } from "vitest";
import { windowsPublicInputs } from "../fixtures/snippets-windows-public-inputs";
import { runWindowsPublicCampaign } from "../fixtures/snippets-windows-public-campaign";

const values = windowsPublicInputs();
it.skipIf(!values)(
  "checks public Snippets on the exact installed Windows ARM64 host",
  { timeout: 600000 },
  (context) => runWindowsPublicCampaign(values!, context),
);
