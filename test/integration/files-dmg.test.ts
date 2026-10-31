import { it } from "vitest";
import { filesDmgInputs, runFilesDmgCampaign } from "../fixtures/files-dmg";

const values = filesDmgInputs();
it.skipIf(!values)(
  "qualifies the exact macOS ARM64 DMG-derived app with corrected Files",
  { timeout: 360000 },
  (context) => runFilesDmgCampaign(values!, context),
);
