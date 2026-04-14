# GitHub Copilot Multi-Agent System

A two-agent pipeline that analyzes any code repository and produces:

1. **A flow architecture diagram** (structured JSON + data flows) — Agent 1
2. **A plain-English explanation** any non-developer can understand — Agent 2

---

## Project Structure

```
copilot-multi-agent/
├── .github/
│   ├── copilot-instructions.md   ← Tells Copilot how to behave in this repo
│   └── workflows/
│       └── analyze.yml           ← GitHub Actions: auto-runs on every PR
├── agents/
│   ├── agent1_analyzer.js        ← Agent 1: scans repo → arch_context.json
│   └── agent2_explainer.js       ← Agent 2: reads JSON → plain-English report
├── scripts/
│   └── run_pipeline.js           ← Orchestrator: runs both agents in sequence
├── outputs/                      ← Auto-created: all outputs land here
│   ├── arch_context.json
│   └── explanation.md
└── package.json
```

---

## Step-by-Step Setup

### Step 1 — Prerequisites

Make sure you have:
- **Node.js 18+** — [download here](https://nodejs.org)
- **Git** — [download here](https://git-scm.com)
- A GitHub account with **Copilot access** (for the API-powered explanation)

Verify your Node version:
```bash
node --version    # should print v18.x.x or higher
```

---

### Step 2 — Clone or copy this project

```bash
git clone https://github.com/YOUR_USERNAME/copilot-multi-agent.git
cd copilot-multi-agent
```

No `npm install` needed — both agents use only Node.js built-in modules.

---

### Step 3 — Set up your API key (for AI-powered explanations)

Agent 2 calls the GitHub Models API (backed by Copilot) to generate smart explanations.

**Option A — GitHub Token (recommended, free with Copilot)**

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a name like `copilot-multi-agent`
4. Select scope: `read:user` (minimum required)
5. Copy the token

```bash
# Mac / Linux
export GITHUB_TOKEN=ghp_your_token_here

# Windows (PowerShell)
$env:GITHUB_TOKEN = "ghp_your_token_here"

# To make it permanent, add it to your ~/.bashrc or ~/.zshrc
echo 'export GITHUB_TOKEN=ghp_your_token_here' >> ~/.bashrc
```

**Option B — OpenAI key (fallback)**

```bash
export OPENAI_API_KEY=sk-your-key-here
```

**No key?** — The system still works! It falls back to a template-based explanation.

---

### Step 4 — Run Agent 1 (Repository Analyzer)

Point Agent 1 at any repository on your machine:

```bash
node agents/agent1_analyzer.js --repo /path/to/your/project
```

**Example — analyze a sample Express project:**
```bash
node agents/agent1_analyzer.js --repo ./sample-express-app
```

**Output:** `outputs/arch_context.json` — contains:
- Architecture pattern (MVC, microservices, etc.)
- All detected components with their types and purposes
- Data flows (how a request moves through the system)
- External services (database, cache, queue, etc.)
- Full tech stack

---

### Step 5 — Run Agent 2 (Plain-English Explainer)

```bash
node agents/agent2_explainer.js
```

Optional flags:
```bash
# Change input context file
node agents/agent2_explainer.js --context outputs/arch_context.json

# Output as HTML instead of Markdown
node agents/agent2_explainer.js --format html --out outputs/explanation.html

# Output as plain text
node agents/agent2_explainer.js --format text --out outputs/explanation.txt
```

**Output:** `outputs/explanation.md` — a plain-English report with:
- What the system does (executive summary)
- How it works step by step
- What each component is responsible for
- External tools and why they exist
- Quality observations

---

### Step 6 — Run both agents in one command (Pipeline)

```bash
# Markdown output (default)
node scripts/run_pipeline.js --repo /path/to/your/project

# HTML output (great for sharing with stakeholders)
node scripts/run_pipeline.js --repo /path/to/your/project --format html
```

Or use the npm shortcuts:
```bash
npm run pipeline           # analyzes current directory
npm run pipeline:html      # outputs HTML
```

---

### Step 7 — Set up GitHub Actions (automated PR analysis)

This automatically runs the pipeline on every pull request and posts the
explanation as a PR comment.

**7a — Add your GitHub token as a repository secret:**

1. Go to your repo on GitHub
2. Settings → Secrets and variables → Actions
3. Click **New repository secret**
4. Name: `GITHUB_TOKEN` (already built in — no action needed)

The workflow in `.github/workflows/analyze.yml` uses the built-in
`secrets.GITHUB_TOKEN` automatically.

**7b — Push the workflow to your repo:**

```bash
git add .github/workflows/analyze.yml
git commit -m "Add multi-agent analysis pipeline"
git push origin main
```

**7c — Trigger it:**

Open a pull request against your repo. The action runs automatically.
A comment will appear on the PR with the full architecture explanation.

To run it manually:
1. Go to **Actions** tab in your repo
2. Select **Multi-Agent Code Analysis**
3. Click **Run workflow**

---

## Example Output

### arch_context.json (Agent 1 output)

```json
{
  "repo_name": "my-api",
  "tech_stack": ["TypeScript", "Node.js", "Express", "PostgreSQL"],
  "architecture_pattern": "Layered Architecture (Controller → Service → Repository)",
  "entry_points": ["src/index.ts"],
  "components": [
    {
      "name": "UserController",
      "file": "src/controllers/user.ts",
      "type": "controller",
      "purpose": "Handles HTTP routes for user management",
      "calls": ["UserService", "AuthMiddleware"]
    }
  ],
  "data_flows": [
    {
      "name": "Standard request flow",
      "from": "HTTP Request (Client)",
      "through": ["Router", "Middleware", "Controller", "Service", "Repository"],
      "to": "PostgreSQL"
    }
  ],
  "external_services": [
    { "name": "PostgreSQL", "type": "database", "used_by": ["UserRepository"] },
    { "name": "JWT Auth",   "type": "auth",     "used_by": ["AuthMiddleware"] }
  ]
}
```

### explanation.md (Agent 2 output excerpt)

```
## What this system does

my-api is a web application that manages user data through a clean,
layered structure. It receives requests, processes them safely, and stores
the results in a database.

## How it works — step by step

1. A user (or another application) sends a request to the API.
2. The Router decides which part of the system should handle it.
3. Middleware checks if the user is allowed to make this request (authentication).
4. The Controller receives the request and passes it to the right Service.
5. The Service applies business rules and asks the Repository for data.
6. The Repository talks to PostgreSQL (the database) to read or save data.
7. The result travels back through the layers to the user.
```

---

## Customizing Agent 2's Explanation Style

Edit the `buildSystemPrompt()` function in `agents/agent2_explainer.js` to change:
- The tone (formal vs. casual)
- The audience (executives, investors, support staff)
- The output format
- The sections included

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `node: command not found` | Install Node.js from nodejs.org |
| `outputs/arch_context.json not found` | Run Agent 1 first |
| `API call failed: 401` | Check your GITHUB_TOKEN or OPENAI_API_KEY |
| No components detected | The repo may be empty or use an unsupported language |
| GitHub Action fails | Check Actions tab for error logs; verify secrets are set |

---

## Requirements

- Node.js 18+
- No external npm packages required
- GitHub Token or OpenAI key (optional, for AI-powered explanations)
