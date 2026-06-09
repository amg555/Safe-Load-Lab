#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const VERSION = '1.2.0';
const HARD_LIMITS = {
  maxDurationSeconds: 600,
  maxConcurrency: 100,
  maxRps: 200,
  maxBodyBytes: 1024 * 1024
};

function printHelp() {
  console.log(`
Safe Load Lab v${VERSION}
Controlled load testing for systems you own or have permission to test.

Usage:
  safe-load-lab run --config <file> --i-own-this-target
  sll run --url <url> --duration 60 --concurrency 10 --rps 20 --i-own-this-target

Commands:
  run        Run a controlled load test
  validate   Validate and normalize a config without sending traffic
  plan       Show resolved test plan without sending traffic
  sample     Create a sample config file
  rate-limit Safe rate-limit verification for owned endpoints
  version    Show version
  help       Show help

Required safety flag for run/rate-limit:
  --i-own-this-target       Confirms you own or have explicit permission to test the target

Common options:
  --config <file>           JSON config file
  --url <url>               Target URL for simple one-endpoint test
  --method <GET|POST|...>   HTTP method, default GET
  --body <json/string>      Request body for simple test
  --header "K: V"           Header, repeatable
  --duration <seconds>      Test duration, max ${HARD_LIMITS.maxDurationSeconds}, default 30
  --concurrency <number>    Max concurrent workers, max ${HARD_LIMITS.maxConcurrency}, default 5
  --rps <number>            Max requests per second, max ${HARD_LIMITS.maxRps}, default 10
  --timeout <ms>            Request timeout, default 10000
  --out <file>              Save JSON report, default reports/report-<timestamp>.json
  --csv <file>              Save per-request CSV
  --html <file>             Save standalone HTML report
  --junit <file>            Save JUnit XML summary for CI
  --env <name>              Use config environment profile

Examples:
  sll sample --out load-test.json
  sll validate --config load-test.json --env staging
  sll plan --config load-test.json --env staging
  sll run --config load-test.json --env staging --i-own-this-target
  sll run --url http://localhost:3000/api/health --duration 30 --concurrency 5 --rps 10 --i-own-this-target
  sll rate-limit --url http://localhost:3000/api/login --method POST --rps 10 --duration 20 --i-own-this-target

Notes:
  - This is not a DDoS tool.
  - Start small, monitor your app, and increase gradually.
  - Do not test third-party systems without written permission.
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) { args._.push(item); continue; }
    const key = item.slice(2);
    if (key === 'i-own-this-target') { args[key] = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) { args[key] = true; continue; }
    i++;
    if (key === 'header') { args.header = args.header || []; args.header.push(value); }
    else args[key] = value;
  }
  return args;
}

function clampNumber(value, fallback, min, max, name) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a valid number`);
  if (n < min) throw new Error(`${name} must be >= ${min}`);
  if (n > max) {
    console.warn(`Warning: ${name} capped from ${n} to safe hard limit ${max}`);
    return max;
  }
  return n;
}

function parseHeaders(headerList = []) {
  const headers = {};
  for (const h of headerList) {
    const idx = h.indexOf(':');
    if (idx === -1) throw new Error(`Invalid header format: ${h}. Use "Key: Value"`);
    headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  }
  return headers;
}


function getByPath(obj, dottedPath) {
  if (!dottedPath) return undefined;
  return String(dottedPath).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], obj);
}

function setByPath(obj, dottedPath, value) {
  const parts = String(dottedPath).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ||= {};
    cur = cur[parts[i]];
  }
  cur[parts.at(-1)] = value;
}

function renderTemplate(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([\w.:-]+)\s*\}\}/g, (_, key) => {
      const v = getByPath(vars, key);
      return v == null ? '' : String(v);
    });
  }
  if (Array.isArray(value)) return value.map(v => renderTemplate(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderTemplate(v, vars)]));
  }
  return value;
}

function mergeDeep(base, override) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = mergeDeep(out[k], v);
    else out[k] = v;
  }
  return out;
}

function normalizeEndpoint(ep, idx, vars) {
  ep = renderTemplate(ep, vars);
  if (ep.graphql) {
    ep.method ||= 'POST';
    ep.headers = { 'Content-Type': 'application/json', ...(ep.headers || {}) };
    ep.body = JSON.stringify({ query: ep.graphql.query, variables: ep.graphql.variables || {} });
  }
  if (!ep.url) throw new Error(`Endpoint #${idx + 1} missing url`);
  const u = new URL(ep.url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`Endpoint #${idx + 1} must use http or https`);
  const method = String(ep.method || 'GET').toUpperCase();
  let body = ep.body;
  if (body && typeof body !== 'string') body = JSON.stringify(body);
  if (body && Buffer.byteLength(body) > HARD_LIMITS.maxBodyBytes) throw new Error(`Endpoint #${idx + 1} body exceeds ${HARD_LIMITS.maxBodyBytes} bytes`);
  return { name: ep.name || `${method} ${u.pathname}`, url: ep.url, method, headers: ep.headers || {}, body, weight: Number(ep.weight || 1), expectStatus: ep.expectStatus };
}

function normalizeStage(stage, idx) {
  return {
    name: stage.name || `stage-${idx + 1}`,
    durationSeconds: clampNumber(stage.durationSeconds ?? stage.duration, 30, 1, HARD_LIMITS.maxDurationSeconds, `stages[${idx}].durationSeconds`),
    concurrency: clampNumber(stage.concurrency, 5, 1, HARD_LIMITS.maxConcurrency, `stages[${idx}].concurrency`),
    rps: clampNumber(stage.rps, 10, 1, HARD_LIMITS.maxRps, `stages[${idx}].rps`)
  };
}

function normalizeStages(config) {
  const stages = Array.isArray(config.stages) && config.stages.length
    ? config.stages.map(normalizeStage)
    : [normalizeStage({ name: 'steady', durationSeconds: config.durationSeconds, concurrency: config.concurrency, rps: config.rps }, 0)];
  const totalDuration = stages.reduce((sum, stage) => sum + stage.durationSeconds, 0);
  if (totalDuration > HARD_LIMITS.maxDurationSeconds) throw new Error(`Total staged duration ${totalDuration}s exceeds safe hard limit ${HARD_LIMITS.maxDurationSeconds}s`);
  return stages;
}

function applyCliOverrides(config, args) {
  const loadShapeOverridden = args.duration !== undefined || args.concurrency !== undefined || args.rps !== undefined;
  if (loadShapeOverridden) config.stages = undefined;
  if (args.duration !== undefined) config.durationSeconds = args.duration;
  if (args.concurrency !== undefined) config.concurrency = args.concurrency;
  if (args.rps !== undefined) config.rps = args.rps;
  if (args.timeout !== undefined) config.timeoutMs = args.timeout;
  return config;
}

function normalizeConfig(args) {
  let config = {};
  if (args.config) config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
  else {
    if (!args.url) throw new Error('Provide --config <file> or --url <url>');
    config = {
      name: 'simple-test',
      durationSeconds: args.duration,
      concurrency: args.concurrency,
      rps: args.rps,
      timeoutMs: args.timeout,
      endpoints: [{ name: 'default', url: args.url, method: args.method || 'GET', headers: parseHeaders(args.header), body: args.body, weight: 1 }]
    };
  }

  const envName = args.env || config.defaultEnv;
  if (envName) {
    if (!config.environments?.[envName]) throw new Error(`Environment profile not found: ${envName}`);
    config = mergeDeep(config, config.environments[envName]);
    config.activeEnv = envName;
  }

  // CLI values override both base config and selected environment profile.
  config = applyCliOverrides(config, args);

  const stages = normalizeStages(config);
  const durationSeconds = stages.reduce((sum, stage) => sum + stage.durationSeconds, 0);
  const maxConcurrency = Math.max(...stages.map(s => s.concurrency));
  const maxRps = Math.max(...stages.map(s => s.rps));
  const vars = { ...(config.variables || {}), env: envName || '', ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) };

  const normalized = {
    name: config.name || 'safe-load-test',
    activeEnv: config.activeEnv || envName || null,
    variables: vars,
    setup: config.setup || [],
    stages,
    durationSeconds,
    concurrency: maxConcurrency,
    rps: maxRps,
    timeoutMs: clampNumber(config.timeoutMs, 10000, 100, 120000, 'timeoutMs'),
    endpoints: config.endpoints || [],
    endpointTemplates: config.endpoints || [],
    thresholds: config.thresholds || {}
  };

  if (!Array.isArray(normalized.endpoints) || normalized.endpoints.length === 0) throw new Error('Config must contain at least one endpoint');
  normalized.endpoints = normalized.endpoints.map((ep, idx) => normalizeEndpoint(ep, idx, normalized.variables));
  normalized.setup = normalized.setup.map((ep, idx) => ({ ...normalizeEndpoint(ep, idx, normalized.variables), extract: ep.extract || {} }));
  return normalized;
}

function pickEndpoint(endpoints) {
  const total = endpoints.reduce((sum, ep) => sum + Math.max(0, ep.weight), 0);
  let r = Math.random() * total;
  for (const ep of endpoints) { r -= Math.max(0, ep.weight); if (r <= 0) return ep; }
  return endpoints[0];
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function evaluateThresholds(thresholds, metrics) {
  const checks = {};
  if (thresholds.maxErrorRate !== undefined) checks.maxErrorRate = { pass: metrics.errorRate <= Number(thresholds.maxErrorRate), actual: metrics.errorRate, expected: `<= ${thresholds.maxErrorRate}` };
  if (thresholds.p95Ms !== undefined) checks.p95Ms = { pass: metrics.p95 <= Number(thresholds.p95Ms), actual: metrics.p95, expected: `<= ${thresholds.p95Ms}ms` };
  if (thresholds.p99Ms !== undefined) checks.p99Ms = { pass: metrics.p99 <= Number(thresholds.p99Ms), actual: metrics.p99, expected: `<= ${thresholds.p99Ms}ms` };
  return checks;
}

function summarize(results, startedAt, finishedAt, config) {
  const durations = results.map(r => r.durationMs).filter(Number.isFinite);
  const total = results.length;
  const failed = results.filter(r => r.error || r.status >= 400 || r.status === 0).length;
  const byStatus = {};
  const byEndpoint = {};
  for (const r of results) {
    byStatus[r.status || 'error'] = (byStatus[r.status || 'error'] || 0) + 1;
    byEndpoint[r.endpoint] ||= { total: 0, failed: 0, durations: [] };
    byEndpoint[r.endpoint].total++;
    if (r.error || r.status >= 400 || r.status === 0) byEndpoint[r.endpoint].failed++;
    if (Number.isFinite(r.durationMs)) byEndpoint[r.endpoint].durations.push(r.durationMs);
  }
  const endpointSummary = {};
  for (const [name, data] of Object.entries(byEndpoint)) {
    endpointSummary[name] = {
      total: data.total,
      failed: data.failed,
      errorRate: data.total ? data.failed / data.total : 0,
      avgMs: data.durations.length ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length : 0,
      p95Ms: percentile(data.durations, 95),
      p99Ms: percentile(data.durations, 99)
    };
  }
  const elapsedSeconds = (finishedAt - startedAt) / 1000;
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const metrics = { errorRate: total ? failed / total : 0, p95: percentile(durations, 95), p99: percentile(durations, 99), avg };
  return {
    testName: config.name,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    elapsedSeconds,
    requested: { durationSeconds: config.durationSeconds, concurrency: config.concurrency, rps: config.rps, stages: config.stages },
    totals: { requests: total, failed, errorRate: metrics.errorRate, achievedRps: elapsedSeconds > 0 ? total / elapsedSeconds : 0 },
    latencyMs: { avg, min: durations.length ? Math.min(...durations) : 0, max: durations.length ? Math.max(...durations) : 0, p50: percentile(durations, 50), p90: percentile(durations, 90), p95: metrics.p95, p99: metrics.p99 },
    byStatus,
    byEndpoint: endpointSummary,
    thresholds: evaluateThresholds(config.thresholds || {}, metrics)
  };
}

async function doRequest(ep, timeoutMs, captureBody = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(ep.url, { method: ep.method, headers: ep.headers, body: ['GET', 'HEAD'].includes(ep.method) ? undefined : ep.body, redirect: 'manual', signal: controller.signal });
    const text = captureBody ? await res.text().catch(() => '') : await res.arrayBuffer().then(() => '').catch(() => '');
    return { endpoint: ep.name, method: ep.method, url: ep.url, status: res.status, durationMs: performance.now() - start, error: null, timestamp: new Date().toISOString(), body: text };
  } catch (err) {
    return { endpoint: ep.name, method: ep.method, url: ep.url, status: 0, durationMs: performance.now() - start, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err), timestamp: new Date().toISOString(), body: '' };
  } finally { clearTimeout(timeout); }
}

async function runSetup(config) {
  if (!config.setup?.length) return;
  console.log(`Running ${config.setup.length} setup step(s)...`);
  for (const [i, step] of config.setup.entries()) {
    const rendered = normalizeEndpoint(step, i, config.variables);
    const res = await doRequest(rendered, config.timeoutMs, true);
    const okStatuses = Array.isArray(step.expectStatus) ? step.expectStatus : [step.expectStatus || 200];
    if (res.error || !okStatuses.includes(res.status)) throw new Error(`Setup step failed: ${step.name} status=${res.status} error=${res.error || 'none'}`);
    let json = undefined;
    try { json = res.body ? JSON.parse(res.body) : undefined; } catch {}
    for (const [varName, sourcePath] of Object.entries(step.extract || {})) {
      const value = sourcePath.startsWith('body.') ? getByPath(json, sourcePath.slice(5)) : getByPath(json, sourcePath);
      if (value == null) throw new Error(`Setup extraction failed for ${varName} from ${sourcePath}`);
      setByPath(config.variables, varName, value);
    }
  }
  config.endpoints = config.endpointTemplates.map((ep, idx) => normalizeEndpoint(ep, idx, config.variables));
}

function stageAtElapsed(config, elapsedSeconds) {
  let cursor = 0;
  for (const stage of config.stages) {
    cursor += stage.durationSeconds;
    if (elapsedSeconds < cursor) return stage;
  }
  return config.stages.at(-1);
}

async function runTest(config) {
  const results = [];
  let active = 0, launched = 0, stopped = false;
  await runSetup(config);
  const startedAt = Date.now();
  const stopAt = startedAt + config.durationSeconds * 1000;
  console.log(`\nStarting: ${config.name}${config.activeEnv ? ' [' + config.activeEnv + ']' : ''}`);
  console.log(`Duration: ${config.durationSeconds}s | Max concurrency: ${config.concurrency} | Max RPS cap: ${config.rps}`);
  if (config.stages.length > 1) console.log('Stages:', config.stages.map(s => `${s.name}:${s.durationSeconds}s/${s.concurrency}c/${s.rps}rps`).join(' -> '));
  console.log('Press Ctrl+C to stop early.\n');
  process.on('SIGINT', () => { stopped = true; console.log('\nStopping gracefully...'); });
  let lastProgress = Date.now();
  while (!stopped && Date.now() < stopAt) {
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const stage = stageAtElapsed(config, elapsedSeconds);
    if (active < stage.concurrency) {
      const ep = pickEndpoint(config.endpoints);
      active++; launched++;
      doRequest(ep, config.timeoutMs).then(r => results.push(r)).finally(() => active--);
    }
    const now = Date.now();
    if (now - lastProgress >= 2000) {
      const failed = results.filter(r => r.error || r.status >= 400 || r.status === 0).length;
      process.stdout.write(`\rStage: ${stage.name} | launched: ${launched} | completed: ${results.length} | active: ${active} | failed: ${failed}`);
      lastProgress = now;
    }
    await new Promise(resolve => setTimeout(resolve, 1000 / stage.rps));
  }
  while (active > 0) await new Promise(resolve => setTimeout(resolve, 50));
  const finishedAt = Date.now();
  console.log('\n\nTest finished.');
  return { summary: summarize(results, startedAt, finishedAt, config), results };
}

function ensureDirFor(filePath) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
function writeCsv(filePath, results) {
  ensureDirFor(filePath);
  const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = [['timestamp', 'endpoint', 'method', 'url', 'status', 'durationMs', 'error'].map(esc).join(','), ...results.map(r => [r.timestamp, r.endpoint, r.method, r.url, r.status, r.durationMs.toFixed(2), r.error || ''].map(esc).join(','))];
  fs.writeFileSync(filePath, rows.join('\n'));
}


function htmlEscape(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function writeHtmlReport(filePath, summary, results) {
  ensureDirFor(filePath);
  const statusRows = Object.entries(summary.byStatus).map(([k, v]) => `<tr><td>${htmlEscape(k)}</td><td>${v}</td></tr>`).join('');
  const endpointRows = Object.entries(summary.byEndpoint).map(([name, e]) => `<tr><td>${htmlEscape(name)}</td><td>${e.total}</td><td>${e.failed}</td><td>${(e.errorRate*100).toFixed(2)}%</td><td>${e.avgMs.toFixed(2)}</td><td>${e.p95Ms.toFixed(2)}</td><td>${e.p99Ms.toFixed(2)}</td></tr>`).join('');
  const thresholdRows = Object.entries(summary.thresholds || {}).map(([name, t]) => `<tr><td>${htmlEscape(name)}</td><td class="${t.pass ? 'pass' : 'fail'}">${t.pass ? 'PASS' : 'FAIL'}</td><td>${htmlEscape(t.actual)}</td><td>${htmlEscape(t.expected)}</td></tr>`).join('') || '<tr><td colspan="4">No thresholds configured</td></tr>';
  const recentRows = results.slice(-100).reverse().map(r => `<tr><td>${htmlEscape(r.timestamp)}</td><td>${htmlEscape(r.endpoint)}</td><td>${r.status}</td><td>${r.durationMs.toFixed(2)}</td><td>${htmlEscape(r.error || '')}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Safe Load Lab Report</title><style>
    body{font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#0f172a;color:#e5e7eb}main{max-width:1100px;margin:0 auto;padding:32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}.card{background:#111827;border:1px solid #334155;border-radius:14px;padding:18px;box-shadow:0 8px 24px #0004}.metric{font-size:28px;font-weight:800;color:#93c5fd}.label{color:#94a3b8;font-size:13px}table{width:100%;border-collapse:collapse;margin:16px 0;background:#111827;border-radius:12px;overflow:hidden}th,td{padding:10px 12px;border-bottom:1px solid #334155;text-align:left}th{background:#1e293b;color:#bfdbfe}.pass{color:#86efac;font-weight:800}.fail{color:#fca5a5;font-weight:800}h1,h2{color:white}.muted{color:#94a3b8}</style></head><body><main>
    <h1>Safe Load Lab Report</h1><p class="muted">${htmlEscape(summary.testName)} | ${htmlEscape(summary.startedAt)} → ${htmlEscape(summary.finishedAt)}</p>
    <section class="grid"><div class="card"><div class="metric">${summary.totals.requests}</div><div class="label">Requests</div></div><div class="card"><div class="metric">${summary.totals.failed}</div><div class="label">Failed</div></div><div class="card"><div class="metric">${(summary.totals.errorRate*100).toFixed(2)}%</div><div class="label">Error Rate</div></div><div class="card"><div class="metric">${summary.totals.achievedRps.toFixed(2)}</div><div class="label">Achieved RPS</div></div><div class="card"><div class="metric">${summary.latencyMs.p95.toFixed(1)}ms</div><div class="label">p95 Latency</div></div><div class="card"><div class="metric">${summary.latencyMs.p99.toFixed(1)}ms</div><div class="label">p99 Latency</div></div></section>
    <h2>Thresholds</h2><table><thead><tr><th>Name</th><th>Result</th><th>Actual</th><th>Expected</th></tr></thead><tbody>${thresholdRows}</tbody></table>
    <h2>Endpoints</h2><table><thead><tr><th>Endpoint</th><th>Total</th><th>Failed</th><th>Error Rate</th><th>Avg ms</th><th>p95 ms</th><th>p99 ms</th></tr></thead><tbody>${endpointRows}</tbody></table>
    <h2>Status Codes</h2><table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>${statusRows}</tbody></table>
    <h2>Recent Requests</h2><table><thead><tr><th>Time</th><th>Endpoint</th><th>Status</th><th>Duration ms</th><th>Error</th></tr></thead><tbody>${recentRows}</tbody></table>
    </main></body></html>`;
  fs.writeFileSync(filePath, html);
}

async function runRateLimitCheck(args) {
  if (!args.url) throw new Error('rate-limit requires --url');
  const config = normalizeConfig({ ...args, _: ['run'], duration: args.duration || 20, concurrency: args.concurrency || 5, rps: Math.min(Number(args.rps || 10), 50) });
  config.name = 'safe-rate-limit-verification';
  config.thresholds = {};
  const { summary, results } = await runTest(config);
  const limited = results.filter(r => [429, 403].includes(r.status)).length;
  printSummary(summary);
  console.log(`\nRate-limit signals: ${limited} response(s) with HTTP 429/403`);
  console.log(limited > 0 ? 'Result: likely rate limiting is active.' : 'Result: no rate-limit response detected at this safe test level.');
  const defaultOut = `reports/rate-limit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const out = args.out || defaultOut;
  ensureDirFor(out); fs.writeFileSync(out, JSON.stringify({ summary, results, rateLimitSignals: limited }, null, 2));
  if (args.html) { writeHtmlReport(args.html, summary, results); console.log(`HTML report saved: ${args.html}`); }
  if (args.junit) { writeJunitReport(args.junit, summary); console.log(`JUnit report saved: ${args.junit}`); }
  console.log(`JSON report saved: ${out}`);
}


function writeJunitReport(filePath, summary) {
  ensureDirFor(filePath);
  const checks = Object.entries(summary.thresholds || {});
  const failures = checks.filter(([, check]) => !check.pass);
  const cases = checks.length ? checks.map(([name, check]) => {
    const failure = check.pass ? '' : `<failure message="Threshold failed">actual=${htmlEscape(check.actual)} expected=${htmlEscape(check.expected)}</failure>`;
    return `<testcase classname="SafeLoadLab" name="${htmlEscape(name)}">${failure}</testcase>`;
  }).join('') : `<testcase classname="SafeLoadLab" name="completed" />`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Safe Load Lab" tests="${checks.length || 1}" failures="${failures.length}" time="${summary.elapsedSeconds.toFixed(3)}">${cases}</testsuite>\n`;
  fs.writeFileSync(filePath, xml);
}

function printPlan(config) {
  console.log(`Safe Load Lab plan: ${config.name}${config.activeEnv ? ' [' + config.activeEnv + ']' : ''}`);
  console.log(`Duration: ${config.durationSeconds}s | Max concurrency: ${config.concurrency} | Max RPS: ${config.rps} | Timeout: ${config.timeoutMs}ms`);
  console.log('\nStages:');
  for (const s of config.stages) console.log(`- ${s.name}: ${s.durationSeconds}s, concurrency=${s.concurrency}, rps=${s.rps}`);
  console.log('\nSetup steps:');
  if (!config.setup.length) console.log('- none');
  for (const s of config.setup) console.log(`- ${s.name}: ${s.method} ${s.url}`);
  console.log('\nEndpoints:');
  for (const ep of config.endpoints) console.log(`- ${ep.name}: weight=${ep.weight}, ${ep.method} ${ep.url}`);
  console.log('\nThresholds:', Object.keys(config.thresholds).length ? JSON.stringify(config.thresholds, null, 2) : 'none');
}

function validateConfigCommand(args) {
  const config = normalizeConfig(args);
  console.log('Config is valid.');
  console.log(`Resolved test: ${config.name}`);
  console.log(`Environment: ${config.activeEnv || 'none'}`);
  console.log(`Duration: ${config.durationSeconds}s`);
  console.log(`Stages: ${config.stages.length}`);
  console.log(`Setup steps: ${config.setup.length}`);
  console.log(`Endpoints: ${config.endpoints.length}`);
}

function printSummary(summary) {
  console.log('\nSummary');
  console.log('-------');
  console.log(`Requests:     ${summary.totals.requests}`);
  console.log(`Failed:       ${summary.totals.failed}`);
  console.log(`Error rate:   ${(summary.totals.errorRate * 100).toFixed(2)}%`);
  console.log(`Achieved RPS: ${summary.totals.achievedRps.toFixed(2)}`);
  console.log(`Avg latency:  ${summary.latencyMs.avg.toFixed(2)}ms`);
  console.log(`p95 latency:  ${summary.latencyMs.p95.toFixed(2)}ms`);
  console.log(`p99 latency:  ${summary.latencyMs.p99.toFixed(2)}ms`);
  console.log('Status:', summary.byStatus);
  const thresholdEntries = Object.entries(summary.thresholds || {});
  if (thresholdEntries.length) {
    console.log('\nThresholds');
    for (const [name, check] of thresholdEntries) console.log(`- ${name}: ${check.pass ? 'PASS' : 'FAIL'} actual=${check.actual} expected=${check.expected}`);
  }
}

function createSample(out = 'load-test.json') {
  const sample = {
    name: 'my-app-safe-load-test',
    durationSeconds: 30,
    concurrency: 5,
    rps: 10,
    timeoutMs: 10000,
    thresholds: { maxErrorRate: 0.01, p95Ms: 500, p99Ms: 1000 },
    endpoints: [
      { name: 'health-check', method: 'GET', url: 'http://localhost:3000/api/health', headers: {}, weight: 3 },
      { name: 'list-items', method: 'GET', url: 'http://localhost:3000/api/items', headers: { "Accept": "application/json" }, weight: 1 }
    ]
  };
  fs.writeFileSync(out, JSON.stringify(sample, null, 2));
  console.log(`Created sample config: ${out}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';
  if (command === 'help' || args.help) { printHelp(); return; }
  if (command === 'version' || args.version) { console.log(VERSION); return; }
  if (command === 'sample') { createSample(args.out || 'load-test.json'); return; }
  if (command === 'validate') { validateConfigCommand(args); return; }
  if (command === 'plan') { printPlan(normalizeConfig(args)); return; }
  if (!args['i-own-this-target']) throw new Error('Missing required safety flag: --i-own-this-target');
  if (command === 'rate-limit') { await runRateLimitCheck(args); return; }
  if (command !== 'run') throw new Error(`Unknown command: ${command}`);
  const config = normalizeConfig(args);
  const { summary, results } = await runTest(config);
  printSummary(summary);
  const defaultOut = `reports/report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const out = args.out || defaultOut;
  ensureDirFor(out);
  fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nJSON report saved: ${out}`);
  if (args.csv) { writeCsv(args.csv, results); console.log(`CSV report saved: ${args.csv}`); }
  if (args.html) { writeHtmlReport(args.html, summary, results); console.log(`HTML report saved: ${args.html}`); }
  if (args.junit) { writeJunitReport(args.junit, summary); console.log(`JUnit report saved: ${args.junit}`); }
  if (Object.values(summary.thresholds || {}).some(v => !v.pass)) process.exitCode = 2;
}

main().catch(err => { console.error(`Error: ${err.message}`); process.exit(1); });
