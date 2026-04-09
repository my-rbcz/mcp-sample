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