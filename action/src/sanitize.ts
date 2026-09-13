// Workflow-command sanitization for Action log output.
// The GitHub runner interprets a stdout line as a workflow command when it
// opens with `::`, in both the plain form (`::error::message`) and the
// documented parameterized form (`::error file=app.js,line=1::message`).
// Untrusted tool output echoed into Action logs (for example through JUnit
// failure bodies) could otherwise forge annotations, masks, or groups, or
// freeze command processing via `::stop-commands::`. The matcher targets
// that generic `::name[ params]::` header shape instead of a hand-maintained
// command list, so unknown and future commands are covered too. The
// `::stop-commands::` line itself is always neutralized, which also keeps
// the `::<token>::` resume form inert.
// Only column-zero headers are neutralized: the runner matches lines with
// an ordinal starts-with check, so leading whitespace (spaces or tabs)
// already prevents interpretation and is left alone. Likewise, mid-line
// occurrences are harmless and untouched, preserving fidelity. Newline style
// (LF vs CRLF) is preserved exactly; lines are never joined or split.
// Report files and the Job Summary file are never parsed for workflow
// commands and are left byte-identical to the CLI renderers. This is
// Action-layer presentation only: normal CLI behavior is unchanged.
const WORKFLOW_COMMAND_HEADER = /^::[A-Za-z][\w-]*(?:[ \t]+[^\r\n]*)?::/;

export function sanitizeForLog(text: string): string {
  return text
    .split(/(\r?\n)/)
    .map((part, index) =>
      index % 2 === 0 && WORKFLOW_COMMAND_HEADER.test(part) ? "! " + part : part
    )
    .join("");
}
