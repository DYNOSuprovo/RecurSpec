// Entry point for the RecurSpec GitHub Action (bundled to
// action/dist/index.js). Order of operations is deliberate: run once,
// collect the result, write logs/summary/files/outputs, and only then set
// the final failure state, so reporting is never skipped on failure.
import * as core from "@actions/core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runRecurSpec, selectCases, type RunResult } from "../../src/index.js";
import { buildPlans, renderPlanTerminal } from "../../src/planning/plan.js";
import { renderJson } from "../../src/reporting/json-reporter.js";
import { renderJUnit } from "../../src/reporting/junit.js";
import { renderMarkdown } from "../../src/reporting/markdown.js";
import { renderTerminal } from "../../src/reporting/terminal.js";
import { resolveInputs, toAbsolutePath, type ActionInputs } from "./inputs.js";
import { sanitizeForLog } from "./sanitize.js";
import {
  composeErrorSummary,
  composePlanSummary,
  composeSummary,
  decideOutcome,
  dryRunOutcome,
  errorOutcome
} from "./summary.js";

// Job Summary support is universal on real runners, but a summary write
// must never mask the actual result if the platform file is unavailable.
async function writeSummary(markdown: string): Promise<void> {
  try {
    await core.summary.addRaw(markdown).write();
  } catch (err) {
    core.warning(sanitizeForLog("Could not write the RecurSpec job summary: " + String((err as Error)?.message ?? err)));
  }
}

function setCountOutputs(outcome: { status: string; total: number; passed: number; failed: number }): void {
  core.setOutput("status", outcome.status);
  core.setOutput("total", String(outcome.total));
  core.setOutput("passed", String(outcome.passed));
  core.setOutput("failed", String(outcome.failed));
}

async function writeReportFile(filePath: string, content: string): Promise<string> {
  const absolute = toAbsolutePath(process.cwd(), filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return absolute;
}

function renderConsole(result: RunResult, inputs: ActionInputs): string {
  if (inputs.format === "json") return renderJson(result);
  if (inputs.format === "junit") return renderJUnit(result);
  if (inputs.format === "markdown") return renderMarkdown(result);
  return renderTerminal(result, {}) + "\n";
}

async function runDryRun(inputs: ActionInputs, configPath: string): Promise<void> {
  // Same architecture as the CLI dry-run path: select, plan, render. The
  // suite never executes, so no pass/fail counts are reported.
  const selection = await selectCases(process.cwd(), {
    configPath,
    filterCases: inputs.cases,
    filterTags: inputs.tags
  });
  if (inputs.junitPath !== undefined || inputs.markdownPath !== undefined) {
    const outcome = dryRunOutcome(selection.cases.length);
    setCountOutputs(outcome);
    core.setFailed("The junit and markdown file outputs are not supported with dry-run: no contracts were executed.");
    return;
  }
  const plans = buildPlans(selection.config, selection.cases);
  const rendered = renderPlanTerminal(plans) + "Dry run: nothing was executed.\n";
  core.info(sanitizeForLog(rendered));
  const outcome = dryRunOutcome(plans.length);
  await writeSummary(composePlanSummary(plans.length, rendered));
  setCountOutputs(outcome);
}

async function run(): Promise<void> {
  let inputs: ActionInputs;
  try {
    inputs = resolveInputs(core.getInput);
  } catch (err) {
    const outcome = errorOutcome();
    setCountOutputs(outcome);
    core.setFailed(sanitizeForLog("Invalid input: " + String((err as Error).message)));
    return;
  }

  const cwd = process.cwd();
  const configPath = toAbsolutePath(cwd, inputs.config);

  if (inputs.dryRun) {
    try {
      await runDryRun(inputs, configPath);
    } catch (err) {
      const outcome = errorOutcome();
      setCountOutputs(outcome);
      await writeSummary(composeErrorSummary(String((err as Error).message)));
      core.setFailed(sanitizeForLog("Configuration error: " + String((err as Error).message)));
    }
    return;
  }

  // One execution; every representation below renders from this object.
  let result;
  try {
    result = await runRecurSpec({
      cwd,
      configPath,
      filterCases: inputs.cases,
      filterTags: inputs.tags,
      failFast: inputs.failFast,
      seed: inputs.seed
    });
  } catch (err) {
    const message = String((err as Error).message);
    const outcome = errorOutcome();
    await writeSummary(composeErrorSummary(message));
    setCountOutputs(outcome);
    core.setFailed(sanitizeForLog("Configuration error: " + message));
    return;
  }

  core.info(sanitizeForLog(renderConsole(result, inputs)));

  if (inputs.junitPath !== undefined) {
    const absolute = await writeReportFile(inputs.junitPath, renderJUnit(result));
    core.setOutput("junit-path", absolute);
  } else {
    core.setOutput("junit-path", "");
  }
  if (inputs.markdownPath !== undefined) {
    const absolute = await writeReportFile(inputs.markdownPath, renderMarkdown(result));
    core.setOutput("markdown-path", absolute);
  } else {
    core.setOutput("markdown-path", "");
  }

  const outcome = decideOutcome(result);
  await writeSummary(composeSummary(result, outcome));
  setCountOutputs(outcome);
  if (outcome.failMessage !== null) {
    core.setFailed(outcome.failMessage);
  }
}

// No top-level await: the committed bundle is CommonJS, which does not
// support it. Rejections funnel into setFailed so unexpected failures still
// fail the step instead of crashing silently.
void run().catch((err: unknown) => {
  core.setFailed(sanitizeForLog("Internal error: " + String((err as Error)?.message ?? err)));
});
