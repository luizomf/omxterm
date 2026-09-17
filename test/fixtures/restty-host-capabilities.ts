export async function exerciseResttyCapabilities(options: {
  readonly deliverOutput: (data: string) => void;
  readonly input: () => string;
  readonly clearPtyInput: () => void;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}): Promise<string> {
  const start = options.input().length;
  const fixture =
    "\u001b[2J\u001b[H\u001b[3;5H\u001b[c\u001b[>c\u001b[6n\u001b[16t";
  for (let index = 0; index < fixture.length; index += 2)
    options.deliverOutput(fixture.slice(index, index + 2));
  await options.waitFor(
    () => options.input().slice(start).includes("\u001b[6;"),
    "split terminal capability replies",
  );
  const replies = options.input().slice(start);
  options.clearPtyInput();
  return replies;
}
