# Changelog

## 2.0.0 - Major Feature Release

### 🚀 New Features
- **Spike Testing** - Test system behavior under sudden traffic spikes
- **Soak Testing** - Sustained load testing for memory leaks and stability
- **Stress Testing** - Gradually increasing load to find breaking points
- **Report Comparison** - Compare two test reports side-by-side with diff analysis
- **Webhook Integration** - Send test results to custom webhooks
- **Slack Integration** - Real-time notifications to Slack channels
- **Realistic Traffic Patterns** - Random request spacing for more realistic testing
- **Verbose Logging** - Detailed logging for debugging

### 🎯 Enhanced Commands
- `sll spike` - Run spike test with baseline → spike → recovery pattern
- `sll soak` - Run sustained load test for extended duration
- `sll stress` - Run gradually increasing load test
- `sll compare <file1> <file2>` - Compare two test reports

### 📊 Enhanced Options
- `--webhook <url>` - Send results to webhook URL
- `--slack <url>` - Send results to Slack webhook
- `--compare <file>` - Compare with previous report
- `--realistic` - Use realistic traffic patterns
- `--verbose` - Enable verbose logging

### ⚡ Performance Improvements
- Optimized request scheduling
- Better memory management for long tests
- Improved error handling

### 📝 Documentation
- Updated README with new features
- Added examples for spike, soak, and stress tests
- Enhanced configuration reference

## 1.2.0

- Added staged ramp testing
- Added `validate` command
- Added `plan` command
- Added `version` command
- Added JUnit XML report output
- Added config schema, smoke tests, security notes, config reference
- Fixed CLI overrides to apply after environment profile selection

## 1.1.0

- Added environment profiles
- Added setup/auth extraction flow
- Added GraphQL support
- Added HTML reports
- Added safe rate-limit verification mode
- Added Dockerfile and GitHub Actions example

## 1.0.0

- Initial controlled load-testing CLI
