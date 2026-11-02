import { runWindowsExactController } from "./snippets-windows-exact-controller";

void runWindowsExactController(process.argv[2]!).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
