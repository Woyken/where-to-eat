# Copilot Instructions for where-to-eat

## Quick Start Commands
```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (Vite)
pnpm dev:full         # Start dev + peer server (for P2P testing)
pnpm peer-server      # Start standalone peer server
pnpm build            # Build + type check
pnpm test:e2e         # Run Playwright E2E tests
pnpm test:e2e:ui      # Playwright UI mode
```

## Project Overview
- **SolidJS** peer-to-peer web app for collaboratively choosing where to eat via a spinning wheel UI
- Uses **TanStack Router** for file-based routing with dynamic `$connectionId` segments
- P2P sync via **PeerJS** + **localForage** + service worker message passing
- State management: **solid-js/store** with `SettingsStorageProvider` context

## Tech Stack
| Layer | Technology |
|-------|------------|
| Framework | SolidJS 1.9 |
| Router | @tanstack/solid-router |
| Styling | Tailwind CSS 4, tw-animate-css |
| UI Components | solid-ui (shadcn-like), Kobalte (headless), lucide-solid icons |
| State | solid-js/store, @tanstack/solid-store |
| P2P | PeerJS, localForage |
| Validation | Valibot |
| Build | Vite 7, vite-plugin-pwa |
| Testing | Playwright (E2E in `tests/e2e/`) |

## Core Data Models (src/utils/jsonStorage.ts)
```typescript
// Connection = a shared room containing users, eateries, scores
StorageSchemaType = {
  id: string;                    // UUID connection ID
  settings: {
    connection: { name, updatedAt };
    eateries: Array<{ id, name, updatedAt, _deleted? }>;
    users: Array<{ id, name, email?, updatedAt, _deleted? }>;
    eateryScores: Array<{ userId, eateryId, score, updatedAt, _deleted? }>;
  }
}
```
**Important:** All entities use `_deleted: boolean` + `updatedAt: number` for tombstone-based sync.

## Key Files & Their Purpose
| File | Purpose |
|------|---------|
| `src/components/SettingsStorageProvider.tsx` | Central state context. Use `useSettingsStorage()` for CRUD operations |
| `src/utils/peer2peerSharing.tsx` | P2P context. Use `usePeer2Peer()` to broadcast messages, `usePeer2PeerId()` for peer ID |
| `src/utils/jsonStorage.ts` | Valibot schemas for all data models |
| `src/utils/serviceWorkerComm.ts` | Main→SW message helpers |
| `src/utils/serviceWorkerMessages.ts` | SW message type definitions |
| `src/routes/wheel.$connectionId.tsx` | Main wheel UI (532 lines, spinning logic, segment calculation) |
| `src/routes/settings.$connectionId.tsx` | User/eatery/score management UI |

## Routing Pattern
Routes use TanStack Router file-based routing:
- `src/routes/index.tsx` → `/` (home/connection list)
- `src/routes/wheel.$connectionId.tsx` → `/wheel/:connectionId`
- `src/routes/settings.$connectionId.tsx` → `/settings/:connectionId`
- `src/routes/connect-to.tsx` → `/connect-to` (join via QR/link)

Access route params: `Route.useParams({ select: (p) => p.connectionId })`

## State Management Pattern
```typescript
// Reading state
const settingsStorage = useSettingsStorage();
const connection = settingsStorage.store.connections.find(x => x.id === connectionId);

// Mutating + broadcasting
settingsStorage.addEatery(connectionId, "Pizza Place");
peer.broadcast({ type: "updated-eatery", data: { connectionId, eatery } });
```

## P2P Message Types (broadcast via `peer.broadcast()`)
- `updated-eatery`, `removed-eatery`
- `updated-user`, `removed-user`
- `updated-score`
- `sync-request`, `sync-response`

## UI Components (src/components/ui/)
UI components use **solid-ui** (https://www.solid-ui.com/docs/cli), a shadcn-like component system for SolidJS built on Kobalte primitives + Tailwind.

Available components: `Button`, `Card`, `Dialog`, `Select`, `TextField`, `ToggleGroup`, `Badge`, `Label`, `DropdownMenu`

Add new components via CLI: `pnpx solid-ui-cli@latest add <component-name>`

## Testing
- E2E tests in `tests/e2e/` using Playwright
- Helper: `injectConnection(page, connectionId)` seeds localStorage before test
- Run specific test: `pnpm test:e2e tests/e2e/scores.spec.ts`
- **AVOID RELOADS:** Prefer UI navigation (clicking buttons/links) over `page.reload()` or `page.goto()`. Full reloads trigger full data redownloads/syncs, which defeats the purpose of testing real-time incremental P2P sync. Only use reloads when explicitly testing offline recovery or persistence.

## Common Tasks

### Add a new route
1. Create `src/routes/myroute.$connectionId.tsx`
2. Export `Route` using `createFileRoute("/myroute/$connectionId")`
3. Export component function
4. Router auto-generates types in `src/routeTree.gen.ts`

### Add a new synced entity type
1. Add Valibot schema to `src/utils/jsonStorage.ts`
2. Add to `StorageSchemaType.settings`
3. Add CRUD methods in `SettingsStorageProvider.tsx`
4. Add message types in `serviceWorkerMessages.ts`
5. Handle in `peer2peerSharing.tsx` message handler

### Add a UI component
1. Use solid-ui CLI: `pnpx solid-ui-cli@latest add <component-name>`
2. Or manually create in `src/components/ui/` using Kobalte primitives + `class-variance-authority`
3. Follow existing patterns (see `button.tsx`)

## Gotchas
- **Tombstones required:** Never hard-delete; set `_deleted: true, updatedAt: Date.now()`
- **Broadcast after mutations:** Always call `peer.broadcast()` after local state changes
- **Active items filter:** Use `.filter(x => !x._deleted)` when displaying lists
- **Service worker routing:** All P2P messages go through SW for offline reliability
- **Test Navigation:** Do not use `page.reload()` to test sync; it hides race conditions and tests cold start instead of live updates.

---

## Design System

### Philosophy
Professional, warm, and approachable. Uses **burnt orange accent** with clean typography. Avoid playful elements like food emojis, excessive animations, or bright gradients.

### Key Files
| File | What it defines |
|------|-----------------|
| `src/styles/app.css` | Color tokens (oklch), custom classes (`.food-card`, `.food-list-item`), shadows, animations |
| `index.html` | Font loading (DM Sans for headings, Inter for body) |
| `src/components/ui/button.tsx` | Button variants and sizing |
| `src/routes/settings.$connectionId.tsx` | Reference for cards, list items, dialogs, sliders |
| `src/routes/index.tsx` | Reference for page layout, session cards, empty states |

### Avoid
- ❌ Food emojis in UI - use letter avatars or Lucide icons
- ❌ `rounded-xl` on cards/inputs - use `rounded-md`
- ❌ `border-2` on cards - use default border
- ❌ Gradient text - use `text-primary` instead
- ❌ `text-3xl` for titles - use `text-2xl`
- ❌ Exclamation marks or playful language in copy

### Use
- ✅ Letter avatars: `w-8 h-8 rounded-md bg-primary/10 text-primary`
- ✅ Lucide icons from `lucide-solid` at `w-4 h-4`
- ✅ `.food-card` and `.food-list-item` classes from app.css
- ✅ Simple copy: "No restaurants yet", "Select a person"

## Plans

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

---
*Update this file when adding new patterns or significant architecture changes.*
