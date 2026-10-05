# Cache Hunter

Transparent proxy for OpenAI-API compatible endpoints with SQLite logging to debug prefix caching behavior.

## Quick Start

```bash
# Install
npm install

# Start proxy
npm start

# Point Harness to the proxy
export OPENAI_BASE_URL=http://localhost:8787

# Run your Harness tool as normal — all traffic gets logged
```

## Architecture

```
Harness → Proxy (localhost:8787) → OpenAI-API endpoint (127.0.0.1:8000)
                                   ↓
                             cache-hunter.db
```

## Configuration

Set via environment variables (or persisted from the UI):
- `TARGET_HOST` (default: `127.0.0.1`)
- `TARGET_PORT` (default: `8000`)
- `PROXY_PORT` (default: `8787`)
- `WEB_PORT` (default: `4000`)
- `CACHE_HUNTER_DATA_DIR` (default: `data/` in the checkout)
- `CACHE_HUNTER_AUTO_CAPTURE=1` starts capture after proxy startup and the session sweep; startup failures exit nonzero for a service manager to restart

The dashboard and capture listener bind to `127.0.0.1`.

## Request analysis

Capture decodes `Content-Encoding` before storing the UTF-8 request body. Supported encodings are gzip, deflate, Brotli and zstd; zstd requires a Node runtime with `zstdDecompressSync`. The original request bytes and headers are forwarded unchanged. Headers describe the original wire encoding, not the decoded stored body. Decoding failures are reported as capture errors without stopping forwarding or recording an empty replacement body.

For Anthropic `/v1/messages`, the hash grid includes the top-level `system` field as its first message row. String prompts and content-block arrays are preserved, including block metadata such as `cache_control`.

Previously captured compressed bodies stored as lossy UTF-8 cannot be reconstructed by these changes.

## Agent-session views

The sidebar lists capture windows used for storage and rotation. Inside a window, select one agent session to view its grid: Responses requests use the existing `prompt_cache_key`, while Claude Code requests use `session_id` from the JSON string in `metadata.user_id`. Claude parent IDs are retained when present. Requests without a usable identifier are labeled unattributed. No identification headers are injected and request bodies are not changed.

## Capture retention

Completed capture databases expire after 24 hours or when their total size exceeds 1 GiB, oldest first. Active windows rotate after one hour or 128 MiB. Maintenance runs after each persisted request and every minute; byte limits are enforced after a write completes. Rotation drains pending writes before closing a file, and never changes the upstream request. Deleting an active window opens a replacement automatically.

Limits apply to managed capture databases, not old trial directories or operational log files.

## Pi Codex routing

`integrations/pi/codex-routing.ts` registers a Codex-only provider override using Pi's native API implementation. A global extension wrapper supplies `openAICodexResponsesApi()` from Pi's own `@earendil-works/pi-ai` runtime and calls `registerCodexRouting`. This avoids another installed SDK copy. The integration forces SSE, maps the local request path to `/v1/responses`, preserves native options and rejects endpoint bypass. Other providers remain direct.

Existing Pi sessions require `/reload`; future sessions discover the global wrapper automatically. A deliberate `--no-extensions` launch disables this integration. A running proxy alone does not redirect clients. Prompt/tool bodies are retained unchanged; the managed launcher filters credential headers. Claude routing is separate from the dashboard's ability to parse Claude IDs.

## Database Schema

### requests
- `id` - UUID for correlation
- `timestamp` - Unix ms
- `method` - HTTP method
- `path` - Request path
- `headers` - JSON string
- `body` - Full decoded request body (UTF-8 text)
- `cache_salt` - Extracted if present in body
- `client_ip` - Client IP address

### responses
- `request_id` - FK to requests.id
- `timestamp` - Unix ms
- `status_code` - HTTP status
- `headers` - JSON string
- `body` - Full response body (JSON string)
- `duration_ms` - Total request duration
- `prompt_tokens` - From usage.prompt_tokens
- `completion_tokens` - From usage.completion_tokens
- `total_tokens` - From usage.total_tokens

## Query Examples

### Basic queries
```bash
node query-examples.js
```

### Cache analysis
```bash
node analyze-cache.js
```

### Advanced pattern detection
```bash
npm run analyze
```

### Context coherence verification
```bash
npm run demo
npm run tree
```

This provides:
- Latency trends over time
- Prefix hash analysis
- Conversational chain detection
- Cache invalidation indicators
- CSV export for visualization

### Manual queries
```bash
sqlite3 cache-hunter.db

-- Recent requests
SELECT datetime(timestamp/1000, 'unixepoch', 'localtime') as time,
       path, duration_ms, prompt_tokens
FROM responses
ORDER BY timestamp DESC
LIMIT 10;

-- Find requests with similar prefixes
SELECT r1.id, r2.id, substr(r1.body, 1, 100) as prefix
FROM requests r1
JOIN requests r2 ON r2.timestamp > r1.timestamp
WHERE r1.path = '/v1/chat/completions'
  AND r2.path = '/v1/chat/completions'
  AND r2.body LIKE r1.body || '%'
ORDER BY r2.timestamp DESC
LIMIT 5;

-- Latency per token (high values = potential cache misses)
SELECT datetime(timestamp/1000, 'unixepoch', 'localtime') as time,
       prompt_tokens,
       duration_ms,
       round(duration_ms * 1.0 / prompt_tokens, 2) as ms_per_token
FROM responses
WHERE prompt_tokens > 50
ORDER BY ms_per_token DESC;
```

## Debugging Cache Behavior

vLLM's prefix caching is **transparent** - it doesn't expose cache hit/miss signals. To detect caching behavior:

### 1. Latency Analysis
Cache hits should show **lower ms/token** for requests with similar prefixes:
```sql
SELECT prompt_tokens, duration_ms,
       round(duration_ms * 1.0 / prompt_tokens, 2) as ms_per_token
FROM responses
WHERE prompt_tokens > 100
ORDER BY ms_per_token;
```

### 2. Prefix Overlap Detection
Find requests that share prefixes:
```sql
SELECT r1.body as req1, r2.body as req2
FROM requests r1, requests r2
WHERE r2.body LIKE r1.body || '%'
  AND length(r1.body) > 100
  AND length(r1.body) < length(r2.body);
```

### 3. Timeline Analysis
Look for latency patterns over time:
```sql
SELECT datetime(timestamp/1000, 'unixepoch', 'localtime') as time,
       duration_ms, prompt_tokens
FROM responses
ORDER BY timestamp;
```

## Features

- ✅ **100% Transparent**: Forwards all requests as-is
- ✅ **SSE Streaming**: Supports `/v1/chat/completions` streaming
- ✅ **Async Logging**: Non-blocking SQLite writes
- ✅ **Correlation IDs**: `x-proxy-request-id` header for tracing
- ✅ **Token Metrics**: Logs prompt/completion/total tokens
- ✅ **Timing Data**: Precise duration measurements
- ✅ **Context Verification**: Hash-based tree to verify conversation coherence

## Limitations

- **No cache signals**: vLLM doesn't expose cache hit/miss
- **Network latency**: Duration includes localhost→vLLM network time
- **Memory queue**: In-memory write queue (flushed every 100ms or 50 requests)

## Cleanup

```bash
# Remove all logs
rm cache-hunter.db
```

## How It Works

1. **Proxy intercepts** all HTTP requests to the upstream endpoint
2. **Captures request** body, headers, timestamp
3. **Forwards transparently** to the target (127.0.0.1:8000)
4. **Captures response** body, headers, duration, token counts
5. **Logs to SQLite** asynchronously (batched writes)
6. **Adds correlation ID** header (`x-proxy-request-id`)

## Development

```bash
# Watch mode
npm run dev

# Direct TypeScript execution
npx tsx src/index.ts
```
