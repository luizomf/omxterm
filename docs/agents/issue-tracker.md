# Issue tracker: GitHub

Specs, tickets and issues live in `luizomf/omxterm`. Contributors use the
[fork-and-PR workflow](../../CONTRIBUTING.md); maintainers handle labels,
assignments, dependencies and roadmap updates.

## Common operations

Use `gh` with `--repo luizomf/omxterm`, including from a fork checkout:

```sh
gh issue view <number> --repo luizomf/omxterm --json title,body,labels,comments,state
gh issue list --repo luizomf/omxterm --state open --json number,title,labels
gh issue create --repo luizomf/omxterm --title "..." --body-file <file>
gh issue comment <number> --repo luizomf/omxterm --body-file <file>
gh issue edit <number> --repo luizomf/omxterm --add-label "..."
gh issue edit <number> --repo luizomf/omxterm --remove-label "..."
gh issue close <number> --repo luizomf/omxterm --comment "..."
```

Use a body file or `--body-file -` with a quoted heredoc for multiline text.
See [triage labels](triage-labels.md) for the repository's state labels.

GitHub shares one number space across issues and PRs. Resolve an ambiguous
reference with `gh pr view <number> --repo luizomf/omxterm`, falling back to
`gh issue view`. Treat an external PR as a contribution to review; a substantial
feature proposal starts as an issue so scope can be discussed first.

Read an issue's body, comments, labels and current state before acting. These
operations can be used with any contributor's tools; no agent skill is required.

## Multi-issue investigations

For investigations using the repository's `wayfinder:*` labels, coordinate a
map issue and child tickets:

- **Map:** label `wayfinder:map`; keep Notes, Decisions-so-far and Fog in its body.
- **Child:** use a native GitHub sub-issue and a `wayfinder:<type>` label
  (`research`, `prototype`, `grilling` or `task`). If sub-issues are unavailable,
  list the child in the map and put `Part of #<map>` at the top of the child body.
- **Blocking:** prefer native issue dependencies. The API needs the blocker's
  numeric database `id`, not its issue number or `node_id`. Fallback: put
  `Blocked by: #<number>` at the top of the child body.
- **Frontier:** the first open, unassigned child in map order with no open blocker.
- **Claim:** assign it to the authenticated user as the session's first tracker
  write, after checking current issue and dependency state.
- **Resolve:** comment with the answer, close the child, and add a compact decision
  pointer to the map. Closed blockers no longer block their children.
