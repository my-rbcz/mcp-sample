# Research: Generating MCP Tool Descriptions from OpenAPI Specs

## Goal

Identify the best library/approach to automatically generate MCP tool definitions from an OpenAPI specification, fitting into the existing `@modelcontextprotocol/sdk` + Zod project setup.

## Top Recommendations

### 1. `@anthropic/openapi-to-mcp` (Static Codegen)

- **Source:** Published by Anthropic
- **How it works:** Reads an OpenAPI 3.x spec and emits TypeScript MCP server code — `server.registerTool(...)` calls with handlers that proxy to the real API.
- **Output:** Generated source files you check in and can customize.
- **Pros:**
  - Official Anthropic project
  - Full control over generated code
  - Fits naturally with `@modelcontextprotocol/sdk` + Zod pattern (like `server2.ts`)
- **Cons:**
  - Requires re-running codegen when the spec changes
  - Generated code may need manual edits for complex APIs

### 2. `openapi-mcp-server` (Runtime)

- **Source:** Community (`janwilmake/openapi-mcp-server`)
- **How it works:** Takes an OpenAPI spec URL at startup and exposes every operation as an MCP tool automatically at runtime.
- **Output:** No generated source — tools are created dynamically.
- **Pros:**
  - Zero code needed
  - Always in sync with the spec
- **Cons:**
  - Less customizable
  - Harder to extend with custom logic per tool
  - Spec must be available at server startup

### 3. Community Variants (`mcp-openapi` / `openapi-mcp`)

- **Source:** Various community projects on npm/GitHub
- **How it works:** Parse an OpenAPI spec at runtime and register MCP tools dynamically.
- **Pros:**
  - Flexible, multiple options to choose from
- **Cons:**
  - Varying quality and maintenance status
  - May lack auth passthrough or advanced features

## Key Decision Factors

| Factor | Static Codegen (`@anthropic/openapi-to-mcp`) | Runtime (`openapi-mcp-server`) |
|---|---|---|
| Customization | ✅ Full control over generated code | ❌ Limited |
| Spec sync | ❌ Must re-run codegen | ✅ Always in sync |
| Auth passthrough | Depends on generated code | Check library support |
| Fits existing project | ✅ Outputs `registerTool()` + Zod | ❌ Separate server process |
| Debugging | ✅ Readable source | ❌ Opaque runtime |

## Recommendation

**Use `@anthropic/openapi-to-mcp`** for this project because:

1. It generates code compatible with the existing `@modelcontextprotocol/sdk` + Zod setup.
2. Generated source can be reviewed, customized, and checked in.
3. It's maintained by Anthropic (the MCP spec authors).
4. Fits the educational/learning goal of the project — you can inspect the generated tool definitions.

## Next Steps

1. Install `@anthropic/openapi-to-mcp` and run it against a sample OpenAPI spec.
2. Review the generated tool definitions and handlers.
3. Integrate the output into `src/` alongside `server.ts` and `server2.ts`.
4. Validate with `curl` commands from the README.

