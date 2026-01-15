# 🎡 Where To Eat

> *Because "I don't know, where do YOU want to eat?" is not a valid dinner plan.*

A peer-to-peer web app that settles the eternal question of where to eat — democratically, with a spinning wheel, and zero arguments (okay, maybe fewer arguments).

![SolidJS](https://img.shields.io/badge/SolidJS-1.9-blue?logo=solid&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript&logoColor=white)
![PeerJS](https://img.shields.io/badge/P2P-PeerJS-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

### 🌐 [Live Demo →](https://woyken.github.io/where-to-eat/)

---

## Features

| Feature | Description |
|---------|-------------|
| **Weighted Wheel** | Spin to decide! Slice sizes reflect combined preferences — no more "I hate that place" surprises |
| **Multi-user Scoring** | Everyone rates restaurants 0-100. Democracy meets dinner |
| **P2P Sync** | Share via QR code or link. Changes sync instantly — no server, no signup |
| **Offline-First** | Works without internet. Syncs when you reconnect. PWA ready |
| **Veto Power** | Mark a place as "never pick" to remove it from the wheel entirely |

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Start with P2P server (for local testing)
pnpm dev:full
```

Then open [http://localhost:5173](http://localhost:5173) and spin away!

---

## How It Works

1. **Create a Session** — Start fresh or join an existing one via QR code
2. **Add Restaurants** — Build your list of potential destinations
3. **Rate Everything** — Each person scores restaurants (be honest, Karen)
4. **Pick Participants** — Select who's eating today
5. **Spin the Wheel** — Let fate (and math) decide
6. **Eat** — The hard part is over

The wheel calculates segment sizes based on the **combined scores** of selected participants. Higher scores = bigger slices = better odds. It's basically democracy, but tastier.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [SolidJS](https://www.solidjs.com/) — Fine-grained reactivity |
| Router | [TanStack Router](https://tanstack.com/router) — Type-safe file-based routing |
| Styling | Tailwind CSS 4 + [solid-ui](https://www.solid-ui.com/) components |
| P2P | [PeerJS](https://peerjs.com/) + Service Worker for offline reliability |
| Validation | [Valibot](https://valibot.dev/) — Lightweight schema validation |
| Build | Vite + PWA plugin |
| Testing | Playwright E2E |

---

## PWA Support

Install it on your phone for the full experience:
- iOS: Safari → Share → "Add to Home Screen"
- Android: Chrome → Menu → "Install App"

Works offline. Syncs when online. Never miss a spin.

---

## Testing

```bash
# Run all E2E tests
pnpm test:e2e

# Interactive UI mode
pnpm test:e2e:ui

# View test report
pnpm test:e2e:report
```

---

## Deployment

### GitHub Pages (Automatic)

Push to `main` and GitHub Actions handles the rest.

### Manual Build

```bash
# Build for production
pnpm build

# Preview locally
pnpm preview
```

### Environment

Set `GITHUB_PAGES=true` for GitHub Pages base path configuration.

---

## Documentation

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture details on P2P syncing, multi-tab support, and contribution guidelines.

---

## Contributing

Found a bug? Have an idea? PRs welcome!

Just remember: this app exists because groups of humans have spent countless hours debating dinner. You're helping solve a problem as old as friendship itself.

---

## License

MIT — Spin freely, eat responsibly.

---

<p align="center">
  <i>Built with 🍕 by hungry developers</i>
</p>
