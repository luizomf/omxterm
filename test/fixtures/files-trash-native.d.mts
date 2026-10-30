export function runTrashFixture(
  native: {
    trash(target: string): Promise<string>;
    moveNoReplace(source: string, destination: string): Promise<void>;
  },
  options: {
    evidence: string;
    parent: string;
    otherParent?: string | undefined;
  },
): Promise<{
  checks: string[];
  outcome: string;
  cleanup: string;
}>;
