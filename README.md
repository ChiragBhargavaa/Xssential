<p align="center">
  <img src="apps/web/public/logo.png" width="96" alt="Xssential logo" />
</p>

<h1 align="center">Xssential</h1>

<p align="center">
  The essential toolkit for your desktop. Free and open source, for macOS and Windows.
</p>

<p align="center">
  <a href="https://github.com/ChiragBhargavaa/Xssential/releases/latest">Download</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="LICENSE">MIT License</a>
</p>

---

## Download

| Platform                        | Installer                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| macOS (Apple Silicon and Intel) | [Xssential-mac-universal.dmg](https://github.com/ChiragBhargavaa/Xssential/releases/latest/download/Xssential-mac-universal.dmg) |
| Windows 10+ (64-bit)            | [Xssential-win-setup.exe](https://github.com/ChiragBhargavaa/Xssential/releases/latest/download/Xssential-win-setup.exe)         |

## Repository layout

This is a [pnpm](https://pnpm.io) monorepo:

```
apps/
  desktop/   Electron + React + Vite + Tailwind desktop app (electron-vite, electron-builder)
  web/       Next.js landing page, exported as a static site
.github/
  workflows/
    ci.yml        Format, typecheck and build on every push and PR
    release.yml   Builds the macOS and Windows installers and publishes them to GitHub Releases
    pages.yml     Deploys the landing page to GitHub Pages
```

## Development

Requirements: Node.js 22.12+ and pnpm 10 (`corepack enable` installs the pinned pnpm).

```bash
pnpm install
pnpm dev:desktop   # run the desktop app with hot reload
pnpm dev:web       # run the landing page at http://localhost:3000
```

Other scripts:

| Command                           | What it does                                      |
| --------------------------------- | ------------------------------------------------- |
| `pnpm build`                      | Build both apps                                   |
| `pnpm typecheck`                  | Typecheck both apps                               |
| `pnpm format`                     | Format everything with Prettier                   |
| `pnpm dist:mac` / `pnpm dist:win` | Build installers locally into `apps/desktop/dist` |

Build each installer on its own OS: macOS builds need a Mac, and Windows builds are most reliable on Windows. CI handles both.

## Releasing

1. Bump `version` in `apps/desktop/package.json` (for example `0.2.0`) and commit.
2. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin main --tags
   ```
3. The **Release desktop app** workflow builds `Xssential-mac-universal.dmg` and `Xssential-win-setup.exe` and publishes them to a GitHub Release.

The landing page and the table above link to `releases/latest/download/<file>`, so they point at the new version as soon as it is published. Installed apps update themselves through `electron-updater`.

### Code signing (optional, recommended)

Without signing, the release still builds, but macOS Gatekeeper and Windows SmartScreen warn users when they open the app. To sign, add these repository secrets:

| Secret                                                     | Purpose                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`                     | Base64 Developer ID Application `.p12` and its password |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Notarization with Apple                                 |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | Windows code signing certificate                        |

Auto-update on macOS only works for signed builds.

## Landing page hosting

The site is a static export (`apps/web/out`), so it can be hosted anywhere:

- **GitHub Pages:** go to _Settings → Pages_ and set **Source** to **GitHub Actions**. `pages.yml` deploys on every push to `main` that touches `apps/web`.
- **Vercel / Netlify / Cloudflare Pages:** set the root directory to `apps/web`, the build command to `pnpm build` and the output directory to `out`.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
