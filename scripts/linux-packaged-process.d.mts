import type { ChildProcess } from "node:child_process";
export function verifyLinuxWrapperPropagation(
  executable: string,
  timeoutMs?: number,
): Promise<string>;
export function launchLinuxPackagedProcess(options: {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  expectedExecutable: string;
  readinessFile: string;
  profileRoot: string;
  wrapper?: boolean;
  timeoutMs?: number;
}): Promise<{
  child: ChildProcess;
  stderrText(): string;
  verifyMain(): Promise<void>;
  stop(): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}>;
