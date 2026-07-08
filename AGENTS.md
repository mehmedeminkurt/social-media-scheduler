# AGENTS.md

## Project overview
This repository is a Turborepo monorepo for a social media scheduling product.

- apps/frontend: the main Next.js app with authentication, Prisma, and API routes.
- apps/admin-panel: the admin-facing Next.js app.
- packages/ui: shared React components used across apps.

## Working conventions
- Prefer small, targeted changes in the relevant app or package.
- Use the root scripts for broad checks:
  - npm run build
  - npm run lint
  - npm run check-types
  - npm run dev
- For app-specific work, use workspace-aware commands such as:
  - npm --workspace apps/frontend run lint
  - npm --workspace apps/frontend run build
- Keep shared UI changes in packages/ui and consume them from the apps instead of duplicating components.

## Frontend-specific notes
- The main frontend lives in apps/frontend.
- Auth-related routes and handlers are under apps/frontend/app/api/auth/ and the page routes under apps/frontend/app/.
- Prisma is configured for the frontend app in apps/frontend/prisma/schema.prisma.
- If the Prisma schema changes, update the schema and regenerate the client before assuming the change is complete.

## Code style expectations
- Follow existing Next.js App Router and TypeScript patterns.
- Reuse existing utilities and styles before introducing new abstractions.
- Keep changes aligned with the surrounding feature rather than creating parallel patterns.

## Helpful references
- Root README: README.md
- Frontend app README: apps/frontend/README.md
- Prisma schema: apps/frontend/prisma/schema.prisma
