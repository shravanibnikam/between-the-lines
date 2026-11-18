# Contributing to Between the Lines

Thanks for helping make book formatting free for every indie writer. Bug reports, fixes, new
designs and documentation are all welcome.

## Reporting a bug

[Open an issue](https://github.com/shravanibnikam/between-the-lines/issues) with:

- what you did, what you expected, and what happened instead;
- your OS and the app version;
- for layout or export problems, a screenshot of the page and the design you used.

Please don't attach a manuscript you don't want to be public.

## Making a change

1. Fork the repo and create a branch from `main`.
2. Set up the app as described in [Get started](README.md#get-started).
3. Make your change. Keep it focused: one fix or feature per pull request.
4. Run the same checks CI runs:

   ```sh
   cargo test --manifest-path core/Cargo.toml
   cd studio && npm run build && npm run lint && npm test
   ```

5. Open a pull request saying what changed and why. For interface changes, include a screenshot.

## Where things live

- **Typesetting, file formats, storage:** `core/src/`. Every command the interface calls goes
  through `core/src/api.rs`, and `core/tests/e2e.rs` exercises each one.
- **Interface:** `studio/src/`. Follow the colours, spacing and states in
  [`studio/DESIGN.md`](studio/DESIGN.md).
- **Typesetting numbers:** documented in [`MECHANICS.md`](MECHANICS.md). Update it when you change
  one.

## Signing releases

Pushing a `v*` tag runs `.github/workflows/release.yml`, which drafts a GitHub release with
macOS, Windows and Linux builds. Signing is optional: each platform is signed only when its
repository secrets are set, so forks still build.

- **macOS** (Apple Developer Program): `APPLE_CERTIFICATE` (the Developer ID Application
  certificate exported as `.p12`, base64-encoded), `APPLE_CERTIFICATE_PASSWORD` and
  `APPLE_SIGNING_IDENTITY` sign the app. Add `APPLE_ID`, `APPLE_PASSWORD` (an app-specific
  password) and `APPLE_TEAM_ID` to notarize it as well, which is what stops the Gatekeeper
  warning. Without a certificate the app is ad-hoc signed, so it opens after right-click > Open.
- **Windows** ([Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/)):
  `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and `AZURE_TENANT_ID` for an app registration with the
  *Trusted Signing Certificate Profile Signer* role, plus `TRUSTED_SIGNING_ENDPOINT` (e.g.
  `https://eus.codesigning.azure.net`), `TRUSTED_SIGNING_ACCOUNT` and `TRUSTED_SIGNING_PROFILE`.
  Without them SmartScreen warns on first run.
- **Linux** builds (AppImage, `.deb`, `.rpm`) aren't signed.

## Ground rules

- **No network calls and no AI features.** Writers' work never leaves their machine. Pull requests
  that add telemetry, cloud sync or AI generation won't be merged.
- **Only openly licensed assets.** Fonts must be under the SIL Open Font License or similar, and
  ornaments should be drawn in code or be your own work.
- Be kind. Everyone here is volunteering their time.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
