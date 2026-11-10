const SUPPORTED_ARGUMENTS = [
  "--record",
  "--replace",
  "--fail-on-invalid",
  "--truncate-stream",
];
const supportedArguments = new Set(SUPPORTED_ARGUMENTS);

/**
 * @param {readonly string[]} args
 * @returns {{ record: boolean, replace: boolean, failOnInvalid: boolean, truncateStream: boolean }}
 */
export function parseBenchmarkArgs(args) {
  const unknownPositions = args.flatMap((argument, index) =>
    supportedArguments.has(argument) ? [] : [index + 1],
  );
  if (unknownPositions.length > 0) {
    const noun = unknownPositions.length === 1 ? "argument" : "arguments";
    const positionLabel =
      unknownPositions.length === 1 ? "position" : "positions";
    throw new Error(
      `Unrecognized performance benchmark ${noun} at ${positionLabel} ${unknownPositions.join(", ")}. Supported arguments: ${SUPPORTED_ARGUMENTS.join(", ")}.`,
    );
  }

  return {
    record: args.includes("--record"),
    replace: args.includes("--replace"),
    failOnInvalid: args.includes("--fail-on-invalid"),
    truncateStream: args.includes("--truncate-stream"),
  };
}
