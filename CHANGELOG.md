# Changelog

## Unreleased

### Added

- GitHub Action (`action.yml`): run recovery contracts in CI with
  `uses: chrisriv10/RecurSpec`, with Job Summary, step outputs, and optional
  JUnit/Markdown report files. See `docs/github-action.md`.

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
