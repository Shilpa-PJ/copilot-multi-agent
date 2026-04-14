#!/usr/bin/env node
/**
 * Orchestrator — runs Agent 1 then Agent 2 in sequence.
 *
 * Usage:
 *   node scripts/run_pipeline.js --repo ./path/to/repo
 *   node scripts/run_pipeline.js --repo ./path/to/repo --format html
 *
 * What it does:
 *   1. Runs Agent 1 (analyzer) → outputs/arch_context.json
 *   2. Runs Agent 2 (explainer) → outputs/explanation.md (or .html)
 *   3. Prints a summary of both outputs
 */

const { execSync } = require("child_process");
const path  = require("path");
const fs    = require("fs");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { repo: ".", format: "markdown" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo")   result.repo   = args[i + 1];
    if (args[i] === "--format") result.format = args[i + 1];
  }
  return result;
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  const { repo, format } = parseArgs();
  const ext = format === "html" ? "html" : "md";

  console.log("═══════════════════════════════════════════════════");
  console.log("  GitHub Copilot Multi-Agent Pipeline");
  console.log("═══════════════════════════════════════════════════\n");

  // ── Step 1: Agent 1 ──────────────────────────────────────────────────
  console.log("▶  STEP 1 — Repository Analyzer (Agent 1)\n");
  run(`node ${path.join(__dirname, "../agents/agent1_analyzer.js")} --repo ${repo} --out ./outputs/arch_context.json`);

  // ── Step 2: Agent 2 ──────────────────────────────────────────────────
  console.log("▶  STEP 2 — Plain-English Explainer (Agent 2)\n");
  run(`node ${path.join(__dirname, "../agents/agent2_explainer.js")} --context ./outputs/arch_context.json --out ./outputs/explanation.${ext} --format ${format}`);

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅  Pipeline complete! Output files:");
  console.log(`     • outputs/arch_context.json  — Architecture data (Agent 1)`);
  console.log(`     • outputs/explanation.${ext}  — Plain-English report (Agent 2)`);
  console.log("═══════════════════════════════════════════════════\n");

  // Validate outputs
  const ctxPath = path.resolve("./outputs/arch_context.json");
  const expPath = path.resolve(`./outputs/explanation.${ext}`);

  if (fs.existsSync(ctxPath)) {
    const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
    console.log(`📊  Analyzed: ${ctx.repo_name}`);
    console.log(`    Pattern:    ${ctx.architecture_pattern}`);
    console.log(`    Components: ${ctx.components?.length || 0}`);
    console.log(`    Stack:      ${(ctx.tech_stack || []).join(", ")}\n`);
  }

  if (fs.existsSync(expPath)) {
    const size = fs.statSync(expPath).size;
    console.log(`📄  Explanation: ${expPath} (${size} bytes)\n`);
  }
}

main();
