import { runDmgController } from "./snippets-dmg-driver";

void runDmgController(process.argv[2]!).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
