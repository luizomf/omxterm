# Domain docs

This is a single-context repository. Engineering skills use the following
documents when exploring or changing the project:

- `CONTEXT.md` at the repository root defines the shared domain language.
- `docs/adr/` records durable architectural decisions.
- `docs/spec.md` owns the observable first-release contract.

## Consumer rules

Read `CONTEXT.md`, `docs/spec.md`, and the ADRs relevant to the work before
changing product behavior or architecture. If one of these paths does not exist,
proceed silently rather than creating an empty placeholder.

Use the glossary's defined terms in issue titles, implementation plans, tests,
and documentation. Avoid synonyms that the glossary explicitly rejects. If a
needed concept is absent, reconsider whether the work is inventing unnecessary
language; record a genuine gap for `grill-with-docs` rather than silently adding
a competing term.

Surface conflicts with an ADR explicitly. Never override an accepted decision
without identifying the ADR and explaining why it should be reopened.
