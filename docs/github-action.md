# GitHub Action

Run RecurSpec recovery contracts in CI without setting up Node, pnpm, or the
CLI yourself. The Action bundles RecurSpec and its dependencies, executes one
run, then reports through logs, Job Summary, step outputs, and optional files.

## Use

```yaml
name: RecurSpec

on:
  pull_request:
  push:
    branches: [main]

jobs:
  recurspec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: chrisriv10/RecurSpec@v0.2.0
        with:
          config: recurspec.yml
```

The Action debuted in `v0.2.0`: the `v0.1.0` tag predates it and cannot run
Action steps. Pin real workflows to an immutable release tag or commit SHA;
see Version pinning.

## Inputs

| Input      | Default         | Description                                                        |
|------------|-----------------|--------------------------------------------------------------------|
| `config`   | `recurspec.yml` | Path to the RecurSpec config, relative to the workspace root.      |
| `format`   | `human`         | Console output format: `human`, `json`, `junit`, or `markdown`.    |
| `fail-fast`| `"false"`       | Stop after the first failing contract. Must be `"true"`/`"false"`. |
| `dry-run`  | `"false"`       | Print the execution plan without running anything.                  |
| `case`     | `""`            | Only run these cases. Comma-separated or newline-separated.         |
| `tag`      | `""`            | Only run cases with these tags. Comma-separated or newline-separated. |
| `seed`     | `""`            | Record a seed in the run summary. Must be a number.                 |
| `junit`    | `""`            | Write a JUnit XML report to this path. Not supported with `dry-run`. |
| `markdown` | `""`            | Write a Markdown report to this path. Not supported with `dry-run`. |

`format` controls only the console log rendering. The summary, outputs, and
report files are always derived from the same in-memory result, so one
`format` choice never removes data from the others. A single suite execution
backs every representation; the Action never runs the suite twice.

Invalid inputs (unknown format, malformed boolean, non-numeric seed, missing
config file) fail the step with a message naming the problem.

## Outputs

| Output          | Description                                                              |
|-----------------|--------------------------------------------------------------------------|
| `status`        | `pass`, `failed`, `error`, or `dry-run`.                                 |
| `total`         | Contract count (planned cases for `dry-run`, `0` when config failed).    |
| `passed`        | Passing contracts. Always `0` for `dry-run` and `error`.                 |
| `failed`        | Failing contracts. Always `0` for `dry-run` and `error`.                 |
| `junit-path`    | Absolute path of the written JUnit file, or empty when unset.            |
| `markdown-path` | Absolute path of the written Markdown file, or empty when unset.         |

The full JSON result is deliberately not exposed as an output: large payloads
risk hitting step-output size limits. Use the `junit`/`markdown` file inputs
for machine-readable results.

## Exit behavior

The Action preserves RecurSpec exit semantics:

* passing suite: step succeeds, `status` is `pass`.
* failed contract: step fails with `"<failed> of <total> recovery contracts failed."`, `status` is `failed`.
* invalid configuration: step fails with a `Configuration error:` message, `status` is `error`, counts are `0`.
* dry-run success: step succeeds, `status` is `dry-run`, `total` is the planned case count, `passed`/`failed` are `0`.
* internal product errors surface as failed contracts with their diagnostics in the logs and summary.

Reporting (logs, summary, files, outputs) is always written before the final
failure state is set, so a red step still leaves its evidence behind.

## Job Summary

Each run appends a concise summary: pass/fail/total counts plus the standard
Markdown report table (case, status, recovery chain). Dry runs show the
planned steps instead. Summaries reuse the product Markdown reporter, so they
cannot drift from CLI output. Case names and diagnostics pass through the
reporter's cell escaping, so hostile text cannot break the table.

## Artifacts

The Action writes report files but never uploads them. Upload explicitly:

```yaml
- uses: chrisriv10/RecurSpec@v0.2.0
  id: recurspec
  with:
    config: recurspec.yml
    junit: recurspec-junit.xml
    markdown: recurspec-summary.md

- uses: actions/upload-artifact@v4
  with:
    name: recurspec-reports
    path: |
      ${{ steps.recurspec.outputs.junit-path }}
      ${{ steps.recurspec.outputs.markdown-path }}
```

## Dry run

Inspect recovery plans without executing anything:

```yaml
- uses: chrisriv10/RecurSpec@v0.2.0
  with:
    config: recurspec.yml
    dry-run: "true"
```

The step succeeds and the plan appears in the logs and the Job Summary.
File outputs are rejected in dry-run mode because there is no run for them
to describe; the step fails clearly if they are combined.

## Filtering

```yaml
- uses: chrisriv10/RecurSpec@v0.2.0
  with:
    config: recurspec.yml
    case: "deploy-before-init, expired-session"
    tag: "smoke"
    fail-fast: "true"
    seed: "42"
```

## Version pinning

Reference immutable versions in real workflows. The first tag that can run
the Action is `v0.2.0`; do not use `v0.1.0` for Action steps. Prefer exact
release tags (or stronger, a full commit SHA) over `@main`:

```yaml
- uses: chrisriv10/RecurSpec@v0.2.0
# or, strongest:
- uses: chrisriv10/RecurSpec@<full-commit-sha>
```

A future `v0`/`v1` major moving tag may be offered after the first stable
release; until then, pin exact release tags or SHAs.

## Security considerations

RecurSpec executes recovery commands suggested by failing tools, inside
temporary workspaces, under its normal safety model (no shell by default,
deny/allow lists, blocked-pattern refusal). The Action does not weaken that
model, and an Action wrapper cannot make an unsafe config safe.

Be careful running recovery contracts from untrusted pull-request changes:
a malicious PR could edit `recurspec.yml` or fixture scripts to propose
harmful recovery commands. If you run this Action on `pull_request` from
forks, review what the config is allowed to execute, use `allowedCommands`
or restrictive `denyCommands`, keep `shell: false`, and avoid passing secrets
the recovery processes do not need. The Action never prints environment
variables, secrets, or the GitHub token itself; RecurSpec's `secrets` config
masks listed values in stored output. Lines of tool output that open with a
workflow-command shape (`::name::...`) are neutralized in Action log output
so untrusted diagnostics cannot forge annotations, masks, or groups; report
files and the Job Summary file are not parsed for workflow commands and stay
byte-identical to the CLI renderers.

## Cross-platform notes

The Action runs on Linux, macOS, and Windows runners (`runs.using: node24`).
All paths go through Node path APIs. Config values use forward slashes, which
work on all three platforms. Report output paths are returned absolute so
follow-up steps consume them reliably.

## Development

The entrypoint `action/dist/index.js` is a committed esbuild bundle built
from `action/src/` via `pnpm build:action`. Rebuild it after any Action
source change; CI fails if the bundle is stale. Contributors validating
unreleased Action changes can point workflows at `@main`, but released
workflows should use exact tags.
