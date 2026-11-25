# Issue tracker — GitHub

Use the `gh` CLI to read, publish, and manage tickets and specs in
`speedracr/porthopper`. Verify the target repository before publishing.

- Read tickets with `gh issue view` and find them with `gh issue list`.
- Publish tickets and specs with `gh issue create`.
- Use GitHub sub-issues and native issue dependencies for parent and blocker
  relationships. If those features are unavailable, record the relationships
  in the issue body with `Part of #<parent>` and `Blocked by: #<issue>`.
- A ticket is ready to start when all its blockers are closed.
- Record the resolution in an issue comment before closing the ticket.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

Use one `wayfinder:map` issue with child tickets. Label children by type
(`research`, `prototype`, `grilling`, or `task`) and choose the first open,
unassigned child in map order with no open blockers. Assign it to yourself
when claiming it. On resolution, record the outcome, close the ticket, and
link the decision from the map.
