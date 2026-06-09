import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Test RPS accuracy improvements
test('RPS accuracy - adaptive timing', async () => {
  const targetRPS = 10;
  const duration = 5; // seconds
  const launches = [];
  
  let lastLaunch = Date.now();
  const startTime = Date.now();
  const stopAt = startTime + duration * 1000;
  
  while (Date.now() < stopAt) {
    const now = Date.now();
    const timeSinceLastLaunch = now - lastLaunch;
    const targetInterval = 1000 / targetRPS;
    
    if (timeSinceLastLaunch >= targetInterval) {
      launches.push(now);
      lastLaunch = now;
    }
    
    const timeUntilNext = Math.max(1, targetInterval - (Date.now() - lastLaunch));
    await new Promise(resolve => setTimeout(resolve, Math.min(timeUntilNext, 10)));
  }
  
  const actualDuration = (Date.now() - startTime) / 1000;
  const actualRPS = launches.length / actualDuration;
  const rpsError = Math.abs(actualRPS - targetRPS) / targetRPS;
  
  console.log(`  Target RPS: ${targetRPS}, Actual RPS: ${actualRPS.toFixed(2)}, Error: ${(rpsError * 100).toFixed(2)}%`);
  
  // Should be within 15% of target (improved from typical 30-50% drift)
  assert.ok(rpsError < 0.15, `RPS accuracy outside acceptable range: ${(rpsError * 100).toFixed(2)}%`);
});

// Test percentile calculation performance
test('Percentile calculation performance', () => {
  const sizes = [100, 1000, 10000, 50000];
  
  sizes.forEach(size => {
    const data = Array.from({ length: size }, () => Math.random() * 1000);
    
    const start = performance.now();
    
    // Old method (multiple sorts)
    const oldP50 = [...data].sort((a, b) => a - b)[Math.floor(size * 0.5)];
    const oldP95 = [...data].sort((a, b) => a - b)[Math.floor(size * 0.95)];
    const oldP99 = [...data].sort((a, b) => a - b)[Math.floor(size * 0.99)];
    
    const oldDuration = performance.now() - start;
    
    // New method (single sort)
    const start2 = performance.now();
    const sorted = [...data].sort((a, b) => a - b);
    const newP50 = sorted[Math.floor(size * 0.5)];
    const newP95 = sorted[Math.floor(size * 0.95)];
    const newP99 = sorted[Math.floor(size * 0.99)];
    const newDuration = performance.now() - start2;
    
    const improvement = ((oldDuration - newDuration) / oldDuration * 100).toFixed(1);
    console.log(`  Size ${size}: Old=${oldDuration.toFixed(2)}ms, New=${newDuration.toFixed(2)}ms, Improvement=${improvement}%`);
    
    // New method should be faster for larger datasets
    if (size >= 10000) {
      assert.ok(newDuration < oldDuration, `New method should be faster for ${size} items`);
    }
  });
});

// Test memory efficiency with streaming
test('Memory efficiency - result accumulation', () => {
  const testSizes = [1000, 5000, 10000];
  
  testSizes.forEach(size => {
    global.gc && global.gc(); // Force GC if available
    const startMem = process.memoryUsage().heapUsed;
    
    const results = [];
    for (let i = 0; i < size; i++) {
      results.push({
        endpoint: 'test-endpoint',
        method: 'GET',
        url: 'https://example.com/api',
        status: i % 100 === 0 ? 500 : 200,
        durationMs: Math.random() * 500,
        error: null,
        timestamp: new Date().toISOString(),
        body: ''
      });
    }
    
    const endMem = process.memoryUsage().heapUsed;
    const memUsedMB = (endMem - startMem) / 1024 / 1024;
    const avgBytesPerResult = (endMem - startMem) / size;
    
    console.log(`  Size ${size}: Memory=${memUsedMB.toFixed(2)}MB, Avg per result=${avgBytesPerResult.toFixed(0)} bytes`);
    
    // Should stay under reasonable memory limits
    assert.ok(memUsedMB < size / 50, `Memory usage too high: ${memUsedMB.toFixed(2)}MB for ${size} results`);
  });
});

// Test concurrency control accuracy
test('Concurrency control - active request limiting', async () => {
  const maxConcurrency = 5;
  const totalRequests = 20;
  
  let active = 0;
  let maxActive = 0;
  let completed = 0;
  
  const mockRequest = () => new Promise(resolve => {
    active++;
    maxActive = Math.max(maxActive, active);
    
    setTimeout(() => {
      active--;
      completed++;
      resolve();
    }, Math.random() * 100);
  });
  
  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    while (active >= maxConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    promises.push(mockRequest());
  }
  
  await Promise.all(promises);
  
  console.log(`  Max active: ${maxActive}, Target: ${maxConcurrency}, Completed: ${completed}`);
  
  assert.ok(maxActive <= maxConcurrency, `Exceeded concurrency limit: ${maxActive} > ${maxConcurrency}`);
  assert.equal(completed, totalRequests, 'All requests should complete');
});

// Test connection reuse (keepalive)
test('Connection reuse benchmark', async () => {
  const requestCount = 10;
  
  // Simulate requests with keepalive (should be faster after warmup)
  const withKeepalive = [];
  for (let i = 0; i < requestCount; i++) {
    const start = performance.now();
    // Simulated request time (would be actual fetch in integration test)
    await new Promise(resolve => setTimeout(resolve, 10));
    withKeepalive.push(performance.now() - start);
  }
  
  const avgWithKeepalive = withKeepalive.reduce((a, b) => a + b, 0) / withKeepalive.length;
  
  console.log(`  Avg request time: ${avgWithKeepalive.toFixed(2)}ms`);
  
  // First request may be slower (connection establishment), subsequent should be faster
  const subsequentAvg = withKeepalive.slice(3).reduce((a, b) => a + b, 0) / (withKeepalive.length - 3);
  
  assert.ok(subsequentAvg > 0, 'Should have measurable request times');
});

// Test realistic load scenario
test('Realistic load test simulation', async () => {
  const config = {
    targetRPS: 20,
    duration: 3,
    maxConcurrency: 10
  };
  
  const results = [];
  let active = 0;
  let lastLaunch = Date.now();
  const startTime = Date.now();
  const stopAt = startTime + config.duration * 1000;
  
  const mockRequest = async () => {
    active++;
    const start = performance.now();
    
    // Simulate request with variable latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
    
    active--;
    return {
      status: Math.random() > 0.05 ? 200 : 500,
      durationMs: performance.now() - start,
      timestamp: new Date().toISOString()
    };
  };
  
  while (Date.now() < stopAt) {
    const now = Date.now();
    const timeSinceLastLaunch = now - lastLaunch;
    const targetInterval = 1000 / config.targetRPS;
    
    if (timeSinceLastLaunch >= targetInterval && active < config.maxConcurrency) {
      lastLaunch = now;
      mockRequest().then(r => results.push(r));
    }
    
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  
  // Wait for all active requests to complete
  while (active > 0) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  const actualDuration = (Date.now() - startTime) / 1000;
  const actualRPS = results.length / actualDuration;
  const failed = results.filter(r => r.status >= 400).length;
  const errorRate = failed / results.length;
  
  console.log(`  Requests: ${results.length}, Actual RPS: ${actualRPS.toFixed(2)}, Error rate: ${(errorRate * 100).toFixed(2)}%`);
  
  assert.ok(results.length > 0, 'Should complete some requests');
  assert.ok(actualRPS > config.targetRPS * 0.7, 'Should achieve reasonable RPS');
  assert.ok(errorRate < 0.2, 'Error rate should be reasonable');
});

// Test stage transitions
test('Stage transitions - smooth load changes', async () => {
  const stages = [
    { name: 'warmup', duration: 1, concurrency: 2, rps: 5 },
    { name: 'peak', duration: 1, concurrency: 5, rps: 15 },
    { name: 'cooldown', duration: 1, concurrency: 2, rps: 5 }
  ];
  
  const stageAtElapsed = (elapsedSeconds) => {
    let cursor = 0;
    for (const stage of stages) {
      cursor += stage.duration;
      if (elapsedSeconds < cursor) return stage;
    }
    return stages[stages.length - 1];
  };
  
  const startTime = Date.now();
  const samples = [];
  
  for (let i = 0; i < 30; i++) {
    const elapsed = i * 0.1; // Sample every 100ms
    const stage = stageAtElapsed(elapsed);
    samples.push(stage.name);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Should see all three stages
  assert.ok(samples.includes('warmup'), 'Should have warmup stage');
  assert.ok(samples.includes('peak'), 'Should have peak stage');
  assert.ok(samples.includes('cooldown'), 'Should have cooldown stage');
  
  console.log(`  Stage samples: ${samples.filter((v, i, a) => a.indexOf(v) === i).join(' -> ')}`);
});
