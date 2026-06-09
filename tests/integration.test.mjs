import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'safe-load-lab.js');

function runCLI(args, input = null) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [cli, ...args], { cwd: root });
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

// Mock HTTP server for testing
function createMockServer(port = 3456) {
  return new Promise((resolve) => {
    const requestLog = [];
    
    const server = http.createServer((req, res) => {
      requestLog.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        timestamp: Date.now()
      });
      
      // Simulate different endpoints
      if (req.url === '/fast') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', endpoint: 'fast' }));
      } else if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', endpoint: 'slow' }));
        }, 100);
      } else if (req.url === '/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else if (req.url === '/rate-limit') {
        // Simulate rate limiting after 5 requests
        if (requestLog.filter(r => r.url === '/rate-limit').length > 5) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Too many requests' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', path: req.url }));
      }
    });
    
    server.listen(port, () => {
      resolve({ server, requestLog, port });
    });
  });
}

test('Integration - basic load test with mock server', async () => {
  const { server, requestLog, port } = await createMockServer();
  
  try {
    const result = await runCLI([
      'run',
      '--url', `http://localhost:${port}/fast`,
      '--duration', '3',
      '--concurrency', '2',
      '--rps', '5',
      '--i-own-this-target',
      '--out', path.join(root, 'reports', 'test-integration.json')
    ]);
    
    assert.equal(result.code, 0, `CLI should exit with 0, got ${result.code}\nStderr: ${result.stderr}`);
    assert.match(result.stdout, /Test finished/, 'Should show completion message');
    assert.match(result.stdout, /JSON report saved/, 'Should save report');
    
    // Verify report file exists and is valid
    const reportPath = path.join(root, 'reports', 'test-integration.json');
    assert.ok(fs.existsSync(reportPath), 'Report file should exist');
    
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.ok(report.summary, 'Report should have summary');
    assert.ok(report.summary.totals.requests > 0, 'Should have made requests');
    assert.ok(requestLog.length > 0, 'Mock server should have received requests');
    
    console.log(`  Requests made: ${report.summary.totals.requests}`);
    console.log(`  Server received: ${requestLog.length}`);
    console.log(`  Error rate: ${(report.summary.totals.errorRate * 100).toFixed(2)}%`);
    
    // Cleanup
    fs.unlinkSync(reportPath);
  } finally {
    server.close();
  }
});

test('Integration - multiple endpoints with weights', async () => {
  const { server, requestLog, port } = await createMockServer();
  
  try {
    const configPath = path.join(root, 'test-weighted-config.json');
    const config = {
      name: 'weighted-test',
      durationSeconds: 3,
      concurrency: 3,
      rps: 10,
      endpoints: [
        { name: 'fast', url: `http://localhost:${port}/fast`, method: 'GET', weight: 3 },
        { name: 'slow', url: `http://localhost:${port}/slow`, method: 'GET', weight: 1 }
      ]
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    const result = await runCLI([
      'run',
      '--config', configPath,
      '--i-own-this-target',
      '--out', path.join(root, 'reports', 'test-weighted.json')
    ]);
    
    assert.equal(result.code, 0, 'CLI should exit successfully');
    
    const reportPath = path.join(root, 'reports', 'test-weighted.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    const fastRequests = requestLog.filter(r => r.url === '/fast').length;
    const slowRequests = requestLog.filter(r => r.url === '/slow').length;
    
    console.log(`  Fast endpoint: ${fastRequests} requests`);
    console.log(`  Slow endpoint: ${slowRequests} requests`);
    
    // Fast should be called more due to weight (approximately 3:1 ratio)
    assert.ok(fastRequests > slowRequests, 'Weighted endpoint should be called more');
    
    // Cleanup
    fs.unlinkSync(configPath);
    fs.unlinkSync(reportPath);
  } finally {
    server.close();
  }
});

test('Integration - error handling and thresholds', async () => {
  const { server, requestLog, port } = await createMockServer();
  
  try {
    const configPath = path.join(root, 'test-error-config.json');
    const config = {
      name: 'error-test',
      durationSeconds: 2,
      concurrency: 2,
      rps: 5,
      thresholds: {
        maxErrorRate: 0.1,  // Allow max 10% errors
        p95Ms: 500
      },
      endpoints: [
        { name: 'error', url: `http://localhost:${port}/error`, method: 'GET', weight: 1 }
      ]
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    const result = await runCLI([
      'run',
      '--config', configPath,
      '--i-own-this-target',
      '--out', path.join(root, 'reports', 'test-error.json')
    ]);
    
    // Should exit with code 2 due to threshold failure
    assert.equal(result.code, 2, 'Should exit with code 2 for threshold failures');
    
    const reportPath = path.join(root, 'reports', 'test-error.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    assert.ok(report.summary.totals.errorRate > 0, 'Should have errors');
    assert.ok(report.summary.thresholds.maxErrorRate, 'Should have threshold check');
    assert.equal(report.summary.thresholds.maxErrorRate.pass, false, 'Threshold should fail');
    
    console.log(`  Error rate: ${(report.summary.totals.errorRate * 100).toFixed(2)}%`);
    console.log(`  Threshold passed: ${report.summary.thresholds.maxErrorRate.pass}`);
    
    // Cleanup
    fs.unlinkSync(configPath);
    fs.unlinkSync(reportPath);
  } finally {
    server.close();
  }
});

test('Integration - rate limit detection', async () => {
  const { server, requestLog, port } = await createMockServer();
  
  try {
    const result = await runCLI([
      'rate-limit',
      '--url', `http://localhost:${port}/rate-limit`,
      '--duration', '2',
      '--rps', '10',
      '--i-own-this-target'
    ]);
    
    assert.equal(result.code, 0, 'Rate limit check should complete');
    assert.match(result.stdout, /Rate-limit signals/, 'Should report rate limit signals');
    
    const rateLimitResponses = requestLog.filter(r => r.url === '/rate-limit').length;
    console.log(`  Total requests to rate-limited endpoint: ${rateLimitResponses}`);
    
  } finally {
    server.close();
  }
});

test('Integration - CSV and HTML report generation', async () => {
  const { server, port } = await createMockServer();
  
  try {
    const reportBase = path.join(root, 'reports', 'test-reports');
    
    const result = await runCLI([
      'run',
      '--url', `http://localhost:${port}/fast`,
      '--duration', '2',
      '--concurrency', '2',
      '--rps', '5',
      '--i-own-this-target',
      '--out', `${reportBase}.json`,
      '--csv', `${reportBase}.csv`,
      '--html', `${reportBase}.html`
    ]);
    
    assert.equal(result.code, 0, 'Should complete successfully');
    
    // Check all report files exist
    assert.ok(fs.existsSync(`${reportBase}.json`), 'JSON report should exist');
    assert.ok(fs.existsSync(`${reportBase}.csv`), 'CSV report should exist');
    assert.ok(fs.existsSync(`${reportBase}.html`), 'HTML report should exist');
    
    // Verify CSV format
    const csvContent = fs.readFileSync(`${reportBase}.csv`, 'utf8');
    const csvLines = csvContent.split('\n');
    assert.ok(csvLines.length > 1, 'CSV should have header and data rows');
    assert.match(csvLines[0], /timestamp.*endpoint.*status/, 'CSV should have proper headers');
    
    // Verify HTML format
    const htmlContent = fs.readFileSync(`${reportBase}.html`, 'utf8');
    assert.match(htmlContent, /<!doctype html>/i, 'Should be valid HTML');
    assert.match(htmlContent, /Safe Load Lab Report/, 'Should have report title');
    
    console.log(`  JSON size: ${fs.statSync(`${reportBase}.json`).size} bytes`);
    console.log(`  CSV size: ${fs.statSync(`${reportBase}.csv`).size} bytes`);
    console.log(`  HTML size: ${fs.statSync(`${reportBase}.html`).size} bytes`);
    
    // Cleanup
    fs.unlinkSync(`${reportBase}.json`);
    fs.unlinkSync(`${reportBase}.csv`);
    fs.unlinkSync(`${reportBase}.html`);
  } finally {
    server.close();
  }
});

test('Integration - config validation', async () => {
  const invalidConfig = path.join(root, 'test-invalid-config.json');
  
  // Invalid config - missing endpoints
  fs.writeFileSync(invalidConfig, JSON.stringify({
    name: 'invalid-test',
    durationSeconds: 30,
    endpoints: []
  }));
  
  const result = await runCLI(['validate', '--config', invalidConfig]);
  
  assert.equal(result.code, 1, 'Should fail validation');
  assert.match(result.stderr, /at least one endpoint/, 'Should mention missing endpoints');
  
  // Cleanup
  fs.unlinkSync(invalidConfig);
});

test('Integration - realistic RPS achievement', async () => {
  const { server, requestLog, port } = await createMockServer();
  
  try {
    const targetRPS = 10;
    const duration = 5;
    const startTime = Date.now();
    
    const result = await runCLI([
      'run',
      '--url', `http://localhost:${port}/fast`,
      '--duration', duration.toString(),
      '--concurrency', '5',
      '--rps', targetRPS.toString(),
      '--i-own-this-target',
      '--out', path.join(root, 'reports', 'test-rps-accuracy.json')
    ]);
    
    const endTime = Date.now();
    const actualDuration = (endTime - startTime) / 1000;
    
    assert.equal(result.code, 0, 'Should complete successfully');
    
    const reportPath = path.join(root, 'reports', 'test-rps-accuracy.json');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    const achievedRPS = report.summary.totals.achievedRps;
    const rpsError = Math.abs(achievedRPS - targetRPS) / targetRPS;
    
    console.log(`  Target RPS: ${targetRPS}`);
    console.log(`  Achieved RPS: ${achievedRPS.toFixed(2)}`);
    console.log(`  Error: ${(rpsError * 100).toFixed(2)}%`);
    console.log(`  Total requests: ${report.summary.totals.requests}`);
    
    // With improved timing, should achieve within 20% of target
    assert.ok(rpsError < 0.20, `RPS error ${(rpsError * 100).toFixed(2)}% exceeds 20% threshold`);
    
    // Cleanup
    fs.unlinkSync(reportPath);
  } finally {
    server.close();
  }
});
