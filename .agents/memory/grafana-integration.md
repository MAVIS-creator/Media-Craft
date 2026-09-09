---
name: Grafana integration boundary
description: Defines how MediaCraft should divide Grafana runtime telemetry from Agent-side MCP investigation.
---

MediaCraft application runtime should send health checks and job annotations through Replit's authenticated Grafana connector. Keep the Grafana Cloud MCP connection for Replit Agent datasource checks and incident investigation; do not describe MCP tools as directly callable by the Node server.

**Why:** Replit mounts MCP tools in Agent workflows, while application code receives connector SDK access. Treating the MCP endpoint as an app-runtime API creates a misleading integration and falls back to manually managed credentials.

**How to apply:** Use the connector SDK for server-originated Grafana HTTP API calls, keep observability failures non-blocking for media jobs, and use MCP tools when an operator asks the Agent to inspect Grafana.