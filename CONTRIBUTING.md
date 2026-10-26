# Contributing to Xssential

Thanks for your interest in improving Xssential!

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies: `pnpm install` (Node.js 22.12+ and pnpm 10).
3. Start the app you are working on: `pnpm dev:desktop` or `pnpm dev:web`.

## Making changes

- Create a branch from `main`, for example `feat/clipboard-history` or `fix/window-size`.
- Keep pull requests focused on one change.
- Before pushing, run:
  ```bash
  pnpm format
  pnpm typecheck
  pnpm build
  ```
- Describe what changed and why in the pull request. Add screenshots for UI changes.

## Desktop app security

The renderer runs sandboxed with context isolation. Expose new capabilities to it through
explicit, narrow functions in `apps/desktop/src/preload/index.ts` backed by `ipcMain.handle`
in the main process. Do not enable `nodeIntegration`.

## Reporting bugs and requesting features

Use the GitHub issue templates. For security issues, follow [SECURITY.md](SECURITY.md) instead
of opening a public issue.

## Code of conduct

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
