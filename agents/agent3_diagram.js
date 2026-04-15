#!/usr/bin/env node
/**
 * Agent 3 — Architecture Diagram Generator
 *
 * Reads arch_context.json from Agent 1 and generates a beautiful
 * interactive HTML architecture diagram — no external tools needed.
 *
 * Usage:
 *   node agents/agent3_diagram.js
 *   node agents/agent3_diagram.js --context ./outputs/arch_context.json
 *   node agents/agent3_diagram.js --context ./outputs/arch_context.json --out ./outputs/diagram.html
 */

const fs   = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { context: "./outputs/arch_context.json", out: "./outputs/diagram.html" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--context") result.context = args[i + 1];
    if (args[i] === "--out")     result.out     = args[i + 1];
  }
  return result;
}

// ─── Color / Icon mapping ─────────────────────────────────────────────────────

const TYPE_META = {
  controller:  { color: "#6366f1", bg: "#1e1b4b", icon: "⬡", label: "Controller"  },
  service:     { color: "#10b981", bg: "#064e3b", icon: "⚙",  label: "Service"     },
  repository:  { color: "#f59e0b", bg: "#451a03", icon: "🗄",  label: "Repository"  },
  middleware:  { color: "#8b5cf6", bg: "#2e1065", icon: "🔀",  label: "Middleware"  },
  model:       { color: "#06b6d4", bg: "#083344", icon: "◈",  label: "Model"       },
  config:      { color: "#94a3b8", bg: "#1e293b", icon: "⚒",  label: "Config"      },
  util:        { color: "#64748b", bg: "#1e293b", icon: "🔧",  label: "Utility"     },
  test:        { color: "#f43f5e", bg: "#4c0519", icon: "✓",  label: "Test"        },
  module:      { color: "#38bdf8", bg: "#0c4a6e", icon: "◻",  label: "Module"      },
};

const SERVICE_META = {
  database:      { color: "#f59e0b", icon: "🗃" },
  cache:         { color: "#10b981", icon: "⚡" },
  message_queue: { color: "#8b5cf6", icon: "📨" },
  external_api:  { color: "#38bdf8", icon: "🌐" },
  auth:          { color: "#f43f5e", icon: "🔐" },
  payment:       { color: "#fbbf24", icon: "💳" },
  cloud:         { color: "#60a5fa", icon: "☁"  },
  email:         { color: "#34d399", icon: "✉"  },
};

// ─── HTML Generator ───────────────────────────────────────────────────────────

function generateHTML(ctx) {
  const components      = ctx.components      || [];
  const externalServices = ctx.external_services || [];
  const dataFlows       = ctx.data_flows      || [];
  const techStack       = ctx.tech_stack      || [];
  const entryPoints     = ctx.entry_points    || [];

  // Group components by type
  const byType = {};
  for (const c of components) {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push(c);
  }

  // Build component cards HTML
  function compCard(c) {
    const meta  = TYPE_META[c.type] || TYPE_META.module;
    const calls = c.calls?.length
      ? `<div class="calls">→ ${c.calls.slice(0, 3).join(", ")}${c.calls.length > 3 ? " …" : ""}</div>`
      : "";
    return `
      <div class="comp-card" style="--accent:${meta.color};--bg:${meta.bg}" data-type="${c.type}" title="${c.file}">
        <span class="comp-icon">${meta.icon}</span>
        <div class="comp-body">
          <div class="comp-name">${c.name}</div>
          <div class="comp-purpose">${c.purpose}</div>
          ${calls}
        </div>
        <span class="comp-badge">${meta.label}</span>
      </div>`;
  }

  // Build layer sections
  const layerOrder = ["controller","service","repository","middleware","model","config","util","module","test"];
  let layerSections = "";
  for (const type of layerOrder) {
    const group = byType[type];
    if (!group?.length) continue;
    const meta = TYPE_META[type] || TYPE_META.module;
    layerSections += `
      <div class="layer" style="--layer-color:${meta.color}">
        <div class="layer-header">
          <span class="layer-icon">${meta.icon}</span>
          <span class="layer-title">${meta.label} Layer</span>
          <span class="layer-count">${group.length}</span>
        </div>
        <div class="comp-grid">${group.map(compCard).join("")}</div>
      </div>`;
  }

  // Build data flow steps
  const flowHTML = dataFlows.map((f, i) => {
    const steps = [f.from, ...(f.through || []), f.to];
    return `
      <div class="flow-row">
        <div class="flow-label">${f.name || `Flow ${i+1}`}</div>
        <div class="flow-steps">
          ${steps.map((s, si) => `
            <div class="flow-step">${s}</div>
            ${si < steps.length - 1 ? '<div class="flow-arrow">→</div>' : ""}
          `).join("")}
        </div>
      </div>`;
  }).join("");

  // Build external services
  const svcHTML = externalServices.map(s => {
    const meta = SERVICE_META[s.type] || { color: "#94a3b8", icon: "⬡" };
    return `
      <div class="svc-card" style="--svc-color:${meta.color}">
        <span class="svc-icon">${meta.icon}</span>
        <div class="svc-body">
          <div class="svc-name">${s.name}</div>
          <div class="svc-type">${s.type.replace(/_/g, " ")}</div>
          <div class="svc-used">Used by: ${s.used_by.slice(0, 3).join(", ")}${s.used_by.length > 3 ? " +" + (s.used_by.length - 3) : ""}</div>
        </div>
      </div>`;
  }).join("");

  // Build tech stack pills
  const stackHTML = techStack.map(t =>
    `<span class="stack-pill">${t}</span>`
  ).join("");

  // Build entry points
  const entryHTML = entryPoints.length
    ? entryPoints.map(e => `<code class="entry-point">▶ ${e}</code>`).join("")
    : `<code class="entry-point">none detected</code>`;

  // Stats
  const stats = [
    { label: "Components",    value: components.length },
    { label: "Entry Points",  value: entryPoints.length },
    { label: "Ext. Services", value: externalServices.length },
    { label: "Data Flows",    value: dataFlows.length },
  ];

  const statsHTML = stats.map(s => `
    <div class="stat-box">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>`).join("");

  const analyzedDate = ctx.analyzed_at
    ? new Date(ctx.analyzed_at).toLocaleString()
    : new Date().toLocaleString();

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ctx.repo_name} — Architecture Diagram</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Sora:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #080c14;
    --surface:   #0d1424;
    --surface2:  #121929;
    --border:    rgba(255,255,255,0.07);
    --text:      #e2e8f0;
    --muted:     #64748b;
    --accent:    #38bdf8;
    --font-mono: 'JetBrains Mono', monospace;
    --font-sans: 'Sora', sans-serif;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-sans);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Grid noise texture */
  body::before {
    content: '';
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(56,189,248,.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56,189,248,.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  /* Glow orbs */
  .orb {
    position: fixed; border-radius: 50%;
    filter: blur(120px); opacity: 0.12; pointer-events: none; z-index: 0;
  }
  .orb-1 { width: 600px; height: 600px; top: -200px; left: -200px; background: #6366f1; }
  .orb-2 { width: 500px; height: 500px; bottom: -100px; right: -100px; background: #10b981; }
  .orb-3 { width: 400px; height: 400px; top: 40%; left: 50%; background: #38bdf8; opacity: 0.07; }

  .page { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 40px 24px 80px; }

  /* ── Header ── */
  .header {
    display: flex; flex-direction: column; gap: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 32px; margin-bottom: 40px;
  }
  .header-top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
  .repo-label {
    font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    color: var(--accent); letter-spacing: 0.15em; text-transform: uppercase;
    margin-bottom: 6px;
  }
  .repo-name {
    font-size: clamp(28px, 5vw, 44px); font-weight: 700; line-height: 1.1;
    background: linear-gradient(135deg, #e2e8f0 0%, #38bdf8 60%, #6366f1 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .pattern-tag {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);
    color: #a5b4fc; font-family: var(--font-mono); font-size: 11px;
    padding: 5px 12px; border-radius: 20px; margin-top: 10px;
  }
  .meta-row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; margin-top: 8px; }
  .meta-item { font-size: 12px; color: var(--muted); font-family: var(--font-mono); }
  .meta-item a { color: var(--accent); text-decoration: none; }
  .meta-item a:hover { text-decoration: underline; }

  /* ── Stats ── */
  .stats-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 40px; }
  .stat-box {
    flex: 1; min-width: 120px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 20px 24px;
    display: flex; flex-direction: column; gap: 4px;
    transition: border-color 0.2s;
  }
  .stat-box:hover { border-color: rgba(56,189,248,0.3); }
  .stat-value { font-size: 32px; font-weight: 700; font-family: var(--font-mono); color: var(--accent); }
  .stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }

  /* ── Sections ── */
  .section { margin-bottom: 48px; }
  .section-title {
    font-size: 11px; font-weight: 600; letter-spacing: 0.15em;
    text-transform: uppercase; color: var(--muted);
    font-family: var(--font-mono);
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 20px;
  }
  .section-title::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }

  /* ── Tech Stack ── */
  .stack-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .stack-pill {
    background: var(--surface2); border: 1px solid var(--border);
    color: var(--text); font-family: var(--font-mono);
    font-size: 12px; padding: 5px 14px; border-radius: 20px;
    transition: all 0.2s;
  }
  .stack-pill:hover { border-color: var(--accent); color: var(--accent); }

  /* ── Entry Points ── */
  .entry-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .entry-point {
    background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25);
    color: #34d399; font-family: var(--font-mono);
    font-size: 12px; padding: 5px 14px; border-radius: 6px;
  }

  /* ── Layers ── */
  .layers { display: flex; flex-direction: column; gap: 20px; }
  .layer {
    background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--layer-color);
    border-radius: 12px; overflow: hidden;
    transition: box-shadow 0.2s;
  }
  .layer:hover { box-shadow: 0 0 0 1px var(--layer-color), 0 8px 32px rgba(0,0,0,0.4); }
  .layer-header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 20px; background: rgba(255,255,255,0.02);
    border-bottom: 1px solid var(--border);
  }
  .layer-icon { font-size: 16px; }
  .layer-title { font-size: 13px; font-weight: 600; color: var(--layer-color); flex: 1; }
  .layer-count {
    font-family: var(--font-mono); font-size: 11px;
    background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 10px;
    color: var(--muted);
  }
  .comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1px; }
  .comp-card {
    background: var(--bg);
    padding: 14px 16px; display: flex; align-items: flex-start; gap: 12px;
    position: relative; cursor: default;
    transition: background 0.15s;
  }
  .comp-card:hover { background: var(--surface2); }
  .comp-card::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
    background: var(--accent); opacity: 0;
    transition: opacity 0.15s;
  }
  .comp-card:hover::before { opacity: 1; }
  .comp-icon {
    font-size: 18px; margin-top: 2px; flex-shrink: 0;
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    color: var(--accent);
  }
  .comp-body { flex: 1; min-width: 0; }
  .comp-name {
    font-family: var(--font-mono); font-size: 13px; font-weight: 600;
    color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .comp-purpose {
    font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.4;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .calls {
    font-size: 10px; color: var(--accent); font-family: var(--font-mono);
    margin-top: 5px; opacity: 0.7;
  }
  .comp-badge {
    font-family: var(--font-mono); font-size: 9px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); opacity: 0.5;
    flex-shrink: 0; padding-top: 3px;
  }

  /* ── Data Flows ── */
  .flows { display: flex; flex-direction: column; gap: 12px; }
  .flow-row {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 20px;
    transition: border-color 0.2s;
  }
  .flow-row:hover { border-color: rgba(56,189,248,0.3); }
  .flow-label {
    font-size: 11px; font-weight: 600; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.1em;
    font-family: var(--font-mono); margin-bottom: 12px;
  }
  .flow-steps {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  }
  .flow-step {
    background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.2);
    color: #7dd3fc; font-family: var(--font-mono); font-size: 12px;
    padding: 5px 12px; border-radius: 6px;
    transition: all 0.2s;
  }
  .flow-step:first-child {
    background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #34d399;
  }
  .flow-step:last-child {
    background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #fbbf24;
  }
  .flow-arrow { color: var(--muted); font-size: 14px; }

  /* ── External Services ── */
  .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .svc-card {
    background: var(--surface); border: 1px solid var(--border);
    border-top: 2px solid var(--svc-color);
    border-radius: 10px; padding: 16px; display: flex; gap: 12px; align-items: flex-start;
    transition: box-shadow 0.2s;
  }
  .svc-card:hover { box-shadow: 0 0 20px rgba(0,0,0,0.4); }
  .svc-icon { font-size: 22px; flex-shrink: 0; }
  .svc-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .svc-type {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
    font-family: var(--font-mono); color: var(--svc-color); margin-top: 2px;
  }
  .svc-used { font-size: 11px; color: var(--muted); margin-top: 6px; line-height: 1.4; }

  /* ── Summary Box ── */
  .summary-box {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 24px 28px;
    border-left: 3px solid var(--accent);
    font-size: 14px; line-height: 1.8; color: #94a3b8;
  }

  /* ── Footer ── */
  .footer {
    margin-top: 60px; padding-top: 24px; border-top: 1px solid var(--border);
    font-size: 11px; color: var(--muted); font-family: var(--font-mono);
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  }

  /* ── Animations ── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .page > * { animation: fadeUp 0.4s ease both; }
  .page > *:nth-child(2) { animation-delay: 0.05s; }
  .page > *:nth-child(3) { animation-delay: 0.10s; }
  .page > *:nth-child(4) { animation-delay: 0.15s; }
  .page > *:nth-child(5) { animation-delay: 0.20s; }
  .page > *:nth-child(6) { animation-delay: 0.25s; }
  .page > *:nth-child(7) { animation-delay: 0.30s; }

  /* ── Print ── */
  @media print {
    body { background: white; color: black; }
    .orb, body::before { display: none; }
    .layer, .stat-box, .svc-card, .flow-row, .summary-box { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="orb orb-1"></div>
<div class="orb orb-2"></div>
<div class="orb orb-3"></div>

<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div>
        <div class="repo-label">Architecture Diagram</div>
        <div class="repo-name">${ctx.repo_name}</div>
        <div class="pattern-tag">◈ ${ctx.architecture_pattern}</div>
      </div>
    </div>
    <div class="meta-row">
      ${ctx.repo_url ? `<div class="meta-item">🔗 <a href="${ctx.repo_url}" target="_blank">${ctx.repo_url}</a></div>` : ""}
      ${ctx.branch   ? `<div class="meta-item">⎇ ${ctx.branch}</div>` : ""}
      <div class="meta-item">🕐 Analyzed ${analyzedDate}</div>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-row">${statsHTML}</div>

  <!-- Tech Stack -->
  <div class="section">
    <div class="section-title">Tech Stack</div>
    <div class="stack-row">${stackHTML || '<span class="stack-pill">unknown</span>'}</div>
  </div>

  <!-- Entry Points -->
  <div class="section">
    <div class="section-title">Entry Points</div>
    <div class="entry-row">${entryHTML}</div>
  </div>

  <!-- Architecture Layers -->
  <div class="section">
    <div class="section-title">Architecture Layers · ${components.length} components</div>
    <div class="layers">
      ${layerSections || '<p style="color:var(--muted);font-size:13px">No components detected.</p>'}
    </div>
  </div>

  <!-- Data Flows -->
  <div class="section">
    <div class="section-title">Data Flows</div>
    <div class="flows">
      ${flowHTML || '<p style="color:var(--muted);font-size:13px">No flows detected.</p>'}
    </div>
  </div>

  <!-- External Services -->
  ${externalServices.length ? `
  <div class="section">
    <div class="section-title">External Services · ${externalServices.length} detected</div>
    <div class="services-grid">${svcHTML}</div>
  </div>` : ""}

  <!-- Summary -->
  <div class="section">
    <div class="section-title">Summary</div>
    <div class="summary-box">${ctx.summary || "No summary available."}</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>Generated by Agent 3 — Architecture Diagram Generator</span>
    <span>${new Date().toISOString()}</span>
  </div>

</div>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { context, out } = parseArgs();

  console.log(`\n🎨  Architecture Diagram Generator\n`);

  if (!fs.existsSync(context)) {
    console.error(`❌  Context file not found: ${context}`);
    console.error(`    Run Agent 1 first: node agents/agent1_analyzer.js --repo <url-or-path>`);
    process.exit(1);
  }

  process.stdout.write("  Reading arch_context.json...");
  const ctx = JSON.parse(fs.readFileSync(context, "utf-8"));
  console.log(` ${ctx.repo_name} (${ctx.architecture_pattern})`);

  process.stdout.write("  Generating HTML diagram...");
  const html = generateHTML(ctx);
  console.log(" done");

  const outResolved = path.resolve(out);
  fs.mkdirSync(path.dirname(outResolved), { recursive: true });
  fs.writeFileSync(outResolved, html, "utf-8");

  console.log(`\n✅  Diagram saved to: ${outResolved}`);
  console.log(`    Open in any browser: start ${outResolved}\n`);
}

main();
