# Safe Load Lab

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![Node.js 20](https://img.shields.io/badge/node-20-green.svg)](https://nodejs.org/)
[![CI](https://github.com/YOUR_USERNAME/safe-load-lab/actions/workflows/safe-load-lab.yml/badge.svg)](https://github.com/YOUR_USERNAME/safe-load-lab/actions/workflows/safe-load-lab.yml)

A reusable, globally installable CLI for **controlled load testing** of applications you own or have explicit permission to test.

This is **not** a DDoS tool. It is designed for safe capacity, performance, rate-limit, auth-flow, GraphQL, and resilience testing.

## Features

- ✅ **Controlled Load Testing** - Configurable concurrency, RPS, and duration with hard safety limits
- ✅ **Staged Testing** - Warm-up, steady-state, and cool-down phases
- ✅ **Auth Flow Testing** - Setup requests with token extraction
- ✅ **GraphQL Support** - Native GraphQL endpoint testing
- ✅ **Rate-Limit Verification** - Safe verification of rate-limiting behavior
- ✅ **Environment Profiles** - Different configurations for local, staging, production
- ✅ **Multiple Report Formats** - JSON, CSV, HTML, and JUnit XML reports
- ✅ **Docker Support** - Containerized testing environment
- ✅ **CI/CD Ready** - Exit codes suitable for automation
- ✅ **Built-in Safety** - Hard caps on duration, concurrency, RPS, and body size

## Requirements

- Node.js 18+ (Node.js 20 LTS recommended)

## Installation

### Global Installation

```bash
npm install -g safe-load-lab
```

Then use either command:

```bash
safe-load-lab help
sll help
```

### Local Installation

```bash
npm install safe-load-lab
npx safe-load-lab help
npx sll help
```

## Quick Start

### One-Command Test

```bash
sll run \
  --url http://localhost:3000/api/health \
  --duration 30 \
  --concurrency 5 \
  --rps 10 \
  --i-own-this-target
```

### Config-Based Test

```bash
# Create a sample config
sll sample --out load-test.json

# Edit the config file, then run:
sll run --config load-test.json --i-own-this-target
```

### Validate Before Running

```bash
# Validate config without sending traffic
sll validate --config examples/advanced.json --env local

# Preview the test plan without sending traffic
sll plan --config examples/advanced.json --env local
```

## Commands

| Command | Description |
|---------|-------------|
| `run` | Run a controlled load test |
| `validate` | Validate config without sending traffic |
| `plan` | Preview resolved test plan without sending traffic |
| `sample` | Create a sample config file |
| `rate-limit` | Safe rate-limit verification for owned endpoints |
| `version` | Show version |
| `help` | Show help |

## Examples

### Basic Test

```json
{
  "name": "basic-api-test",
  "durationSeconds": 30,
  "concurrency": 5,
  "rps": 10,
  "endpoints": [
    {
      "name": "health",
      "method": "GET",
      "url": "http://localhost:3000/api/health"
    }
  ]
}
```

### Staged Ramp Testing

```json
{
  "stages": [
    { "name": "warm-up", "durationSeconds": 30, "concurrency": 3, "rps": 8 },
    { "name": "steady", "durationSeconds": 60, "concurrency": 10, "rps": 25 },
    { "name": "cool-down", "durationSeconds": 30, "concurrency": 3, "rps": 8 }
  ]
}
```

### Auth Flow with Token Extraction

```json
{
  "setup": [
    {
      "name": "login",
      "method": "POST",
      "url": "{{baseUrl}}/api/login",
      "body": { "email": "{{email}}", "password": "{{password}}" },
      "extract": { "token": "body.token" }
    }
  ],
  "endpoints": [
    {
      "name": "profile",
      "headers": { "Authorization": "Bearer {{token}}" }
    }
  ]
}
```

### GraphQL Testing

```json
{
  "endpoints": [
    {
      "name": "graphql",
      "graphql": {
        "query": "query { users { id name } }",
        "variables": {}
      }
    }
  ]
}
```

## Reports

Generate reports in multiple formats:

```bash
sll run \
  --config load-test.json \
  --i-own-this-target \
  --out reports/result.json \
  --csv reports/result.csv \
  --html reports/result.html \
  --junit reports/junit.xml
```

| Format | Option | Description |
|--------|--------|-------------|
| JSON | `--out` | Full machine-readable report |
| CSV | `--csv` | Per-request data |
| HTML | `--html` | Human-readable dashboard |
| JUnit XML | `--junit` | CI/CD test results |

## Configuration

Full configuration reference: [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md)

JSON schema: [schema/config.schema.json](schema/config.schema.json)

## Docker

Build:

```bash
docker build -t safe-load-lab .
```

Run:

```bash
docker run --rm safe-load-lab help
```

Against Docker Desktop host:

```bash
docker run --rm safe-load-lab run \
  --url http://host.docker.internal:3000/api/health \
  --duration 30 \
  --concurrency 5 \
  --rps 10 \
  --i-own-this-target
```

## CI/CD

Example GitHub Actions workflow: [.github/workflows/safe-load-lab.yml](.github/workflows/safe-load-lab.yml)

```yaml
- name: Install CLI
  run: npm install -g .
  working-directory: safe-load-lab
- name: Run controlled test
  run: |
    sll run \
      --config examples/advanced.json \
      --env staging \
      --i-own-this-target \
      --out reports/staging-report.json \
      --html reports/staging-report.html
  working-directory: safe-load-lab
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Test completed and thresholds passed |
| 1 | Configuration/runtime error |
| 2 | Test completed but thresholds failed |

## Safety Limits

- Max duration: 600 seconds
- Max concurrency: 100
- Max RPS: 200
- Max body size: 1 MB
- Requires `--i-own-this-target` flag for `run` and `rate-limit` commands

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](SETUP.md) | Detailed setup and troubleshooting guide |
| [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) | Complete configuration reference |
| [SECURITY.md](SECURITY.md) | Safety and security guidelines |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributing guidelines |
| [SUPPORT.md](SUPPORT.md) | Getting help |

## Project Structure

```
safe-load-lab/
├── bin/
│   └── safe-load-lab.js    # Main CLI
├── examples/
│   ├── basic.json          # Basic config
│   └── advanced.json       # Advanced config
├── schema/
│   └── config.schema.json  # JSON schema
├── tests/
│   └── smoke.test.mjs      # Tests
├── ui/
│   └── server.js           # HTML report viewer
├── .github/
│   └── workflows/          # CI/CD workflows
└── reports/                # Generated reports (gitignored)
```

## Related Tools

For enterprise-scale testing, consider:

- [k6](https://k6.io/) - Modern load testing
- [JMeter](https://jmeter.apache.org/) - Feature-rich testing
- [Locust](https://locust.io/) - Python-based testing
- [Grafana Cloud k6](https://k6.io/cloud/) - Cloud-based testing
- [Cloud Provider load testing](https://aws.amazon.com/performance/testing/) - Infrastructure-native testing

## License

[MIT](LICENSE)

## Acknowledgments

Safe Load Lab is designed for responsible, controlled testing of systems you own or have permission to test. Use responsibly and ethically.