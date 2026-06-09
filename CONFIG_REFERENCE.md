# Config Reference

## Minimal config

```json
{
  "name": "my-test",
  "durationSeconds": 30,
  "concurrency": 5,
  "rps": 10,
  "endpoints": [
    { "name": "health", "method": "GET", "url": "http://localhost:3000/api/health" }
  ]
}
```

## Stages

Use stages for realistic ramp-up, steady-state, and cool-down tests.

```json
"stages": [
  { "name": "warm-up", "durationSeconds": 30, "concurrency": 3, "rps": 8 },
  { "name": "steady", "durationSeconds": 120, "concurrency": 20, "rps": 50 },
  { "name": "cool-down", "durationSeconds": 30, "concurrency": 3, "rps": 8 }
]
```

Total staged duration must be at most 600 seconds.

## Templates

Use `{{variable}}` placeholders in URLs, headers, and bodies.

Variables can come from:

- `variables`
- selected `environments.<name>.variables`
- setup extraction values
- `baseUrl`

## Setup extraction

```json
"setup": [
  {
    "name": "login",
    "method": "POST",
    "url": "{{baseUrl}}/api/login",
    "body": { "email": "{{email}}", "password": "{{password}}" },
    "headers": { "Content-Type": "application/json" },
    "expectStatus": 200,
    "extract": { "token": "body.token" }
  }
]
```

## Thresholds

```json
"thresholds": {
  "maxErrorRate": 0.01,
  "p95Ms": 500,
  "p99Ms": 1000
}
```

A failed threshold makes the CLI exit with code `2`, useful for CI.
