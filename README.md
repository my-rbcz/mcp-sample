# mcp-sample

Minimal sample implementation of MCP server. For learning purposes.

Start with reading [the MCP overview tutorial](./mcp-intro.md) to understand the basics of MCP and how it works.

## How to build and run

```bash
npm run build
npm start
```

## How to test with curl

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

# Step 5: Call add_numbers tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"add_numbers","arguments":{"a":5,"b":3}}}'
```

## Integration with Claude Desktop

To use this MCP server with Claude Desktop:

1. **Install Claude Desktop** from [claude.ai](https://claude.ai)

2. **Locate the Claude configuration file**:
   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - On Linux: `~/.config/Claude/claude_desktop_config.json`

3. **Add your MCP server to the config**:
   ```json
   {
     "mcpServers": {
       "mcp-sample": {
         "url": "http://localhost:3000"
       }
     }
   }
   ```
   Make sure your MCP server is running before launching Claude Desktop.

4. **Restart Claude Desktop** for changes to take effect

5. **Test in Claude**: Ask Claude to use the tools. For example:
   - "What's the weather in Paris?"
   - "Add 10 and 25"

## Integration with GitHub Copilot

GitHub Copilot support for MCP servers is available through:

1. **VS Code with Copilot Extension**:
   - Install the [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension
   - Configure your MCP servers in your workspace settings or global settings

2. **Configuration**:
   Add to `.vscode/settings.json`:
   ```json
   {
     "mcp.servers": {
       "mcp-sample": {
         "url": "http://localhost:3000"
       }
     }
   }
   ```
   Make sure your MCP server is running before using Copilot.

3. **Alternative: JetBrains IDEs**:
   - Copilot integration in JetBrains IDEs supports MCP servers
   - Configure through IDE settings → AI Tools → Model Context Protocol

## Testing with Your IDE

Once integrated:

1. **Ask Copilot** (in chat or inline):
   - "Use the add_numbers tool to add 15 and 20"
   - "Get the weather for London"

2. **Monitor the Server**:
   - Keep your server running: `npm start`
   - Check console for incoming MCP requests
   - Verify responses in the Copilot chat

3. **Debug Issues**:
   - Check server logs for errors
   - Verify the config path is correct
   - Ensure the server is compiled: `npm run build`
   - Make sure the server is running on the expected port (3000)

## Troubleshooting

- **Tools not appearing**: Restart the IDE/Claude Desktop after updating config
- **Connection refused**: Make sure the server is running (`npm start`)
- **Permission denied**: Check file permissions on the compiled output
- **Invalid JSON**: Verify the config file has valid JSON syntax
