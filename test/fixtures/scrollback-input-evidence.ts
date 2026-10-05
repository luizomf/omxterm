type Stimulus = "character" | "injection";

// Fixed synthetic stimuli and protocol classifications only. Never retain
// arbitrary Adapter input, even in a failed native fixture's receipt.
export function scrollbackInputEvidence() {
  let expected: Stimulus | undefined;
  const counts = {
    character: 0,
    injection: 0,
    replies: 0,
    unexpectedWrites: 0,
  };
  const increment = (kind: keyof typeof counts) => {
    counts[kind] = Math.min(Number.MAX_SAFE_INTEGER, counts[kind] + 1);
  };
  return {
    expect(stimulus: Stimulus) {
      expected = stimulus;
    },
    expectingCharacter: () => expected === "character",
    write(text: string) {
      if (expected === "character" && text === "x" && counts.character === 0)
        increment("character");
      else if (
        expected === "injection" &&
        text === "injected" &&
        counts.injection === 0
      )
        increment("injection");
      else if (/^\u001b\[\d+;\d+R$/u.test(text)) increment("replies");
      else increment("unexpectedWrites");
    },
    accepted: (stimulus: Stimulus) => counts[stimulus] === 1,
    snapshot: () => ({ ...counts }),
  };
}
