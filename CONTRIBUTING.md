# Contributing to Safe Load Lab

Thank you for your interest in contributing to Safe Load Lab! This document explains how to set up the project for development and how to submit contributions.

## What is Safe Load Lab?

Safe Load Lab is a reusable, controlled load-testing CLI for applications you own or have permission to test. It's designed for:

- Capacity testing
- Performance benchmarking
- Rate-limit verification
- Auth-flow testing
- GraphQL endpoint testing
- Resilience testing

**Important**: This is NOT a DDoS tool. It has built-in safety limits to prevent abuse.

## Development Setup

### Prerequisites

- Node.js 18+ (we recommend Node.js 20 LTS)
- npm or bun package manager

### Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/safe-load-lab.git
cd safe-load-lab
```

### Install Dependencies

```bash
npm install
```

### Link for Development

To use the CLI during development:

```bash
npm link
```

This makes `safe-load-lab` and `sll` commands available globally, pointing to your local code.

## Running Tests

Run the test suite:

```bash
npm test
```

Expected output:

```text
pass 4
fail 0
```

Run smoke tests:

```bash
node --test tests/
```

## Project Structure

```
safe-load-lab/
├── bin/
│   └── safe-load-lab.js    # Main CLI implementation
├── examples/
│   ├── basic.json          # Basic config example
│   └── advanced.json       # Advanced config with stages, auth, GraphQL
├── schema/
│   └── config.schema.json  # JSON schema for config validation
├── tests/
│   └── smoke.test.mjs      # Smoke tests
├── ui/
│   └── server.js           # HTML report viewer (optional)
├── reports/                # Test reports (gitignored)
├── .github/
│   └── workflows/
│       └── safe-load-lab.yml  # CI/CD workflow
└── documentation files     # README, SETUP, CONFIG_REFERENCE, etc.
```

## Running the CLI During Development

After `npm link`, you can use:

```bash
safe-load-lab help
sll help
```

To run a test:

```bash
sll sample --out load-test.json
# Edit the config, then:
sll validate --config load-test.json
sll plan --config load-test.json
sll run --config load-test.json --i-own-this-target
```

## Code Style

- Use ES modules (`import`/`export`)
- Follow the existing code style and conventions
- No external dependencies (uses only Node.js built-ins)
- Keep functions focused and testable
- Add comments for complex logic

## Making Changes

1. Create a branch for your feature or bug fix:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes
3. Test thoroughly
4. Commit with a clear message:

```bash
git commit -m "Add feature: description of change"
```

5. Push your branch:

```bash
git push origin feature/your-feature-name
```

6. Open a Pull Request on GitHub

## Pull Request Guidelines

- Target your PR against the `main` branch
- Include a clear description of what changed and why
- Reference any related issues
- Update documentation if needed
- Ensure tests pass

## Adding New Features

Before implementing a new feature:

1. Open an issue describing the feature
2. Discuss the design with maintainers
3. Implement in a branch
4. Submit a PR

## Questions?

Open an issue or contact the maintainers.

## Code of Conduct

- Be respectful and inclusive
- Focus on what's best for the community
- Show empathy toward other community members