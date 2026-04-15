#!/usr/bin/env node
/**
 * Agent 1 — Repository Analyzer
 *
 * Supports TWO modes:
 *   1. GitHub URL  → fetches files via GitHub API (no cloning needed)
 *   2. Local path  → reads files directly from disk
 *
 * Usage:
 *   node agents/agent1_analyzer.js --repo https://github.com/owner/repo
 *   node agents/agent1_analyzer.js --repo https://github.com/owner/repo --token ghp_xxx
 *   node agents/agent1_analyzer.js --repo ./local/path
 *
 * Environment variables:
 *   GITHUB_TOKEN — optional, but avoids rate limits (60 req/hr without, 5000 with)
 */

const fs    = require("fs");
const path  = require("path");
const https = require("https");

// ─── Config ───────────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".github", "dist", "build",
  "__pycache__", ".next", "coverage", ".venv", "venv", "vendor"
]);

const ENTRY_POINT_NAMES = new Set([
  "index.js", "index.ts", "main.js", "main.ts", "main.py",
  "app.js", "app.ts", "app.py", "server.js", "server.ts",
  "manage.py", "Program.cs", "Main.java"
]);

const FRAMEWORK_SIGNATURES = {
  express:    ["express"],
  fastapi:    ["fastapi"],
  django:     ["django"],
  nextjs:     ["next"],
  nestjs:     ["@nestjs/core"],
  springboot: ["spring-boot"],
  flask:      ["flask"],
  react:      ["react"],
  vue:        ["vue"],
  angular:    ["@angular/core"],
};

const EXTERNAL_SERVICE_PATTERNS = [
  { pattern: /mongoose|mongodb/i,        service: "MongoDB",       type: "database"      },
  { pattern: /pg|postgres|postgresql/i,  service: "PostgreSQL",    type: "database"      },
  { pattern: /mysql|mysql2/i,            service: "MySQL",         type: "database"      },
  { pattern: /sqlite/i,                  service: "SQLite",        type: "database"      },
  { pattern: /redis/i,                   service: "Redis",         type: "cache"         },
  { pattern: /amqplib|rabbitmq/i,        service: "RabbitMQ",      type: "message_queue" },
  { pattern: /kafka/i,                   service: "Kafka",         type: "message_queue" },
  { pattern: /axios|fetch|got|request/i, service: "HTTP Client",   type: "external_api"  },
  { pattern: /stripe/i,                  service: "Stripe",        type: "payment"       },
  { pattern: /aws-sdk|@aws-sdk/i,        service: "AWS SDK",       type: "cloud"         },
  { pattern: /firebase/i,                service: "Firebase",      type: "cloud"         },
  { pattern: /sendgrid|nodemailer/i,     service: "Email Service", type: "email"         },
  { pattern: /jsonwebtoken|jwt/i,        service: "JWT Auth",      type: "auth"          },
  { pattern: /prisma/i,                  service: "Prisma ORM",    type: "database"      },
  { pattern: /typeorm/i,                 service: "TypeORM",       type: "database"      },
  { pattern: /sequelize/i,              service: "Sequelize ORM", type: "database"      },
];

const COMPONENT_TYPE_MAP = {
  controller:  ["controller", "handler", "route", "router"],
  service:     ["service", "usecase", "business", "manager"],
  repository:  ["repository", "repo", "dao", "store", "storage"],
  middleware:  ["middleware", "guard", "interceptor", "filter"],
  model:       ["model", "schema", "entity", "domain"],
  util:        ["util", "helper", "lib", "common", "shared"],
  config:      ["config", "setting", "env", "constant"],
  test:        ["test", "spec", ".test.", ".spec."],
};

const SRC_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java",
  ".cs", ".go", ".rb", ".php", ".rs", ".kt", ".swift"
]);

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    repo:   ".",
    out:    "./outputs/arch_context.json",
    token:  process.env.GITHUB_TOKEN || "",
    branch: "",
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo")   result.repo   = args[i + 1];
    if (args[i] === "--out")    result.out    = args[i + 1];
    if (args[i] === "--token")  result.token  = args[i + 1];
    if (args[i] === "--branch") result.branch = args[i + 1];
  }
  return result;
}

function parseGitHubUrl(url) {
  const clean = url.replace(/\.git$/, "").replace(/\/$/, "");
  const match = clean.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/(.+))?/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], branch: match[3] || "" };
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

function githubRequest(apiPath, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path:     apiPath,
      method:   "GET",
      headers:  {
        "User-Agent": "copilot-multi-agent/1.0",
        "Accept":     "application/vnd.github.v3+json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode === 403) {
          reject(new Error(
            "GitHub API rate limit reached.\n" +
            "Fix: set GITHUB_TOKEN=ghp_your_token  (Windows PowerShell)\n" +
            "  or export GITHUB_TOKEN=ghp_your_token  (Mac/Linux)"
          ));
          return;
        }
        if (res.statusCode === 404) {
          reject(new Error("Repository not found or is private. Check the URL or add --token ghp_xxx"));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Could not parse GitHub API response")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getDefaultBranch(owner, repo, token) {
  const info = await githubRequest(`/repos/${owner}/${repo}`, token);
  return info.default_branch || "main";
}

async function getTree(owner, repo, branch, token) {
  const data = await githubRequest(
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    token
  );
  if (data.truncated) console.warn("  ⚠️  Large repo — tree truncated, analyzing first portion.");
  return data.tree || [];
}

async function getFileContent(owner, repo, filePath, token) {
  try {
    const data = await githubRequest(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, token);
    if (data.encoding === "base64" && data.content) {
      return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    }
    return "";
  } catch { return ""; }
}

// ─── Local Helpers ────────────────────────────────────────────────────────────

function walkDir(dir, fileList = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return fileList; }
  for (const e of entries) {
    if (IGNORED_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, fileList);
    else if (e.isFile()) fileList.push(full);
  }
  return fileList;
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}

// ─── Shared Analysis ──────────────────────────────────────────────────────────

function detectLanguage(ext) {
  return {
    ".js": "JavaScript", ".ts": "TypeScript", ".jsx": "JavaScript (React)",
    ".tsx": "TypeScript (React)", ".py": "Python", ".java": "Java",
    ".cs": "C#", ".go": "Go", ".rb": "Ruby", ".php": "PHP",
    ".rs": "Rust", ".kt": "Kotlin", ".swift": "Swift",
  }[ext] || null;
}

function guessComponentType(fileName) {
  const lower = fileName.toLowerCase();
  for (const [type, keywords] of Object.entries(COMPONENT_TYPE_MAP)) {
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return "module";
}

function extractImports(content, ext) {
  const imports = [];
  if ([".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    const re = /(?:import\s+.*?\s+from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\))/g;
    let m;
    while ((m = re.exec(content)) !== null) imports.push(m[1] || m[2]);
  }
  if (ext === ".py") {
    const re = /(?:^from\s+([\w.]+)\s+import|^import\s+([\w.,\s]+))/gm;
    let m;
    while ((m = re.exec(content)) !== null) imports.push((m[1] || m[2]).trim());
  }
  return imports;
}

function detectTechStack(filePaths, pkgJson, reqsTxt) {
  const stack = new Set();
  const languages = new Set();
  for (const f of filePaths) {
    const lang = detectLanguage(path.extname(f));
    if (lang) languages.add(lang);
  }
  if (pkgJson) {
    try {
      const pkg  = JSON.parse(pkgJson);
      stack.add("Node.js");
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const dep of Object.keys(deps || {})) {
        for (const [fw, sigs] of Object.entries(FRAMEWORK_SIGNATURES)) {
          if (sigs.some(s => dep.includes(s)))
            stack.add(fw.charAt(0).toUpperCase() + fw.slice(1));
        }
      }
    } catch {}
  }
  if (reqsTxt) {
    if (reqsTxt.includes("fastapi")) stack.add("FastAPI");
    if (reqsTxt.includes("django"))  stack.add("Django");
    if (reqsTxt.includes("flask"))   stack.add("Flask");
    if (reqsTxt.includes("torch"))   stack.add("PyTorch");
    if (reqsTxt.includes("pandas"))  stack.add("Pandas");
    stack.add("Python");
  }
  return [...languages, ...stack];
}

function detectArchPattern(filePaths) {
  const lower = filePaths.map(f => f.toLowerCase());
  const has = kw => lower.some(p => p.includes(kw));
  const svcCount = lower.filter(p => p.includes("service") && p.split("/").length > 3).length;

  if (svcCount > 4)                              return "Microservices";
  if (has("controller") && has("model") && (has("view") || has("template")))
                                                 return "MVC (Model-View-Controller)";
  if (has("controller") && has("service") && (has("repository") || has("repo")))
                                                 return "Layered Architecture (Controller → Service → Repository)";
  if (has("controller") && has("service"))       return "Service-Oriented Architecture";
  if (has("route") && has("model"))              return "REST API (Route-based)";
  return "Modular / Component-Based";
}

function buildComponents(sourceFiles) {
  return sourceFiles
    .filter(f => f.content.trim().length > 20)
    .map(({ name, relPath, content, ext }) => {
      const type = guessComponentType(name);
      const localCalls = extractImports(content, ext)
        .filter(i => i.startsWith(".") || i.startsWith("/"))
        .map(i => path.basename(i).replace(/\.[^.]+$/, ""))
        .filter(Boolean);

      const purposeMap = {
        controller: `Handles HTTP routes for ${name.replace(/controller/i, "").trim() || "resources"}`,
        service:    `Business logic for ${name.replace(/service/i, "").trim() || "domain"}`,
        repository: `Data access for ${name.replace(/repo(sitory)?/i, "").trim() || "entities"}`,
        middleware: `Middleware / request filter: ${name}`,
        model:      `Data model / schema: ${name}`,
        config:     `Configuration: ${name}`,
      };

      return { name, file: relPath, type, purpose: purposeMap[type] || `Module: ${name}`, calls: localCalls };
    });
}

function detectExternalServices(sourceFiles) {
  const found = new Map();
  for (const { name, content } of sourceFiles) {
    for (const { pattern, service, type } of EXTERNAL_SERVICE_PATTERNS) {
      if (pattern.test(content)) {
        if (!found.has(service)) found.set(service, { name: service, type, used_by: [] });
        if (!found.get(service).used_by.includes(name)) found.get(service).used_by.push(name);
      }
    }
  }
  return [...found.values()];
}

function buildDataFlows(components, externalServices) {
  const flows = [];
  const has   = t => components.some(c => c.type === t);
  const dbs   = externalServices.filter(s => s.type === "database");

  if (has("controller") && has("service") && has("repository")) {
    flows.push({ name: "Standard request flow", from: "HTTP Request (Client)",
      through: ["Router", "Middleware", "Controller", "Service", "Repository"],
      to: dbs[0]?.name || "Database" });
  } else if (has("controller") && has("service")) {
    flows.push({ name: "Request flow", from: "HTTP Request",
      through: ["Controller", "Service"], to: dbs[0]?.name || "Data Store" });
  }

  const queues = externalServices.filter(s => s.type === "message_queue");
  if (queues.length) {
    flows.push({ name: "Async event flow", from: "Service",
      through: [queues[0].name, "Worker"], to: "Background Processing" });
  }

  if (!flows.length) {
    flows.push({ name: "General data flow", from: "Input",
      through: ["Processing Layer"], to: "Output" });
  }
  return flows;
}

function makeSummary(repoName, stack, pattern, components, entryPoints, externalServices) {
  const dbs = externalServices.filter(s => s.type === "database").map(s => s.name).join(", ") || "none detected";
  return `${repoName} is a ${pattern} application built with ${stack.slice(0, 4).join(", ") || "unknown stack"}. ` +
    `It contains ${components.length} component(s) with ${entryPoints.length} entry point(s). ` +
    `External dependencies: ${dbs}.`;
}

// ─── GitHub Mode ──────────────────────────────────────────────────────────────

async function analyzeGitHub(owner, repo, branchArg, token) {
  console.log(`\n🔍  Analyzing GitHub repo: https://github.com/${owner}/${repo}\n`);

  process.stdout.write("  [1/6] Resolving default branch...");
  const branch = branchArg || await getDefaultBranch(owner, repo, token);
  console.log(` ${branch}`);

  process.stdout.write("  [2/6] Fetching file tree...");
  const tree     = await getTree(owner, repo, branch, token);
  const allPaths = tree.filter(n => n.type === "blob").map(n => n.path);
  console.log(` ${allPaths.length} files`);

  process.stdout.write("  [3/6] Detecting tech stack...");
  const pkgJson = await getFileContent(owner, repo, "package.json", token);
  const reqsTxt = await getFileContent(owner, repo, "requirements.txt", token);
  const stack   = detectTechStack(allPaths, pkgJson, reqsTxt);
  console.log(` ${stack.join(", ") || "unknown"}`);

  process.stdout.write("  [4/6] Detecting architecture pattern...");
  const pattern = detectArchPattern(allPaths);
  console.log(` ${pattern}`);

  process.stdout.write("  [5/6] Fetching source files (up to 60)...");
  const srcPaths = allPaths
    .filter(p => SRC_EXTENSIONS.has(path.extname(p)) && !IGNORED_DIRS.has(p.split("/")[0]))
    .slice(0, 60);

  const sourceFiles = [];
  for (const relPath of srcPaths) {
    const ext     = path.extname(relPath);
    const name    = path.basename(relPath, ext);
    const content = await getFileContent(owner, repo, relPath, token);
    sourceFiles.push({ name, relPath, content, ext });
  }
  console.log(` ${sourceFiles.length} fetched`);

  process.stdout.write("  [6/6] Building component map and data flows...");
  const components       = buildComponents(sourceFiles);
  const externalServices = detectExternalServices(sourceFiles);
  const entryPoints      = allPaths.filter(p => ENTRY_POINT_NAMES.has(path.basename(p)));
  const dataFlows        = buildDataFlows(components, externalServices);
  const summary          = makeSummary(repo, stack, pattern, components, entryPoints, externalServices);
  console.log(` done\n`);

  return {
    repo_name: repo, repo_url: `https://github.com/${owner}/${repo}`, branch,
    analyzed_at: new Date().toISOString(),
    tech_stack: stack, architecture_pattern: pattern,
    entry_points: entryPoints, components, data_flows: dataFlows,
    external_services: externalServices, summary,
  };
}

// ─── Local Mode ───────────────────────────────────────────────────────────────

async function analyzeLocal(repoRoot) {
  const repoName = path.basename(repoRoot);
  console.log(`\n🔍  Analyzing local repo: ${repoRoot}\n`);

  process.stdout.write("  [1/6] Scanning files...");
  const allFiles = walkDir(repoRoot);
  const allPaths = allFiles.map(f => f.replace(repoRoot + path.sep, "").replace(/\\/g, "/"));
  console.log(` ${allFiles.length} files`);

  process.stdout.write("  [2/6] Detecting tech stack...");
  const pkgPath = path.join(repoRoot, "package.json");
  const reqPath = path.join(repoRoot, "requirements.txt");
  const stack   = detectTechStack(
    allPaths,
    fs.existsSync(pkgPath) ? readFileSafe(pkgPath) : "",
    fs.existsSync(reqPath) ? readFileSafe(reqPath) : ""
  );
  console.log(` ${stack.join(", ") || "unknown"}`);

  process.stdout.write("  [3/6] Detecting architecture pattern...");
  const pattern = detectArchPattern(allPaths);
  console.log(` ${pattern}`);

  process.stdout.write("  [4/6] Extracting components...");
  const sourceFiles = allFiles
    .filter(f => SRC_EXTENSIONS.has(path.extname(f)))
    .map(f => ({
      name:    path.basename(f, path.extname(f)),
      relPath: f.replace(repoRoot + path.sep, "").replace(/\\/g, "/"),
      content: readFileSafe(f),
      ext:     path.extname(f),
    }));
  const components = buildComponents(sourceFiles);
  console.log(` ${components.length} found`);

  process.stdout.write("  [5/6] Detecting external services...");
  const externalServices = detectExternalServices(sourceFiles);
  console.log(` ${externalServices.length} found`);

  process.stdout.write("  [6/6] Building data flows...");
  const entryPoints = allPaths.filter(p => ENTRY_POINT_NAMES.has(path.basename(p)));
  const dataFlows   = buildDataFlows(components, externalServices);
  const summary     = makeSummary(repoName, stack, pattern, components, entryPoints, externalServices);
  console.log(` done\n`);

  return {
    repo_name: repoName, analyzed_at: new Date().toISOString(),
    tech_stack: stack, architecture_pattern: pattern,
    entry_points: entryPoints, components, data_flows: dataFlows,
    external_services: externalServices, summary,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { repo, out, token, branch } = parseArgs();
  let output;

  if (repo.includes("github.com")) {
    const parsed = parseGitHubUrl(repo);
    if (!parsed) {
      console.error("❌  Could not parse GitHub URL. Expected: https://github.com/owner/repo");
      process.exit(1);
    }
    if (!token) {
      console.log("ℹ️   No GITHUB_TOKEN found — using unauthenticated API (60 requests/hour).");
      console.log("    To avoid limits:  set GITHUB_TOKEN=ghp_your_token\n");
    }
    output = await analyzeGitHub(parsed.owner, parsed.repo, branch || parsed.branch, token);
  } else {
    const repoRoot = path.resolve(repo);
    if (!fs.existsSync(repoRoot)) {
      console.error(`❌  Path not found: ${repoRoot}`);
      console.error(`    For GitHub repos use: --repo https://github.com/owner/repo`);
      process.exit(1);
    }
    output = await analyzeLocal(repoRoot);
  }

  const outResolved = path.resolve(out);
  fs.mkdirSync(path.dirname(outResolved), { recursive: true });
  fs.writeFileSync(outResolved, JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅  Analysis complete!`);
  console.log(`📄  Output: ${outResolved}\n`);
  console.log(`── Summary ──────────────────────────────────────────`);
  console.log(output.summary);
  console.log(`─────────────────────────────────────────────────────\n`);
}

main().catch(err => {
  console.error(`\n❌  ${err.message}\n`);
  process.exit(1);
});