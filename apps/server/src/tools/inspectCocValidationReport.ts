import { readFile } from "node:fs/promises";

import { formatCocValidationInspection, inspectCocValidationReport } from "../pob/cocValidationReport.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const inputPath = args.find((arg) => !arg.startsWith("-")) ?? null;

if (help) {
  printUsage();
  process.exit(0);
}

if (!inputPath && process.stdin.isTTY) {
  printUsage();
  process.exit(1);
}

const input = inputPath ? await readFile(inputPath, "utf8") : await readStdin();
const inspection = inspectCocValidationReport(input);

process.stdout.write(json ? `${JSON.stringify(inspection, null, 2)}\n` : formatCocValidationInspection(inspection));
process.exitCode = inspection.status === "ready-for-review" ? 0 : 2;

function printUsage(): void {
  process.stdout.write(`Usage:
  npm run inspect:coc-report --workspace @pob-item-delta/server -- <report.md>
  Get-Content <report.md> | npm run inspect:coc-report --workspace @pob-item-delta/server --

Options:
  --json    Print the full local inspection result.

The input should be a Copy validation report from the CoC Frost Model panel.
Output includes formula-review readiness, missing observations, and a copyable GitHub issue snippet.
`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
