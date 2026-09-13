import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseBoolean,
  parseFormat,
  parseList,
  parseSeed,
  resolveInputs,
  toAbsolutePath
} from "../../action/src/inputs.js";
import {
  composeErrorSummary,
  composePlanSummary,
  composeSummary,
  decideOutcome,
  dryRunOutcome,
  errorOutcome
} from "../../action/src/summary.js";
import { sanitizeForLog } from "../../action/src/sanitize.js";
import { buildRunResult } from "../../src/reporting/summary.js";
import { renderJUnit } from "../../src/reporting/junit.js";
import { runRecurSpec } from "../../src/index.js";
import type { CaseResult } from "../../src/types/result.js";
import { repoRoot } from "../helpers/acme.js";

function stubCase(overrides: Partial<CaseResult> & { name: string; status: CaseResult["status"] }): CaseResult {
  return {
    description: undefined,
    tags: undefined,
    durationMs: 100,
    hops: 1,
    originalCommand: "acme deploy",
    initialFailure: null,
    failureMatched: true,
    failureDetail: undefined,
    extractedAdvice: [],
    selectedAdvice: null,
    recoverySteps: [],
    blockedReason: undefined,
    verification: [],
    completion: { mode: "retry", verified: true },
    safetyEvaluations: [],
    verifyOk: true,
    trace: { nodes: [], edges: [], path: ["acme deploy"] },
    warnings: [],
    workspace: undefined,
    error: undefined,
    ...overrides
  };
}

function inputGetter(values: Record<string, string>): (name: string) => string {
  return (name: string) => values[name] ?? "";
}

describe("action input parsing", () => {
  it("applies defaults for empty inputs", () => {
    const inputs = resolveInputs(inputGetter({}));
    expect(inputs.config).toBe("recurspec.yml");
    expect(inputs.format).toBe("human");
    expect(inputs.failFast).toBe(false);
    expect(inputs.dryRun).toBe(false);
    expect(inputs.cases).toBeUndefined();
    expect(inputs.tags).toBeUndefined();
    expect(inputs.seed).toBeUndefined();
    expect(inputs.junitPath).toBeUndefined();
    expect(inputs.markdownPath).toBeUndefined();
  });

  it("accepts a custom config path", () => {
    const inputs = resolveInputs(inputGetter({ config: "./configs/test.yml" }));
    expect(inputs.config).toBe("./configs/test.yml");
  });

  it("parses booleans strictly", () => {
    expect(parseBoolean("dry-run", "true")).toBe(true);
    expect(parseBoolean("dry-run", "TRUE")).toBe(true);
    expect(parseBoolean("dry-run", " false ")).toBe(false);
    expect(() => parseBoolean("dry-run", "yes")).toThrow(/dry-run/);
    expect(() => parseBoolean("dry-run", "")).toThrow();
    expect(() => parseBoolean("dry-run", "1")).toThrow();
  });

  it("accepts comma-separated and newline-separated case and tag lists", () => {
    expect(parseList("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(parseList("a\nb\r\nc")).toEqual(["a", "b", "c"]);
    expect(parseList("a, \n ,b")).toEqual(["a", "b"]);
    expect(parseList("")).toBeUndefined();
    expect(parseList("  \n ")).toBeUndefined();
    const inputs = resolveInputs(inputGetter({ case: "one,two", tag: "smoke\nslow" }));
    expect(inputs.cases).toEqual(["one", "two"]);
    expect(inputs.tags).toEqual(["smoke", "slow"]);
  });

  it("validates formats and seeds", () => {
    for (const format of ["human", "json", "junit", "markdown", " JSON "]) {
      expect(parseFormat(format)).toBe(format.trim().toLowerCase());
    }
    expect(() => parseFormat("xml")).toThrow(/human, json, junit, markdown/);
    expect(parseSeed("3")).toBe(3);
    expect(parseSeed("")).toBeUndefined();
    expect(() => parseSeed("abc")).toThrow(/seed/);
  });

  it("resolves report paths against the workspace root", () => {
    const absolute = toAbsolutePath(repoRoot, path.join("reports", "junit.xml"));
    expect(path.isAbsolute(absolute)).toBe(true);
    expect(absolute.startsWith(repoRoot)).toBe(true);
  });
});

describe("action outcomes", () => {
  it("reports pass and failed outcomes from the summary counts", () => {
    const passing = buildRunResult([stubCase({ name: "ok", status: "PASS" })], []);
    expect(decideOutcome(passing)).toEqual({ status: "pass", total: 1, passed: 1, failed: 0, failMessage: null });
    const failing = buildRunResult(
      [stubCase({ name: "ok", status: "PASS" }), stubCase({ name: "bad", status: "RECOVERY_DEAD_END" })],
      []
    );
    const outcome = decideOutcome(failing);
    expect(outcome.status).toBe("failed");
    expect(outcome.total).toBe(2);
    expect(outcome.failMessage).toContain("1 of 2");
  });

  it("defines honest error and dry-run outcomes without fake counts", () => {
    expect(errorOutcome()).toEqual({ status: "error", total: 0, passed: 0, failed: 0, failMessage: null });
    expect(dryRunOutcome(3)).toEqual({ status: "dry-run", total: 3, passed: 0, failed: 0, failMessage: null });
  });
});

describe("action summaries", () => {
  it("composes a concise summary reusing the Markdown reporter", () => {
    const result = buildRunResult(
      [
        stubCase({ name: "ok", status: "PASS" }),
        stubCase({ name: "bad", status: "AMBIGUOUS_RECOVERY", error: undefined })
      ],
      []
    );
    const summary = composeSummary(result, decideOutcome(result));
    expect(summary).toContain("# RecurSpec");
    expect(summary).toContain("1 passed, 1 failed, 2 total.");
    expect(summary).toContain("| Result | Case | Recovery |");
    expect(summary).toContain("AMBIGUOUS_RECOVERY");
  });

  it("escapes hostile case names so the summary table cannot break", () => {
    const result = buildRunResult(
      [stubCase({ name: "evil|name\n`inject`", status: "RECOVERY_DEAD_END" })],
      []
    );
    const summary = composeSummary(result, decideOutcome(result));
    expect(summary).toContain("evil\\|name");
    expect(summary).not.toContain("evil|name\n");
    expect(summary).not.toContain("`inject`");
  });

  it("renders dry-run plans without result counts", () => {
    const summary = composePlanSummary(2, "1. Create isolated workspace\n```\n");
    expect(summary).toContain("# RecurSpec (dry run)");
    expect(summary).toContain("2 planned cases. Nothing was executed.");
    expect(summary).not.toContain("```\n```");
  });

  it("fences configuration error diagnostics", () => {
    const summary = composeErrorSummary("could not find a configuration file\nsecond line");
    expect(summary).toContain("Configuration error");
    expect(summary).toContain("could not find a configuration file");
  });
});

describe("action log sanitization", () => {
  const hostileLines = [
    "::error::boom",
    "::error file=x.ts,line=1::boom",
    "::warning title=test::boom",
    "::notice file=x.ts,col=2::boom",
    "::add-mask::secret",
    "::group::name",
    "::endgroup::",
    "::stop-commands::token",
    "::debug::message",
    "::warning::fake warning from tool",
    "::error::fake annotation from tool",
    "::notice::fake notice",
    "::add-mask::hunter2",
    "::group::fake group",
    "::stop-commands::do-not-obey"
  ];

  // Matches both plain and parameterized workflow-command headers at a line
  // start, mirroring the sanitizer's generic matcher.
  const liveCommand = /^::[A-Za-z][\w-]*(?:[ \t]+[^\r\n]*)?::/m;

  it("neutralizes plain and parameterized workflow commands at line starts", () => {
    for (const line of hostileLines) {
      const sanitized = sanitizeForLog("before\n" + line + "\nafter");
      expect(sanitized).not.toMatch(liveCommand);
      // The payload stays visible for debugging; only the command shape breaks.
      expect(sanitized).toContain("! " + line);
    }
  });

  it("preserves payloads with an explicit marker", () => {
    expect(sanitizeForLog("::error file=x.ts,line=1::boom")).toBe("! ::error file=x.ts,line=1::boom");
  });

  it("leaves normal and mid-line text untouched", () => {
    expect(sanitizeForLog("all clear\nnothing here")).toBe("all clear\nnothing here");
    expect(sanitizeForLog("hello ::error:: world")).toBe("hello ::error:: world");
    expect(sanitizeForLog("prefix::warning::message")).toBe("prefix::warning::message");
    expect(sanitizeForLog("http://example.com/::notice::")).toBe("http://example.com/::notice::");
    expect(sanitizeForLog("a C++ line like foo::bar::baz")).toBe("a C++ line like foo::bar::baz");
    expect(sanitizeForLog("indented ::error::not-a-command")).toBe("indented ::error::not-a-command");
  });

  it("leaves leading-whitespace lines alone: the runner only parses column zero", () => {
    // The GitHub runner matches workflow commands with an ordinal
    // starts-with check, so a leading space or tab already prevents
    // interpretation. Sanitizing these would only corrupt normal output
    // such as the indented evidence blocks in terminal rendering.
    expect(sanitizeForLog(" ::error::message")).toBe(" ::error::message");
    expect(sanitizeForLog("\t::error::message")).toBe("\t::error::message");
  });

  it("handles newlines without joining, splitting, or restyling lines", () => {
    expect(sanitizeForLog("::error::x\r\n::warning::y")).toBe("! ::error::x\r\n! ::warning::y");
    expect(sanitizeForLog("::error::x\n::warning::y")).toBe("! ::error::x\n! ::warning::y");
    expect(sanitizeForLog("::error::x")).toBe("! ::error::x");
    expect(sanitizeForLog("::error::x\n")).toBe("! ::error::x\n");
    expect(sanitizeForLog("ok\n\n::error::x\n\ntail")).toBe("ok\n\n! ::error::x\n\ntail");
    expect(sanitizeForLog("::error::first")).toBe("! ::error::first");
    expect(sanitizeForLog("")).toBe("");
  });

  it("neutralizes hostile tool output flowing through the real JUnit renderer", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rs-action-hostile-"));
    // Include parameterized commands: they are the documented norm and the
    // form the previous matcher missed.
    const hostileFixture = [
      ...hostileLines,
      "::error file=owned.ts,line=1::injected",
      "::warning title=Injected::message"
    ];
    try {
      // Drive the hostile output through a real failing case: the tool
      // writes the hostile lines, recovery succeeds, the rerun fails
      // identically, and the dead-end evidence carries the hostile text.
      const script =
        hostileFixture.map((l) => "console.error(" + JSON.stringify(l) + ");").join("\n") + "\nprocess.exit(1);\n";
      await writeFile(path.join(dir, "main.mjs"), script, "utf8");
      await writeFile(
        path.join(dir, "recurspec.yml"),
        [
          "version: 1",
          "cases:",
          "  - name: hostile-output",
          "    workspace:",
          "      copy: [main.mjs]",
          "    run:",
          "      command: node",
          "      args: [main.mjs]",
          "    failure:",
          "      exitCode: nonzero",
          "    recovery:",
          "      steps:",
          "        - command: node",
          "          args: ['-e', 'process.exit(0)']",
          "    verify:",
          "      rerunOriginal: true",
          "      exitCode: 0",
          ""
        ].join("\n"),
        "utf8"
      );
      const hostile = await runRecurSpec({ cwd: dir });
      expect(hostile.cases[0]?.status).toBe("RECOVERY_DEAD_END");
      expect(hostile.cases[0]?.initialFailure?.stderr).toContain("::add-mask::hunter2");
      // The JUnit renderer embeds the initial tool output verbatim at line
      // starts, so with format=junit the console log would carry live
      // workflow commands without Action sanitization.
      const raw = renderJUnit(hostile);
      expect(raw).toMatch(/^::error::fake annotation from tool/m);
      expect(raw).toMatch(/^::error file=owned\.ts,line=1::injected/m);
      const sanitized = sanitizeForLog(raw);
      expect(sanitized).not.toMatch(liveCommand);
      expect(sanitized).toContain("RECOVERY_DEAD_END");
      expect(sanitized).toContain("fake annotation from tool");
      expect(sanitized).toContain("! ::error file=owned.ts,line=1::injected");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("action against a real fixture", () => {
  it("classifies a missing executable as a failed contract, not a harness error", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rs-action-"));
    try {
      await mkdir(path.join(dir, "demo", "acme-cli"), { recursive: true });
      await cp(
        path.join(repoRoot, "demo", "acme-cli", "acme.mjs"),
        path.join(dir, "demo", "acme-cli", "acme.mjs")
      );
      await writeFile(
        path.join(dir, "recurspec.yml"),
        [
          "version: 1",
          "cases:",
          "  - name: cli-pass",
          "    workspace:",
          "      copy: [demo/acme-cli/**]",
          "    run:",
          "      command: recurspec-definitely-not-a-real-binary",
          "      args: [demo/acme-cli/acme.mjs, deploy]",
          "    failure:",
          "      exitCode: nonzero",
          "    recovery:",
          "      source: output",
          "    verify:",
          "      rerunOriginal: true",
          "      exitCode: 0",
          ""
        ].join("\n"),
        "utf8"
      );
      const result = await runRecurSpec({ cwd: dir });
      const outcome = decideOutcome(result);
      expect(result.cases[0]?.status).toBe("INTERNAL_ERROR");
      expect(outcome).toMatchObject({ status: "failed", total: 1, passed: 0, failed: 1 });
      expect(outcome.failMessage).toContain("1 of 1");
      const summary = composeSummary(result, outcome);
      expect(summary).toContain("INTERNAL_ERROR");
      expect(summary).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
