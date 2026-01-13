# Copilot Instructions for where-to-eat

## Project Overview
- This is a peer-to-peer web app for collaboratively choosing where to eat, featuring a spinning wheel UI that selects an `Eatery` based on user scores.
- Users and eateries are managed per-connection (UUID). Settings and data are synchronized between peers using service workers and peer-to-peer messaging.

## Architecture & Data Flow
- Main app logic is in `src/`, with routes in `src/routes/` and UI components in `src/components/`.
- Peer-to-peer sync is implemented in `src/utils/peerjsLocalForageCollection.ts` using localForage for storage and tombstone-based deletion for conflict-free sync.
- Service worker communication is handled via `src/utils/serviceWorkerComm.ts` and related files.
- Settings, users, and eateries are stored per-connection (UUID) and changes are broadcast to peers.
- The spinning wheel logic is in `src/routes/wheel.$connectionId.tsx`.

## Key Patterns & Conventions
- All deletions are handled with tombstones (`_deleted: true`, `deletedAt`) to prevent deleted data from reappearing after sync.
- Peer-to-peer messages are always routed through the service worker for reliability.
- Each user and connection is identified by a UUID.
- UI components are colocated in `src/components/ui/` and follow a functional, composable pattern.
- Route files use the `.tsx` extension and are named for their route (e.g., `settings.$connectionId.tsx`).

## Developer Workflows
- Use `pnpm` for all package management and scripts.
- Build and run with Vite (`vite.config.ts`).
- Tailwind CSS is configured via `tailwind.config.mjs` and `postcss.config.mjs`.
- No explicit test setup found; add tests in a `tests/` directory if needed.
- For PWA features, see `vite-plugin-pwa` and related config files.

## Integration Points
- Peer-to-peer sync: `src/utils/peerjsLocalForageCollection.ts`, `src/utils/serviceWorkerComm.ts`
- Service worker: `public/sw.js`, `src/sw.ts`
- UI: `src/components/ui/`, `src/routes/`
- Settings and user management: `src/routes/settings.$connectionId.tsx`, `src/utils/users.tsx`

## Examples
- To add a new peer-synced collection, follow the pattern in `peerjsLocalForageCollection.ts` (including tombstone handling).
- To add a new route, create a `.tsx` file in `src/routes/` following the existing naming convention.

---
If you update architectural patterns or workflows, please update this file to keep AI agents productive.
