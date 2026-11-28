# AfriFlow — code navigation

Before a substantial code investigation, use the local Graphify index if available. From the repository root:

- `graphify query "<question>" --budget 2000` to identify relevant symbols and files.
- `graphify explain "<symbol>"` to inspect its connections.
- `graphify affected "<symbol>"` to find potentially impacted code.

If the graph is missing or stale, regenerate with `graphify extract . --code-only` after installing the pinned dependency in `tools/requirements-graphify.txt`. The graph is advisory: verify findings against source files, permissions and tests. Do not rely on it to establish runtime behavior or database security. Never commit generated graph output, credentials or private data. Do not enable external LLM extraction or paid services without authorization.
