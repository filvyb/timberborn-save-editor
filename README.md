# Timberborn Save Editor

A fork of [charperbonaroo/timberborn-save-editor](https://github.com/charperbonaroo/timberborn-save-editor), updated for **Timberborn 1.1**. Edit `.timber` and `.json` saves locally in your browser.

## Changes in this fork

- Timberborn 1.1 saves, inventories, construction, beavers and voxel maps.
- Easy, Normal and Hard difficulty presets.
- Export preserves metadata, thumbnails and unknown save data.
- React 19, TypeScript, Vite and npm; updated dependencies.
- Regression tests, browser tests and automatic GitHub Pages deployment.

Keep your original save as a backup. Tested with 1.1.2.4 saves and legacy examples.

## Development

Requires **Node.js 22.12+**.

```sh
npm ci
npm start
```

```sh
npm test                         # Includes local saves/ files when present
npm run build                    # Type-check and build to dist/
npx playwright install chromium
npm run test:e2e                  # Browser tests
```

## Deployment

Set **Settings → Pages → Source** to **GitHub Actions**. Pushes to the default branch deploy after tests and builds pass on Node 22 and 24.
