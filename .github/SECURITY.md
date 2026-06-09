# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| < 1.2   | :x:                |

## Reporting a Vulnerability

We take security issues seriously. Thank you for improving the security of Safe Load Lab!

### Reporting Methods

- **Public Repository:** Open a security issue in the [Issues](https://github.com/YOUR_USERNAME/safe-load-lab/issues) section. Please include as much detail as possible without disclosing the vulnerability publicly.

- **Private Reporting (Optional):** For sensitive vulnerabilities, you can also contact the maintainers directly at [INSERT EMAIL IF DESIRED].

### What to Include

When reporting a vulnerability, please include:

1. Type of vulnerability (e.g., DoS, authentication bypass, information disclosure)
2. Full path of affected file(s)
3. Step-by-step instructions to reproduce
4. Impact of the vulnerability
5. Any potential mitigations

### Response Process

1. We will acknowledge your report within 48 hours
2. We will provide a more detailed response within 72 hours
3. We will keep you informed of progress
4. We aim to resolve critical issues within 14 days
5. We will credit you (with your permission) in the release notes

## Security Features

Safe Load Lab includes several built-in safety controls:

- Maximum duration: 600 seconds
- Maximum concurrency: 100
- Maximum RPS: 200
- Maximum body size: 1 MB
- Required `--i-own-this-target` confirmation flag for `run` and `rate-limit` commands
- Reports do not store request headers or bodies by default

## Best Practices for Safe Testing

1. Test only systems you own or have explicit written permission to test
2. Start with small loads and gradually increase
3. Monitor your infrastructure during tests
4. Test in staging environments first
5. Avoid testing paid/third-party APIs without permission
6. Schedule production tests during maintenance windows
7. Notify your hosting provider for large-scale production tests

## Known Limitations

- Safe Load Lab is designed for single-user, controlled testing scenarios
- Not suitable for distributed, large-scale attack simulations
- Not a replacement for professional security audits or penetration testing tools

## Change Log

### 2026-06-09 - Initial Security Policy

- Established reporting process
- Documented built-in safety controls
- Published best practices for safe testing