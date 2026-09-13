# Changelog

## 0.2.0

### Added

- First-class GitHub Action (`action.yml`, `runs.using: node24`): run
  recovery contracts in CI with `uses: chrisriv10/RecurSpec@v0.2.0`, with no
  caller-side Node or pnpm setup. See `docs/github-action.md`.
- Action Job Summary with pass/fail/total counts and the Markdown report
  table, reusing the product reporter.
- Structured Action outputs (`status`, `passed`, `failed`, `total`) plus
  optional JUnit and Markdown report files with absolute output paths.
- Action dry-run, case/tag filtering, fail-fast, and seed support.
- Workflow-command injection hardening for Action logs: tool output lines
  shaped like `::name::` or `::name params::` commands are neutralized in
  log output while report files stay byte-identical to CLI renderers.
- Markdown reporter preserves ambiguity candidate commands (#11).

### Fixed

- Eliminated concurrent `dist` rebuilds across Vitest workers by building
  once in global setup, fixing a Windows-only flaky CLI test.

## 0.1.0

### Added

- Recovery contracts for command-line tools.
- Recovery command extraction from stdout and stderr.
- Retry, goal, and custom completion modes.
- Multi-step recovery chains and loop detection.
- Command safety checks.
- Temporary workspace isolation.
- Human, JSON, JUnit, and Markdown reporters.
- Dry-run planning.
- Real CLI fixtures for Git, Cargo, and npm.
