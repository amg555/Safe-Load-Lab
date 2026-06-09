# Support

## Getting Help

If you have questions, run into issues, or need help:

1. **Check the Documentation** - Start with [README.md](README.md) and [SETUP.md](SETUP.md)
2. **Review Examples** - Check [examples/](examples/) for config patterns
3. **Search Issues** - Look through [GitHub Issues](https://github.com/YOUR_USERNAME/safe-load-lab/issues) to see if someone else has encountered the same problem
4. **Create an Issue** - If you can't find an answer, [open a new issue](https://github.com/YOUR_USERNAME/safe-load-lab/issues/new)

## Where to Get Help

### Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Quick start, overview, and basic usage |
| [SETUP.md](SETUP.md) | Detailed setup and troubleshooting guide |
| [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) | Complete configuration reference |
| [SECURITY.md](SECURITY.md) | Safety and security guidelines |

### Examples

- `examples/basic.json` - Simple single-stage test
- `examples/advanced.json` - Multi-stage with auth, GraphQL, environment profiles

## Common Issues

### Command not found (`sll: command not found`)

**Solution:** Reinstall globally:

```bash
npm install -g .
```

Check npm global bin:

```bash
npm bin -g
```

Ensure that path is in your shell PATH.

### Missing safety flag

**Error:** `Missing required safety flag: --i-own-this-target`

**Solution:** Add the flag to your command:

```bash
sll run --url http://localhost:3000/api/health --duration 30 --concurrency 5 --rps 10 --i-own-this-target
```

### Environment profile not found

**Error:** `Environment profile not found: staging`

**Solution:** Verify the environment exists in your config:

```json
{
  "defaultEnv": "staging",
  "environments": {
    "local": { "baseUrl": "http://localhost:3000" },
    "staging": { "baseUrl": "https://staging.example.com" }
  }
}
```

Then run:

```bash
sll run --config load-test.json --env staging --i-own-this-target
```

### Connection refused

**Error:** Connection refused to your target

**Solution:** 
1. Verify your target application is running
2. Check the URL in your config
3. Test with curl: `curl http://localhost:3000/api/health`

## Bug Reports

When reporting bugs, please include:

1. **What you expected to happen**
2. **What actually happened**
3. **Step-by-step instructions to reproduce**
4. **Your environment:**
   - OS (Windows/macOS/Linux)
   - Node.js version (`node -v`)
   - Safe Load Lab version (`sll version`)
   - How you installed it (npm global, local, Docker)
5. **Config file** (remove sensitive data first)
6. **Full command output**

## Feature Requests

When requesting features, please include:

1. **What you want to do**
2. **Why you want to do it**
3. **Any examples or references**
4. **Alternative approaches you've considered**

## Security Issues

**Do NOT open a public issue for security vulnerabilities.**

Instead, please report security issues responsibly:

1. Check [SECURITY.md](SECURITY.md) for our security policy
2. Email the maintainers directly (or use GitHub's security reporting feature if available)

## Community

We welcome contributions from everyone. Please be respectful and inclusive.

## Disclaimer

Safe Load Lab is for testing systems you own or have explicit permission to test. We are not responsible for misuse of this tool.

**Do not use Safe Load Lab against:**
- Third-party systems without written permission
- Public websites
- Shared infrastructure
- Production systems without authorization