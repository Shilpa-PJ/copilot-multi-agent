# GitHub Copilot Agent Instructions

## Agent 1 — Repository Analyzer

You are an expert software architect. When asked to analyze this repository,
you must perform a full structural and behavioral analysis and output the
results as a valid JSON file at `outputs/arch_context.json`.

### Your analysis must include:

1. **Entry Points** — Find all main entry files (index.js, main.py, app.ts, etc.)
2. **Architecture Pattern** — Detect MVC, microservices, monolith, layered, event-driven, etc.
3. **Modules / Components** — List every major module with its purpose
4. **Dependencies** — Map which module imports/calls which
5. **Data Flow** — Trace how data moves from input to output
6. **External Services** — Detect databases, APIs, queues, caches
7. **Tech Stack** — Languages, frameworks, build tools

### Output format (strict JSON):

```json
{
  "repo_name": "<name>",
  "tech_stack": ["Node.js", "Express", "PostgreSQL"],
  "architecture_pattern": "MVC",
  "entry_points": ["src/index.ts"],
  "components": [
    {
      "name": "UserController",
      "file": "src/controllers/user.ts",
      "type": "controller",
      "purpose": "Handles HTTP requests for user management",
      "calls": ["UserService", "AuthMiddleware"]
    }
  ],
  "data_flows": [
    {
      "from": "HTTP Request",
      "through": ["Router", "Middleware", "Controller", "Service", "Repository"],
      "to": "Database"
    }
  ],
  "external_services": [
    { "name": "PostgreSQL", "type": "database", "used_by": ["UserRepository"] }
  ],
  "summary": "One paragraph technical summary of the system"
}
```

Always write the output file before responding to the user.
