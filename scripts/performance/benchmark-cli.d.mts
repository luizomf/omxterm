export interface BenchmarkCliOptions {
  readonly record: boolean;
  readonly replace: boolean;
  readonly failOnInvalid: boolean;
  readonly truncateStream: boolean;
}

export function parseBenchmarkArgs(
  args: readonly string[],
): BenchmarkCliOptions;
