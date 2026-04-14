#!/usr/bin/env node
/**
 * Agent 1 — Repository Analyzer
 * 
 * Scans a code repository and produces a structured arch_context.json
 * that captures: entry points, components, dependencies, data flows,
 * external services, and tech stack.
 * 
 * Usage:
 *   node agents/agent1_analyzer.js --repo ./path/to/repo
 *   node agents/agent1_analyzer.js --repo ./path/to/repo --out ./outputs/arch_context.json
 */

const fs   = require("fs");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".github", "dist", "build",
  "__pycache__", ".next", "coverage", ".venv", "venv"
]);

const ENTRY_POINT_NAMES = new Set([
  "index.js", "index.ts", "main.js", "main.ts", "main.py",
  "app.js", "app.ts", "app.py", "server.js", "server.ts",
  "manage.py", "Program.cs", "Main.java"
]);

const FRAMEWORK_SIGNATURES = {
  express:    { files: ["express"],           pattern: "REST API (Express)"      },
  fastapi:    { files: ["fastapi"],           pattern: "REST API (FastAPI)"      },
  django:     { files: ["django"],            pattern: "MVC (Django)"            },
  nextjs:     { files: ["next"],              pattern: "SSR / Full-Stack (Next)" },
  nestjs:     { files: ["@nestjs"],           pattern: "MVC (NestJS)"            },
  springboot: { files: ["spring-boot"],       pattern: "MVC (Spring Boot)"       },
  flask:      { files: ["flask"],             pattern: "REST API (Flask)"        },
  react:      { files: ["react"],             pattern: "SPA (React)"             },
};

const EXTERNAL_SERVICE_PATTERNS = [
  { pattern: /mongoose|mongodb/i,        service: "MongoDB",       type: "database"      },
  { pattern: /pg|postgres|postgresql/i,  service: "PostgreSQL",    type: "database"      },
  { pattern: /mysql|mysql2/i,            service: "MySQL",         type: "database"      },
  { pattern: /redis/i,                   service: "Redis",         type: "cache"         },
  { pattern: /amqplib|rabbitmq/i,        service: "RabbitMQ",      type: "message_queue" },
  { pattern: /kafka/i,                   service: "Kafka",         type: "message_queue" },
  { pattern: /axios|fetch|got|request/i, service: "HTTP Client",   type: "external_api"  },
  { pattern: /stripe/i,                  service: "Stripe",        type: "payment"       },
  { pattern: /aws-sdk|@aws-sdk/i,        service: "AWS SDK",       type: "cloud"         },
  { pattern: /firebase/i,                service: "Firebase",      type: "cloud"         },
  { pattern: /sendgrid|nodemailer/i,     service: "Email Service", type: "email"         },
  { pattern: /jsonwebtoken|jwt/i,        service: "JWT Auth",      type: "auth"          },
];

const COMPONENT_TYPE_MAP = {
  controller:  ["controller", "handler", "route"],
  service:     ["service", "usecase", "business"],
  repository:  ["repository", "repo", "dao", "store"],
  middleware:  ["middleware", "guard", "interceptor"],
  model:       ["model", "schema", "entity"],
  util:        ["util", "helper", "lib"],
  config:      ["config", "setting", "env"],
  test:        ["test", "spec", "__test__"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { repo: ".", out: "./outputs/arch_context.json" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo") result.repo = args[i + 1];
    if (args[i] === "--out")  result.out  = args[i + 1];
  }
  return result;
}

function walkDir(dir, fileList = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return fileList; }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, fileList);
    } else if (entry.isFile()) {
      fileList.push(full);
    }
  }
  return fileList;
}

function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, "utf-8"); }
  catch { return ""; }
}

function detectLanguage(ext) {
  const map = {
    ".js": "JavaScript", ".ts": "TypeScript", ".jsx": "JavaScript (React)",
    ".tsx": "TypeScript (React)", ".py": "Python", ".java": "Java",
    ".cs": "C#", ".go": "Go", ".rb": "Ruby", ".php": "PHP",
    ".rs": "Rust", ".cpp": "C++", ".c": "C",
  };
  return map[ext] || null;
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

  // JS/TS: import X from '...' or require('...')
  if ([".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
    const importRe = /(?:import\s+.*?\s+from\s+['"](.+?)['"]|require\(['"](.+?)['"]\))/g;
    let m;
    while ((m = importRe.exec(content)) !== null) {
      imports.push(m[1] || m[2]);
    }
  }

  // Python: import X or from X import Y
  if (ext === ".py") {
    const pyRe = /(?:^from\s+([\w.]+)\s+import|^import\s+([\w.,\s]+))/gm;
    let m;
    while ((m = pyRe.exec(content)) !== null) {
      imports.push((m[1] || m[2]).trim());
    }
  }

  return imports;
}

// ─── Analysis Steps ───────────────────────────────────────────────────────────

function detectTechStack(allFiles, repoRoot) {
  const stack = new Set();
  const languages = new Set();

  // Detect languages from extensions
  for (const f of allFiles) {
    const lang = detectLanguage(path.extname(f));
    if (lang) languages.add(lang);
  }

  // Read package.json / requirements.txt / pom.xml
  const pkgPath = path.join(repoRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      for (const dep of Object.keys(deps || {})) {
        for (const [fw, sig] of Object.entries(FRAMEWORK_SIGNATURES)) {
          if (sig.files.some(f => dep.includes(f))) {
            stack.add(fw.charAt(0).toUpperCase() + fw.slice(1));
          }
        }
      }
      if (pkg.name) stack.add("Node.js");
    } catch {}
  }

  const reqPath = path.join(repoRoot, "requirements.txt");
  if (fs.existsSync(reqPath)) {
    const req = readFileSafe(reqPath);
    if (req.includes("fastapi"))  stack.add("FastAPI");
    if (req.includes("django"))   stack.add("Django");
    if (req.includes("flask"))    stack.add("Flask");
    stack.add("Python");
  }

  if (fs.existsSync(path.join(repoRoot, "pom.xml"))) {
    stack.add("Java"); stack.add("Maven");
  }
  if (fs.existsSync(path.join(repoRoot, "go.mod"))) {
    stack.add("Go");
  }

  return [...languages, ...stack];
}

function detectArchitecturePattern(allFiles, repoRoot) {
  const paths = allFiles.map(f => f.replace(repoRoot, "").toLowerCase());

  const hasMVC = paths.some(p => p.includes("controller")) &&
                 paths.some(p => p.includes("model")) &&
                 paths.some(p => p.includes("view") || p.includes("template"));

  const hasMicroservices = paths.filter(p =>
    p.includes("service") && p.split("/").length > 3
  ).length > 3;

  const hasLayers = paths.some(p => p.includes("repository") || p.includes("repo")) &&
                    paths.some(p => p.includes("service")) &&
                    paths.some(p => p.includes("controller"));

  if (hasMicroservices) return "Microservices";
  if (hasMVC)           return "MVC (Model-View-Controller)";
  if (hasLayers)        return "Layered Architecture (Controller → Service → Repository)";
  return "Modular / Component-Based";
}

function extractComponents(allFiles, repoRoot) {
  const srcExtensions = new Set([".js", ".ts", ".py", ".java", ".cs", ".go", ".rb"]);
  const components = [];
  const importGraph = {};

  for (const filePath of allFiles) {
    const ext = path.extname(filePath);
    if (!srcExtensions.has(ext)) continue;

    const relPath = filePath.replace(repoRoot + path.sep, "");
    const name    = path.basename(filePath, ext);
    const content = readFileSafe(filePath);
    const imports = extractImports(content, ext);
    const type    = guessComponentType(name);

    // Only track non-trivial files
    if (content.trim().length < 20) continue;

    // Resolve local imports to component names
    const localCalls = imports
      .filter(i => i.startsWith(".") || i.startsWith("/"))
      .map(i => path.basename(i).replace(/\.[^.]+$/, ""))
      .filter(Boolean);

    importGraph[name] = localCalls;

    // Guess purpose from content
    let purpose = "";
    if (type === "controller") purpose = `Handles HTTP routes for ${name.replace(/controller/i, "").trim() || "resources"}`;
    else if (type === "service")    purpose = `Business logic for ${name.replace(/service/i, "").trim() || "domain"}`;
    else if (type === "repository") purpose = `Data access layer for ${name.replace(/repository|repo/i, "").trim() || "entities"}`;
    else if (type === "middleware") purpose = `Middleware: ${name}`;
    else if (type === "model")      purpose = `Data model / schema: ${name}`;
    else if (type === "config")     purpose = `Configuration: ${name}`;
    else                            purpose = `Module: ${name}`;

    components.push({
      name,
      file: relPath,
      type,
      purpose,
      calls: localCalls,
    });
  }

  return { components, importGraph };
}

function detectExternalServices(allFiles) {
  const found = new Map();

  for (const filePath of allFiles) {
    const ext = path.extname(filePath);
    if (![".js", ".ts", ".py", ".java", ".cs", ".go"].includes(ext)) continue;

    const content = readFileSafe(filePath);
    const relPath = filePath;

    for (const { pattern, service, type } of EXTERNAL_SERVICE_PATTERNS) {
      if (pattern.test(content)) {
        if (!found.has(service)) {
          found.set(service, { name: service, type, used_by: [] });
        }
        const baseName = path.basename(filePath, ext);
        if (!found.get(service).used_by.includes(baseName)) {
          found.get(service).used_by.push(baseName);
        }
      }
    }
  }

  return [...found.values()];
}

function detectEntryPoints(allFiles, repoRoot) {
  return allFiles
    .filter(f => ENTRY_POINT_NAMES.has(path.basename(f)))
    .map(f => f.replace(repoRoot + path.sep, ""));
}

function buildDataFlows(components, externalServices) {
  const flows = [];

  const controllers  = components.filter(c => c.type === "controller");
  const services     = components.filter(c => c.type === "service");
  const repositories = components.filter(c => c.type === "repository");
  const databases    = externalServices.filter(s => s.type === "database");

  if (controllers.length && services.length && repositories.length) {
    flows.push({
      name: "Standard request flow",
      from: "HTTP Request (Client)",
      through: ["Router", "Middleware", "Controller", "Service", "Repository"],
      to: databases.length ? databases[0].name : "Database",
    });
  }

  if (components.some(c => c.type === "middleware")) {
    flows.push({
      name: "Auth / validation pipeline",
      from: "Incoming Request",
      through: ["AuthMiddleware", "ValidationMiddleware", "Controller"],
      to: "Service Layer",
    });
  }

  const queues = externalServices.filter(s => s.type === "message_queue");
  if (queues.length) {
    flows.push({
      name: "Async event flow",
      from: "Service",
      through: [queues[0].name, "Consumer / Worker"],
      to: "Background Processing",
    });
  }

  return flows;
}

function generateSummary(repoName, techStack, pattern, components, entryPoints, externalServices) {
  const compCount = components.length;
  const dbNames   = externalServices.filter(s => s.type === "database").map(s => s.name).join(", ") || "no detected database";
  const stack     = techStack.slice(0, 4).join(", ");

  return `${repoName} is a ${pattern} application built with ${stack}. ` +
    `It contains ${compCount} detected component(s) with ${entryPoints.length} entry point(s). ` +
    `External dependencies include: ${dbNames}. ` +
    `The system follows a ${pattern} approach for organizing business logic and data access.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const { repo, out } = parseArgs();
  const repoRoot = path.resolve(repo);
  const repoName = path.basename(repoRoot);

  console.log(`\n🔍  Analyzing repository: ${repoRoot}\n`);

  if (!fs.existsSync(repoRoot)) {
    console.error(`❌  Repository path does not exist: ${repoRoot}`);
    process.exit(1);
  }

  // Step 1 — Walk all files
  process.stdout.write("  [1/6] Scanning files...");
  const allFiles = walkDir(repoRoot);
  console.log(` ${allFiles.length} files found`);

  // Step 2 — Tech stack
  process.stdout.write("  [2/6] Detecting tech stack...");
  const techStack = detectTechStack(allFiles, repoRoot);
  console.log(` ${techStack.join(", ") || "unknown"}`);

  // Step 3 — Architecture pattern
  process.stdout.write("  [3/6] Detecting architecture pattern...");
  const archPattern = detectArchitecturePattern(allFiles, repoRoot);
  console.log(` ${archPattern}`);

  // Step 4 — Components
  process.stdout.write("  [4/6] Extracting components...");
  const { components } = extractComponents(allFiles, repoRoot);
  console.log(` ${components.length} components found`);

  // Step 5 — External services
  process.stdout.write("  [5/6] Detecting external services...");
  const externalServices = detectExternalServices(allFiles);
  console.log(` ${externalServices.length} service(s): ${externalServices.map(s => s.name).join(", ") || "none"}`);

  // Step 6 — Entry points + data flows + summary
  process.stdout.write("  [6/6] Building data flows...");
  const entryPoints = detectEntryPoints(allFiles, repoRoot);
  const dataFlows   = buildDataFlows(components, externalServices);
  const summary     = generateSummary(repoName, techStack, archPattern, components, entryPoints, externalServices);
  console.log(` ${dataFlows.length} flow(s) detected\n`);

  // Assemble output
  const output = {
    repo_name:            repoName,
    analyzed_at:          new Date().toISOString(),
    tech_stack:           techStack,
    architecture_pattern: archPattern,
    entry_points:         entryPoints,
    components,
    data_flows:           dataFlows,
    external_services:    externalServices,
    summary,
  };

  // Write output
  const outDir = path.dirname(path.resolve(out));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅  Analysis complete!`);
  console.log(`📄  Output written to: ${path.resolve(out)}\n`);
  console.log(`── Summary ──────────────────────────────────────────`);
  console.log(summary);
  console.log(`─────────────────────────────────────────────────────\n`);
}

main();
