# Port Hopper Repository Instructions
## Project scope

Port Hopper is a fictional, desktop-first maritime browser game with a separate business backend and admin dashboard. Its primary purpose is to learn and demonstrate usage-based billing integrations with Instellix (formerly Nitrobox).

Do not begin implementation of the Admin, Game, or API until explicitly instructed.

## Repository layout

- `apps/admin`: React and TypeScript operations dashboard using Tailwind CSS and shadcn/ui.
- `apps/game`: React, TypeScript, Vite, and Canvas 2D desktop-first retro ship simulator.
- `apps/api`: business backend, preferably Hono, with an eventual Instellix adapter.
- `packages/shared`: shared types and validated API contracts, introduced only when needed.
- `docs`: concise product and architecture specifications.
- `design/mockups`: reference screenshots for frontend development.

## Architecture boundaries

- The Port Hopper backend owns ports, vessels, fictional customer accounts, voyages, and measured gameplay usage.
- Model customers as individual players with game accounts. Use fictional people and `.example` email domains in fixtures.
- Instellix owns billing entities, including products and contracts, rating, invoices, and payment records.
- The game and admin communicate only through the Port Hopper backend; neither may call Instellix directly.
- Keep customer billing country, performance location, and tax location as separate concepts.
- Keep gameplay and billing integration independent.
- Keep mock and live billing adapters clearly separated.

## Engineering rules

- Prefer simple, explicit, maintainable code and small, independently testable vertical slices.
- Avoid speculative abstractions, unnecessary dependencies, and functionality beyond the requested increment.
- Use strict TypeScript and validate data at API boundaries.
- Use synthetic data only during initial development.
- Do not access real Instellix APIs or deploy externally without explicit approval.
- Never place credentials in frontend code, source control, fixtures, or logs.

## UI and copy

- The Admin should resemble a restrained, production-quality SaaS internal tool in the spirit of Notion, Linear, Stripe Dashboard, and ChatGPT.
- Every visible text element must support a user task, action, decision, navigation need, or meaningful system status.
- Keep visible copy concise and conventional.
- Do not add developer commentary, explanatory banners, fixture descriptions, implementation notes, mock-data disclaimers, tutorials, decorative badges, or architectural explanations unless expressly requested or operationally necessary.
- Put technical explanations and testing assumptions in documentation, not in the interface.

## Product UI and UX rules

Build user interfaces that look and behave like production software used by a modern SaaS company.

Use the product quality and visual restraint of applications such as Notion, Linear, Stripe Dashboard, and ChatGPT as reference points.

### No AI-generated explanatory clutter

Never add explanatory UI text simply to describe, justify, demonstrate, or document the implementation.

Specifically, do not add:

- "What this preview proves" or similar sections.
- Banners explaining that data is synthetic, mocked, or illustrative.
- Explanations of architectural decisions, data models, or fixture relationships.
- Disclaimers about what the application is not doing.
- Footers summarizing workflows, technical concepts, or development stages.
- Descriptions of features that were discussed during planning but are not relevant to users.
- Decorative badges such as "Demo", "Preview", or "Prototype" unless explicitly requested.
- Unrequested onboarding instructions, helper paragraphs, or informational callouts.

Do not turn implementation discussions, acceptance criteria, testing notes, or developer caveats into visible UI copy.

### Every piece of UI copy needs a purpose

Visible text must serve at least one of these functions:

1. Identify a page, field, record, or action.
2. Communicate information needed to complete a task.
3. Convey an actual system status, validation error, or actionable warning.
4. Provide contextual help that the user genuinely needs at that point.

If text serves none of these purposes, omit it.

Prefer short, conventional product language.

Examples:

- "Customers" instead of "Manage your fictional customer records".
- "Payment failed" instead of a paragraph explaining the payment simulation.
- "No invoices found" instead of explaining why invoice fixtures haven't been generated.
- "Retry" instead of "Initiate the retry workflow to investigate recovery behavior".

### Visual design

Favor a clean, restrained, information-dense admin interface.

Use:
- Neutral backgrounds and subtle borders.
- Consistent spacing and typography.
- Well-designed tables and detail views.
- Compact, meaningful status indicators.
- Conventional navigation.
- Clear primary and secondary actions.
- Shadcn/ui components where appropriate.

Avoid:
- Large informational banners.
- Unnecessary cards and callouts.
- Excessive empty space around operational data.
- Decorative sections without functional value.
- Emoji in enterprise UI labels.
- Repeated explanations or verbose microcopy.

### Separate application UI from development documentation

Keep testing assumptions, mock-data explanations, limitations, architectural commentary, and implementation details in developer documentation, tests, or Codex's final task summary.

Never surface them in the application merely because they were discussed in the prompt or are important to implementation.

Mock and live environments must remain technically distinguishable, but this does not require prominent explanatory banners. Where necessary, use a compact environment indicator or integration status in the appropriate settings or diagnostics view.

### Before completing any UI task

Review all user-visible copy and remove anything that does not directly support a real user action, decision, or necessary system status.

Ask: "Would this text appear in a real, production-quality SaaS admin tool?"

If not, remove it unless explicitly requested.

These rules apply by default to all screens and components unless I explicitly request an exception.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `speedracr/porthopper`. See `docs/agents/issue-tracker.md`.

### Domain docs

Use a single-context layout with a root `GLOSSARY.md` and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Public Repository and Information Security

This repository is intended to be publicly accessible on GitHub.

**Assume that every committed file, Git commit, issue, pull request, and CI log may be viewed by anyone.**

### Information that must never be committed

- API keys, OAuth client secrets, access tokens, refresh tokens, passwords, or private keys.
- Real Instellix staging or production credentials.
- Internal Instellix documentation, source code, configuration exports, or proprietary implementation details.
- Actual customer information, payment details, invoices, or other personal or confidential data.
- Raw API responses or logs containing real tenant identifiers, credentials, or sensitive information.
- Local environment files, database files, backups, or debugging artifacts containing non-public data.

Use synthetic data for fixtures, tests, screenshots, and documentation.

### Environment configuration

- Store secrets exclusively in local environment variables or approved secret-management systems.
- Never embed credentials in frontend code.
- Commit an `.env.example` containing placeholder variable names and safe example values.
- Add `.env`, `.env.*.local`, credential files, local databases, and other sensitive artifacts to `.gitignore`.
- Ensure the application works in mock mode without any Instellix credentials.
- Keep production and staging credentials separate.
- Do not expose secrets in exception messages, HTTP responses, or application logs.

### Instellix integration

- Use only publicly available API documentation that company policy permits for this project.
- Never copy internal Instellix code or proprietary documentation into this repository.
- Communicate with Instellix exclusively through authorized public API endpoints.
- Keep Instellix authentication and API communication server-side.
- Never expose tenant credentials or privileged integration operations to browser clients.
- Do not include raw real-world API requests or responses in public tests, fixtures, or documentation.
- Any example API payloads must use fabricated identities and sanitized identifiers.
- Never publish actual tenant configuration without explicit authorization.

### Git and GitHub safety

- Before committing changes, review staged files for secrets, confidential information, and accidental artifacts.
- Never use `git add .` blindly without inspecting what will be staged.
- Run automated secret scanning where practical, such as Gitleaks.
- Keep generated build files, dependency folders, local databases, and temporary files out of version control.
- Treat screenshots, terminal output, comments, and commit messages as potentially sensitive.
- Do not push, publish, create a public repository, or change repository visibility without my explicit approval.
- If sensitive information is accidentally committed, stop and report it immediately. Do not assume deleting the file in a later commit makes the secret safe.

### Dependencies and licensing

- Prefer established, actively maintained open-source dependencies.
- Respect the licenses of external source code, images, fonts, sounds, and other assets.
- Do not copy proprietary assets from commercial games or other software.
- Maintain appropriate attribution and license notices where required.
- Do not assume that publicly accessible documentation or source code is automatically licensed for redistribution.

### Security review

Before the first public push, perform a repository-wide review for:
1. Secrets and credentials.
2. Confidential or internal company information.
3. Sensitive data in Git history.
4. Unintentionally tracked files.
5. Dependency and licensing issues.

Report any findings and resolve them before publication.

**When uncertain whether information is safe to publish, exclude it and ask for approval.**

## Implementation workflow

Optimize for fast, incremental delivery and a limited Codex token budget.

- Implement one small, independently testable vertical slice at a time.
- Never interpret the entire PRD as authorization to implement all features.
- Prefer the simplest implementation that satisfies the current acceptance criteria.
- Do not introduce infrastructure, dependencies, abstractions, or features for hypothetical future requirements.
- Avoid broad refactoring and unrelated improvements.
- Reuse existing code and established patterns whenever possible.
- Use reasonable defaults rather than asking about minor implementation decisions.
- Do not spend significant effort investigating alternative architectures unless the chosen approach is demonstrably blocked.
- Do not automatically continue to the next feature after completing the current task.

### Task boundaries

Before coding, briefly state:
1. What will be implemented.
2. What will explicitly not be implemented.
3. How completion will be verified.

Then implement the task without further planning unless a material blocker arises.

If a task becomes significantly more complex than expected, stop at the last working state, report the blocker, and recommend the smallest next step.

### Verification

- Run relevant type checks, tests, and linting where available.
- Prefer a small number of focused tests over broad test suites.
- Fix issues introduced by the current change.
- Do not expand scope to unrelated problems.
- Finish with a concise summary of changes, verification results, and remaining limitations.

### Documentation

- Update documentation only when the implementation changes an important contract, architectural decision, or user-facing behavior.
- Do not generate lengthy implementation reports or duplicate existing specifications.
- Never add development notes or acceptance criteria to the application UI.

Apply these rules by default unless I explicitly request otherwise.

## Project continuity and session handoff

This project is developed across multiple AI coding sessions and editors, including Zed and Codex. Optimize for quick context recovery and minimal token usage.

### At the beginning of each task

1. Read `AGENTS.md` and `docs/STATUS.md` first.
2. Read only the relevant sections of `docs/prd.md` and `docs/architecture.md`.
3. Inspect the code relevant to the requested task. Do not scan the entire repository unless necessary.
4. Use `docs/STATUS.md` to understand completed work, current limitations, and the next planned increment.
5. Treat the actual code and tests as authoritative for implementation details. Do not assume the status file is perfectly current.

### At the end of each completed task

Update `docs/STATUS.md` with:

- The latest completed increment.
- What is now functional.
- Important implementation decisions or changes.
- Known limitations or unresolved issues.
- The next recommended increment.

Keep the entire file under approximately 300 words.

Replace outdated information instead of appending a chronological development diary.

Do not duplicate the PRD, architecture document, or implementation details already obvious from the code.

Only update other documentation when requirements or architectural decisions materially change.

### Session handoff

A new coding session should be able to understand the project's current state by reading `AGENTS.md` and `docs/STATUS.md`, then inspecting only the files relevant to its task.

When finishing a task, provide a concise summary of changes and verification results. Do not automatically start the next increment.
