// Outcome classification and Job Summary composition for the RecurSpec
// GitHub Action. Pure functions: status values and summary text are derived
// from the RecurSpec result object, never by scraping terminal output. Table
// rendering is reused from the existing Markdown reporter so the summary
// cannot drift from product reporting.

import type { RunResult } from "../../src/types/result.js";
import { renderMarkdown } from "../../src/reporting/markdown.js";

export type ActionStatus = "pass" | "failed" | "error" | "dry-run";

export interface ActionOutcome {
  status: ActionStatus;
  total: number;
  passed: number;
  failed: number;
  // Non-null when the Action step must fail. Kept separate from the summary
  // so callers set failure state only after summary and outputs are written.
  failMessage: string | null;
}

// A real execution always carries its counts. failed > 0 fails the step but
// the message stays at the suite level; per-case evidence lives in the logs
// and the summary table.
export function decideOutcome(result: RunResult): ActionOutcome {
  const total = result.summary.total;
  const passed = result.summary.passed;
  const failed = result.summary.failed;
  if (failed > 0) {
    return {
      status: "failed",
      total,
      passed,
      failed,
      failMessage: failed + " of " + total + " recovery contracts failed."
    };
  }
  return { status: "pass", total, passed, failed, failMessage: null };
}

// Configuration and usage errors never produce a RunResult. They still fail
// the step, with zero counts that honestly report that nothing executed.
export function errorOutcome(): ActionOutcome {
  return { status: "error", total: 0, passed: 0, failed: 0, failMessage: null };
}

// Dry runs execute nothing, so they report no pass or fail counts. The total
// is the number of planned cases, which is factual plan data, not a result.
export function dryRunOutcome(planCount: number): ActionOutcome {
  return { status: "dry-run", total: planCount, passed: 0, failed: 0, failMessage: null };
}

// Concise summary: counts plus the existing Markdown report table. Case
// names, commands, and diagnostics pass through the reporter's cell escaping
// (pipes, backticks, newlines), so hostile text cannot break the table or
// inject content outside it.
export function composeSummary(result: RunResult, outcome: ActionOutcome): string {
  const lines: string[] = [];
  lines.push("# RecurSpec");
  lines.push("");
  lines.push(
    outcome.passed + " passed, " + outcome.failed + " failed, " + outcome.total + " total."
  );
  lines.push("");
  lines.push(renderMarkdown(result).trimEnd());
  lines.push("");
  return lines.join("\n");
}

// Minimal summary for configuration and usage errors, which never produce a
// result object. The message is fenced so multi-line diagnostics cannot
// break the surrounding Markdown.
export function composeErrorSummary(message: string): string {
  const lines: string[] = [];
  lines.push("# RecurSpec");
  lines.push("");
  lines.push("Configuration error: no contracts were executed.");
  lines.push("");
  lines.push("```text");
  lines.push(message.replace(/```/g, "'''").trimEnd().slice(0, 4000));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

// Dry-run summary embeds the CLI's own plan rendering verbatim, so Action
// and CLI dry-run output cannot drift. Triple backticks in plan content are
// neutralized so the fence cannot be broken out of.
export function composePlanSummary(planCount: number, renderedPlan: string): string {
  const lines: string[] = [];
  lines.push("# RecurSpec (dry run)");
  lines.push("");
  lines.push(planCount + " planned cases. Nothing was executed.");
  lines.push("");
  lines.push("```text");
  lines.push(renderedPlan.replace(/```/g, "'''").trimEnd());
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}
