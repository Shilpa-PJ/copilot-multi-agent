#!/usr/bin/env node
/**
 * Agent 2 — Plain-English Explainer
 *
 * Reads the arch_context.json produced by Agent 1 and calls the
 * GitHub Copilot / OpenAI-compatible API to generate a plain-English
 * explanation that anyone (non-developer) can understand.
 *
 * Usage:
 *   node agents/agent2_explainer.js
 *   node agents/agent2_explainer.js --context ./outputs/arch_context.json --out ./outputs/explanation.md
 *   node agents/agent2_explainer.js --context ./outputs/arch_context.json --format html
 *
 * Environment variables:
 *   GITHUB_TOKEN   — GitHub personal access token (for GitHub Models / Copilot API)
 *   OPENAI_API_KEY — Fallback: standard OpenAI key
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

// ─── Config ───────────────────────────────────────────────────────────────────

const GITHUB_MODELS_ENDPOINT = "models.inference.ai.azure.com";
const OPENAI_ENDPOINT        = "api.openai.com";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    context: "./outputs/arch_context.json",
    out:     "./outputs/explanation.md",
    format:  "markdown",  // markdown | html | text
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--context") result.context = args[i + 1];
    if (args[i] === "--out")     result.out     = args[i + 1];
    if (args[i] === "--format")  result.format  = args[i + 1];
  }
  return result;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are a friendly technical translator. Your job is to read a JSON
architecture report about a software system and rewrite it as a clear,
jargon-free explanation that a non-developer (product manager, business
analyst, investor, or end user) can fully understand.

Rules you MUST follow:
1. NEVER use developer jargon without immediately explaining it.
2. Use analogies from everyday life (restaurant, post office, library, etc.)
3. Organise your output into these five sections:
   - What this system does (2-3 sentences, for an executive)
   - How it works — step by step (use numbered steps, plain language)
   - What each major part is responsible for (a short table or list)
   - External tools and services it relies on (explain WHY each one exists)
   - Health and quality observations (anything noteworthy about structure)
4. Keep sentences short. Max 25 words per sentence.
5. Write in active voice.
6. Use a warm, confident tone — not robotic.
7. If the format is "html", wrap the output in clean HTML with inline styles.
   If the format is "markdown", use proper Markdown headers and tables.
   If the format is "text", use plain text with no special characters.`;
}

function buildUserPrompt(context, format) {
  return `Here is the architecture report for the repository named "${context.repo_name}":

${JSON.stringify(context, null, 2)}

Please produce a ${format.toUpperCase()} explanation following the five-section structure.
Make it suitable for someone who has never written code.`;
}

// ─── API Caller ───────────────────────────────────────────────────────────────

function callAPI(messages, token, useGitHub) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:       useGitHub ? "gpt-4o" : "gpt-4o",
      messages,
      max_tokens:  2000,
      temperature: 0.4,
    });

    const options = {
      hostname: useGitHub ? GITHUB_MODELS_ENDPOINT : OPENAI_ENDPOINT,
      path:     useGitHub ? "/chat/completions" : "/v1/chat/completions",
      method:   "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed.choices?.[0]?.message?.content || "");
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Offline Fallback ─────────────────────────────────────────────────────────
// If no API key is set, generate a template-based explanation locally.

function generateOfflineExplanation(ctx, format) {
  const compsByType = {};
  for (const c of ctx.components || []) {
    if (!compsByType[c.type]) compsByType[c.type] = [];
    compsByType[c.type].push(c);
  }

  const ext = (ctx.external_services || []).map(s =>
    `• **${s.name}** (${s.type}) — used by: ${s.used_by.join(", ")}`
  ).join("\n");

  const compTable = Object.entries(compsByType).map(([type, list]) => {
    const names = list.slice(0, 4).map(c => c.name).join(", ");
    const more  = list.length > 4 ? ` + ${list.length - 4} more` : "";
    return `| ${type.charAt(0).toUpperCase() + type.slice(1)} | ${names}${more} |`;
  }).join("\n");

  const flows = (ctx.data_flows || []).map((f, i) =>
    `${i + 1}. A request starts at **${f.from}**, passes through ${f.through.join(" → ")}, and ends at **${f.to}**.`
  ).join("\n");

  const md = `# ${ctx.repo_name} — Plain-English Architecture Guide

_Generated by Agent 2 on ${new Date().toLocaleDateString()}_

---

## What this system does

**${ctx.repo_name}** is a software application built with ${(ctx.tech_stack || []).join(", ")}.
It follows a **${ctx.architecture_pattern}** design, meaning its code is organised into
clearly separated layers — each layer has one job, making it easier to maintain and grow.

---

## How it works — step by step

${flows || "1. A user sends a request.\n2. The system processes it and returns a result."}

Think of it like a restaurant:
- The **front-of-house** (controllers) take your order.
- The **kitchen** (services) prepare the food (process your request).
- The **pantry** (repositories) is where ingredients (data) are stored and retrieved.
- The **suppliers** (external services) deliver what the kitchen can't make itself.

---

## What each major part is responsible for

| Part type | Key components |
|-----------|---------------|
${compTable || "| Module | (no components detected) |"}

---

## External tools and services it relies on

${ext || "No external services detected."}

---

## Health and quality observations

- The project contains **${ctx.components?.length || 0} components** across **${Object.keys(compsByType).length} layers**.
- Entry points found: \`${(ctx.entry_points || []).join("`, `") || "none detected"}\`
- ${ctx.components?.length > 20
  ? "This is a moderately large codebase. Good separation of concerns is important here."
  : "This is a compact codebase — relatively easy to onboard new developers."}

---

_This report was auto-generated. Ask your development team to review for accuracy._
`;

  if (format === "html") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${ctx.repo_name} — Architecture Explained</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           max-width: 800px; margin: 40px auto; padding: 0 20px;
           color: #1a1a1a; line-height: 1.7; }
    h1 { color: #0066cc; border-bottom: 2px solid #0066cc; padding-bottom: 8px; }
    h2 { color: #333; margin-top: 40px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th { background: #0066cc; color: white; padding: 10px 14px; text-align: left; }
    td { border: 1px solid #ddd; padding: 9px 14px; }
    tr:nth-child(even) td { background: #f7f7f7; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .meta { color: #888; font-size: 0.85em; }
    .callout { background: #e8f4fd; border-left: 4px solid #0066cc;
                padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>${ctx.repo_name} — Architecture Explained</h1>
  <p class="meta">Generated ${new Date().toLocaleDateString()} | ${ctx.architecture_pattern}</p>
  <p>${ctx.summary || ""}</p>
  <h2>Tech Stack</h2>
  <p>${(ctx.tech_stack || []).join(" · ")}</p>
  <h2>How it works</h2>
  <div class="callout">Think of it like a restaurant: controllers take orders, services cook, repositories store ingredients, and external services are suppliers.</div>
  <h2>Components (${ctx.components?.length || 0} total)</h2>
  <table>
    <tr><th>Name</th><th>Type</th><th>Purpose</th></tr>
    ${(ctx.components || []).slice(0, 15).map(c =>
      `<tr><td><code>${c.name}</code></td><td>${c.type}</td><td>${c.purpose}</td></tr>`
    ).join("\n    ")}
  </table>
  <h2>External Services</h2>
  ${(ctx.external_services || []).map(s =>
    `<p><strong>${s.name}</strong> (${s.type}): used by ${s.used_by.join(", ")}</p>`
  ).join("") || "<p>None detected.</p>"}
</body>
</html>`;
  }

  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { context: ctxPath, out, format } = parseArgs();

  console.log(`\n📖  Reading context from: ${ctxPath}`);

  if (!fs.existsSync(ctxPath)) {
    console.error(`❌  Context file not found: ${ctxPath}`);
    console.error(`    Run Agent 1 first: node agents/agent1_analyzer.js --repo <path>`);
    process.exit(1);
  }

  const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
  console.log(`    Repository: ${ctx.repo_name} | Pattern: ${ctx.architecture_pattern}`);

  const githubToken = process.env.GITHUB_TOKEN;
  const openaiKey   = process.env.OPENAI_API_KEY;
  const token       = githubToken || openaiKey;
  const useGitHub   = !!githubToken;

  let explanation;

  if (token) {
    console.log(`\n🤖  Calling ${useGitHub ? "GitHub Models (Copilot)" : "OpenAI"} API...`);
    try {
      const messages = [
        { role: "system", content: buildSystemPrompt() },
        { role: "user",   content: buildUserPrompt(ctx, format) },
      ];
      explanation = await callAPI(messages, token, useGitHub);
      console.log(`    ✅ API response received (${explanation.length} chars)`);
    } catch (err) {
      console.warn(`\n⚠️   API call failed: ${err.message}`);
      console.warn(`    Falling back to offline template...\n`);
      explanation = generateOfflineExplanation(ctx, format);
    }
  } else {
    console.log(`\n⚠️   No API key found (GITHUB_TOKEN or OPENAI_API_KEY).`);
    console.log(`    Generating offline template-based explanation...\n`);
    explanation = generateOfflineExplanation(ctx, format);
  }

  // Write output
  const outDir = path.dirname(path.resolve(out));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.resolve(out), explanation, "utf-8");

  console.log(`\n✅  Explanation written to: ${path.resolve(out)}`);
  console.log(`    Format: ${format.toUpperCase()} | Size: ${explanation.length} chars\n`);
  console.log(`── Preview (first 400 chars) ────────────────────────`);
  console.log(explanation.slice(0, 400));
  console.log(`─────────────────────────────────────────────────────\n`);
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
