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
