import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

/*
* @see https://modelcontextprotocol.io/docs/develop/build-server#typescript
* */

// ── Server factory ────────────────────────────────────────────────
// A new McpServer instance is created per request (stateless mode —
// no session state is shared between requests).

function createMcpServer(): McpServer {
    const server = new McpServer({ name: "mcp-sample-sdk", version: "1.0.0" });

    server.registerTool(
        "get_weather",
        {
            description: "Get current weather for a city",
            inputSchema: { city: z.string().describe("City name") },
            outputSchema: {
                city: z.string(),
                temp: z.number(),
                condition: z.string(),
                unit: z.string(),
            },
        },
        async ({ city }) => {
            console.error("executeTool called with name get_weather");
            const structuredContent = { city, temp: 22, condition: "sunny", unit: "celsius" };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(structuredContent),
                    },
                ],
                structuredContent,
            };
        }
    );

    server.registerTool(
        "add_numbers",
        {
            description: "Add two numbers together",
            inputSchema: { a: z.number(), b: z.number() },
            outputSchema: {
                result: z.number(),
            },
        },
        async ({ a, b }) => {
            console.error("executeTool called with name add_numbers");
            const structuredContent = { result: a + b };
            return {
                content: [{ type: "text", text: JSON.stringify(structuredContent) }],
                structuredContent,
            };
        }
    );

    return server;
}

// ── HTTP Server ───────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
    if (req.url !== "/mcp") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
    }

    // Stateless mode: omitting sessionIdGenerator disables session management.
    // enableJsonResponse returns plain JSON instead of SSE, which is simpler for testing with curl.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
});

httpServer.listen(3000, () => {
    console.error("MCP server (SDK) running on http://localhost:3000/mcp");
});
