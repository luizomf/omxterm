# Issue tracker: GitHub

Specs, tickets, and issues for this repository live as GitHub issues in
`luizomf/omxterm`.

## Contributor path

Contributors can search public issues, open a bug report or scoped proposal, and
submit a pull request through fork-and-pull. When a contribution needs a label,
assignment, dependency, roadmap, or closure update, request it in the issue or
pull request and a maintainer can apply it.

Those tracker updates and all versioning or release operations require explicit
maintainer authority. Repository agents use the operations below only when they
carry that authority in this repository; instructions in an external fork do
not provide it.

## Maintainer operations

Use the `gh` CLI for tracker operations:

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a
  heredoc for multiline bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by
  `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json
  number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

Run commands inside this clone so `gh` resolves the repository from its remote.

## Pull requests and feature proposals

Feature proposals start as issues so scope and dependencies can be evaluated
before implementation. The triage workflow reviews an external pull request as
a contribution, not automatically as a feature request.

GitHub shares one number space across issues and pull requests. A bare `#42`
may be either; resolve it with `gh pr view 42` and fall back to
`gh issue view 42`.

## Skill vocabulary

- When a skill says **publish to the issue tracker**, create a GitHub issue.
- When a skill says **fetch the relevant ticket**, run
  `gh issue view <number> --comments` and fetch its labels.

## Maintainer wayfinding operations

The `wayfinder` skill represents a map as one GitHub issue with child issues as
tickets. The operations in this section require maintainer authority because
they mutate repository tracker state.

- **Map**: label it `wayfinder:map` and keep Notes, Decisions-so-far, and Fog in
  its body.
- **Child ticket**: use a native GitHub sub-issue. If sub-issues are unavailable,
  add the child to a task list in the map and put `Part of #<map>` at the top of
  the child body. Use `wayfinder:<type>` labels for `research`, `prototype`,
  `grilling`, or `task`.
- **Blocking**: prefer GitHub's native issue dependencies. The dependency API
  requires the blocker's numeric database `id`, not its issue number or
  `node_id`. If native dependencies are unavailable, use a
  `Blocked by: #<number>` line at the top of the child issue.
- **Frontier**: the first open, unassigned child in map order with no open
  blocker is the next claimable ticket.
- **Claim**: assign the issue to the current authenticated user; this is the
  session's first tracker write.
- **Resolve**: record the answer in a comment, close the child, and add a compact
  decision pointer to the map.

A closed blocker no longer blocks a child. Revalidate live issue and dependency
state before claiming or advancing work.
