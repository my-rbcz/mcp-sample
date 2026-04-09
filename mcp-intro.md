# MCP Protocol: Raw Low-Level Tutorial (TypeScript)

MCP (Model Context Protocol) is surprisingly simple under the hood. It's just **JSON-RPC 2.0 over HTTP**. Here's everything you need to know to build one from scratch.

---

## 1. The Transport: It's Just HTTP POST

An MCP server is a single HTTP endpoint (e.g. `POST /mcp`) that accepts JSON-RPC 2.0 messages and returns JSON-RPC 2.0 responses. That's it. No special transport, no WebSockets required for the basic "Streamable HTTP" mode.

---

## 2. The Protocol: JSON-RPC 2.0

Every request looks like this:

```
POST /mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,              // present = request (expects response), absent = notification (no response)
  "method": "some/method",
  "params": { ... }
}
```

Every response looks like this:

```json
// Success:
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }

// Error:
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32601, "message": "Method not found" } }
```

Standard error codes:

| Code     | Meaning                                              |
| -------- | ---------------------------------------------------- |
| `-32700` | Parse error (invalid JSON)                           |
| `-32600` | Invalid request (bad jsonrpc version, missing method) |
| `-32601` | Method not found                                     |
| `-32602` | Invalid params                                       |
| `-32603` | Internal error                                       |

---

## 3. The Lifecycle: 3 Phases

**Phase 1 — Handshake (`initialize`)**

Client sends `initialize` → server responds with capabilities. Then client sends `notifications/initialized` (a notification, no `id`, no response expected).

**Phase 2 — Usage (`tools/list`, `tools/call`)**

Client discovers tools, calls them.

**Phase 3 — Shutdown**

Client disconnects. In stateless HTTP (like Lambda), there's nothing to do.

---

## 4. The Methods You Must Implement

There are only **3 methods + 1 notification** for a minimal tools server:

### a) `initialize` — Handshake

```
→ { "jsonrpc": "2.0", "id": 1, "method": "initialize",
     "params": { "protocolVersion": "2024-11-05", "clientInfo": { "name": "MyClient", "version": "1.0" } } }

← { "jsonrpc": "2.0", "id": 1, "result": {
       "protocolVersion": "2024-11-05",
       "capabilities": { "tools": { "listChanged": false } },
       "serverInfo": { "name": "my-server", "version": "1.0.0" }
   }}
```

Key points:

- Echo back the `protocolVersion` the client sent
- Declare what capabilities you support (just `tools` for a tools server)
- `listChanged: true` means you support notifying clients when the tool list changes

### b) `notifications/initialized` — Client Acknowledgement

```
→ { "jsonrpc": "2.0", "method": "notifications/initialized" }
  (no "id" field = notification = DO NOT RESPOND)

← HTTP 204 No Content (or just an empty 200)
```

### c) `tools/list` — Discover Available Tools

```
→ { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }

← { "jsonrpc": "2.0", "id": 2, "result": {
       "tools": [
         {
           "name": "get_weather",
           "description": "Get current weather for a city",
           "inputSchema": {
             "type": "object",
             "properties": {
               "city": { "type": "string", "description": "City name" }
             },
             "required": ["city"]
           }
         }
       ]
   }}
```

Key points:

- `inputSchema` is standard **JSON Schema** — this is what the LLM sees to understand how to call the tool
- Each tool has `name`, `description`, and `inputSchema`

### d) `tools/call` — Execute a Tool

```
→ { "jsonrpc": "2.0", "id": 3, "method": "tools/call",
     "params": { "name": "get_weather", "arguments": { "city": "Prague" } } }

← { "jsonrpc": "2.0", "id": 3, "result": {
       "content": [
         { "type": "text", "text": "{\"temp\": 22, \"condition\": \"sunny\"}" }
       ]
   }}
```

Key points:

- `params.name` — which tool to call
- `params.arguments` — the inputs (matching `inputSchema`)
- Response `content` is an **array of content blocks**, each with `type` and data
- Most common type is `"text"` with a `"text"` field (usually JSON stringified)
- For errors during tool execution (tool ran but failed), return `isError: true`:

```json
{ "content": [{ "type": "text", "text": "City not found" }], "isError": true }
```

---

## 5. Minimal MCP Server in Raw TypeScript (Node.js)

Here's a complete working server — no SDK, no libraries, just `node:http`:

```typescript
import http from "node:http";

// ── Tool Definitions ──────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_weather",
    description: "Get current weather for a city",
    inputSchema: {
      type: "object" as const,
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
  },
  {
    name: "add_numbers",
    description: "Add two numbers together",
    inputSchema: {
      type: "object" as const,
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    },
  },
];

// ── Tool Implementations ──────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_weather": {
      // In real life, call a weather API here
      const city = args.city as string;
      return { city, temp: 22, condition: "sunny", unit: "celsius" };
    }
    case "add_numbers": {
      const a = args.a as number;
      const b = args.b as number;
      return { result: a + b };
    }
    default:
      throw new ToolNotFoundError(name);
  }
}

// ── Error Classes ─────────────────────────────────────────────────

class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Tool not found: ${name}`);
  }
}

// ── JSON-RPC Router ───────────────────────────────────────────────

async function handleJsonRpc(body: {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}): Promise<{ status: number; body: string }> {
  const { jsonrpc, id, method, params } = body;

  // 1) Notification check — no "id" means no response
  if (id === undefined) {
    console.log(`Notification received: ${method}`);
    return { status: 204, body: "" };
  }

  // 2) Validate JSON-RPC version
  if (jsonrpc !== "2.0") {
    return jsonRpcError(id, -32600, "Invalid JSON-RPC version, expected 2.0");
  }

  // 3) Route to method handler
  try {
    let result: unknown;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion:
            (params as any)?.protocolVersion ?? "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "my-raw-mcp-server",
            version: "0.1.0",
          },
        };
        break;

      case "tools/list":
        result = { tools: TOOLS };
        break;

      case "tools/call": {
        const toolName = (params as any)?.name as string;
        const toolArgs = ((params as any)?.arguments ?? {}) as Record<
          string,
          unknown
        >;

        if (!toolName) {
          return jsonRpcError(
            id,
            -32602,
            "Missing 'name' in tools/call params"
          );
        }

        try {
          const output = await executeTool(toolName, toolArgs);
          // MCP tools/call result format: array of content blocks
          result = {
            content: [{ type: "text", text: JSON.stringify(output) }],
          };
        } catch (err) {
          if (err instanceof ToolNotFoundError) {
            return jsonRpcError(id, -32602, err.message);
          }
          // Tool execution error — return as tool result with isError flag
          result = {
            content: [
              {
                type: "text",
                text:
                  err instanceof Error ? err.message : "Unknown error",
              },
            ],
            isError: true,
          };
        }
        break;
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }

    // Success response
    return {
      status: 200,
      body: JSON.stringify({ jsonrpc: "2.0", id, result }),
    };
  } catch (err) {
    return jsonRpcError(
      id,
      -32603,
      err instanceof Error ? err.message : "Internal error"
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function jsonRpcError(
  id: number | string | null,
  code: number,
  message: string
): { status: number; body: string } {
  return {
    status: 200, // JSON-RPC errors are still HTTP 200
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }),
  };
}

// ── HTTP Server ───────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Only accept POST to /mcp
  if (req.method !== "POST" || req.url !== "/mcp") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const rawBody = Buffer.concat(chunks).toString("utf-8");

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    const errResp = jsonRpcError(
      null,
      -32700,
      "Parse error: invalid JSON"
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(errResp.body);
    return;
  }

  // Handle request
  const response = await handleJsonRpc(parsed);
  res.writeHead(response.status, {
    "Content-Type": "application/json",
  });
  res.end(response.body);
});

server.listen(3000, () => {
  console.log("MCP server running on http://localhost:3000/mcp");
});
```

---

## 6. Test It With curl

```bash
# Step 1: Initialize
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'

# Step 2: Send initialized notification (expect 204, no body)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# Step 3: List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Step 4: Call a tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"Prague"}}}'
```

---

## 7. Key Takeaways

| Concept          | Reality                                                         |
| ---------------- | --------------------------------------------------------------- |
| **Transport**    | Single `POST /mcp` endpoint                                    |
| **Protocol**     | JSON-RPC 2.0 — just `jsonrpc`, `id`, `method`, `params`        |
| **Notifications**| Request without `id` → no response (HTTP 204)                  |
| **Tool definition** | `name` + `description` + `inputSchema` (JSON Schema)        |
| **Tool result**  | `{ content: [{ type: "text", text: "..." }] }`                 |
| **Tool error**   | Same as result but with `isError: true`                         |
| **Protocol errors** | JSON-RPC error codes (`-32700`, `-32601`, etc.)             |
| **Lifecycle**    | `initialize` → `notifications/initialized` → `tools/list` → `tools/call` (repeat) |

The entire MCP "tools" protocol is essentially: **declare tools as JSON Schema, accept calls, return text content blocks**. Everything else (SDK, transports like SSE/stdio) is convenience layered on top of this foundation.

