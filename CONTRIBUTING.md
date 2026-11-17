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
   cd studio && npm run build && npm run lint
   ```

5. Open a pull request saying what changed and why. For interface changes, include a screenshot.

## Where things live

- **Typesetting, file formats, storage:** `core/src/`. Every command the interface calls goes
  through `core/src/api.rs`, and `core/tests/e2e.rs` exercises each one.
- **Interface:** `studio/src/`. Follow the colours, spacing and states in
  [`studio/DESIGN.md`](studio/DESIGN.md).
- **Typesetting numbers:** documented in [`MECHANICS.md`](MECHANICS.md). Update it when you change
  one.

## Ground rules

- **No network calls and no AI features.** Writers' work never leaves their machine. Pull requests
  that add telemetry, cloud sync or AI generation won't be merged.
- **Only openly licensed assets.** Fonts must be under the SIL Open Font License or similar, and
  ornaments should be drawn in code or be your own work.
- Be kind. Everyone here is volunteering their time.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
