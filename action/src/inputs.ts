// Input parsing and validation for the RecurSpec GitHub Action.
// Pure functions with no side effects: they take raw input strings and
// return validated values or throw an Error with a message suitable for
// failing the Action step. Keeping this logic here (instead of inline in
// main.ts) makes it unit testable without Action runtime state.
import path from "node:path";

export type OutputFormat = "human" | "json" | "junit" | "markdown";

const VALID_FORMATS: readonly OutputFormat[] = ["human", "json", "junit", "markdown"];

export interface ActionInputs {
  config: string;
  format: OutputFormat;
  failFast: boolean;
  dryRun: boolean;
  cases: string[] | undefined;
  tags: string[] | undefined;
  seed: number | undefined;
  junitPath: string | undefined;
  markdownPath: string | undefined;
}

// Strict boolean parsing: GitHub boolean inputs are conventionally the
// strings "true" and "false". Anything else is rejected with the input name
// so a typo like "flase" cannot silently become false.
export function parseBoolean(name: string, raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(
    "Invalid value for input " + JSON.stringify(name) + ": " + JSON.stringify(raw) + '. Expected "true" or "false".'
  );
}

export function parseFormat(raw: string): OutputFormat {
  const normalized = raw.trim().toLowerCase();
  if ((VALID_FORMATS as readonly string[]).includes(normalized)) return normalized as OutputFormat;
  throw new Error(
    'Invalid format ' + JSON.stringify(raw) + ". Expected one of: " + VALID_FORMATS.join(", ") + "."
  );
}

// Accepts comma-separated or newline-separated values, trims whitespace,
// drops empties. Returns undefined when nothing remains so callers keep the
// existing "no filter" semantics of the CLI and programmatic API.
export function parseList(raw: string): string[] | undefined {
  const items = raw
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return items.length > 0 ? items : undefined;
}

export function parseSeed(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Error("Invalid value for input " + JSON.stringify("seed") + ": " + JSON.stringify(raw) + ". Expected a number.");
  }
  return value;
}

function optionalPath(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Report paths are resolved against the workspace root so follow-up steps
// can consume the absolute output paths reliably on every platform.
export function toAbsolutePath(cwd: string, filePath: string): string {
  // Node path APIs only: no manual separator handling.
  return path.resolve(cwd, filePath);
}

// `getInput` is the @actions/core getInput function (or a test double with
// the same shape). All validation errors throw with the offending input name.
export function resolveInputs(getInput: (name: string) => string): ActionInputs {
  return {
    config: getInput("config").trim() || "recurspec.yml",
    format: parseFormat(getInput("format").trim() || "human"),
    failFast: parseBoolean("fail-fast", getInput("fail-fast").trim() || "false"),
    dryRun: parseBoolean("dry-run", getInput("dry-run").trim() || "false"),
    cases: parseList(getInput("case")),
    tags: parseList(getInput("tag")),
    seed: parseSeed(getInput("seed")),
    junitPath: optionalPath(getInput("junit")),
    markdownPath: optionalPath(getInput("markdown"))
  };
}
