# Security and Safe Use Policy

Safe Load Lab is for controlled testing of systems you own or have explicit permission to test.

Do not use it against third-party services, shared infrastructure, public targets, or production systems without written authorization and a maintenance window.

## Built-in safety controls

- Hard max duration: 600 seconds
- Hard max concurrency: 100
- Hard max RPS: 200
- Hard max body size: 1 MB
- `run` and `rate-limit` require `--i-own-this-target`
- Reports do not store request headers or request bodies by default

## Recommended operating procedure

1. Start in local/staging.
2. Start with small values.
3. Monitor infrastructure and logs.
4. Increase gradually.
5. Stop immediately if users or dependencies are impacted.
6. Avoid tests that call paid/third-party APIs unless explicitly approved.
