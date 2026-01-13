Website to help users choose where to eat.
There will be a spinning whell to choose `Eatery` (food place)

Connections will have their own UUID.

User applies edits to the settings and pushes new settings with the UUID.
Ideally it should be possible to spin wheel from main screen too.

Settings screen will contain ability to add/remove `Eatery` (food place).
Add/remove users.
Configure settings for each user.
Each user will provide their own score to a `Eatery`.

If not yet setup, main page will show "Start fresh" or connect to existing instance.
If Start fresh, will create new settings UUID. And store settings with this UUID.
If connect to existing, Either input manually or scan QR code.
When UUID available, main page will show Spin wheel with all the `Eatery` places on it. And Button to start spin. Toggle list of users available for current spin.
User should be able to select which user they are, and change settings for that user.

If visit home page again after setup, display saved connections list and buttons to start fresh and connect to existing.

When giving scores to eateries there will be a slider from 0 to 100.
When spinning wheel wheel select multiple users participating in current spin.
Wheel will show all places by slices proportionally sized to combined score of current users

## 🌐 Live Demo

The app is hosted on GitHub Pages: **https://\<username\>.github.io/where-to-eat/**

## 🚀 Deployment

This project is configured to automatically deploy to GitHub Pages when you push to the `main` or `master` branch.

### Setting up GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` or `master` branch to trigger the deployment
5. The workflow will build and deploy the app automatically

### Manual Build

To build the project for GitHub Pages locally:

```bash
# Build with GitHub Pages base path
GITHUB_PAGES=true pnpm build:skip-check

# Preview the build (note: preview uses different base path)
pnpm preview
```

## Developer Documentation
See [DEVELOPMENT.md](DEVELOPMENT.md) for architectural details on Peer-to-Peer syncing, multi-tab support, and SSR safety guidelines.
