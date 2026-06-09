const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3001;
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

// List saved configs
app.get('/api/configs', (req, res) => {
  const examplesDir = path.join(__dirname, '..', 'examples');
  try {
    const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.json'));
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// Get config details
app.get('/api/configs/:name', (req, res) => {
  const configPath = path.join(__dirname, '..', 'examples', req.params.name);
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate config
app.post('/api/validate', (req, res) => {
  const config = req.body;
  const configPath = path.join(__dirname, 'temp-config.json');
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    const proc = spawn('sll', ['validate', '--config', configPath]);
    let output = '';
    let error = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    proc.on('close', (code) => {
      fs.unlinkSync(configPath);
      if (code === 0) {
        res.json({ valid: true, message: 'Config is valid' });
      } else {
        res.status(400).json({ valid: false, error: error || output });
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get preview/plan
app.post('/api/plan', (req, res) => {
  const config = req.body;
  const configPath = path.join(__dirname, 'temp-config.json');
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    const proc = spawn('sll', ['plan', '--config', configPath]);
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', () => {
      fs.unlinkSync(configPath);
      res.json({ plan: output });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run test
app.post('/api/run', (req, res) => {
  const { config, reportName } = req.body;
  const configPath = path.join(__dirname, 'temp-config.json');
  const reportPath = path.join(REPORTS_DIR, reportName || 'result');
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    const args = ['run', '--config', configPath, '--i-own-this-target'];
    args.push('--out', `${reportPath}.json`);
    args.push('--html', `${reportPath}.html`);
    args.push('--csv', `${reportPath}.csv`);
    
    const proc = spawn('sll', args);
    let output = '';
    let results = [];
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
      // Try to parse line-by-line output for real-time updates
      res.write(`data: ${JSON.stringify({ type: 'progress', message: data.toString() })}\n\n`);
    });
    
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      fs.unlinkSync(configPath);
      
      if (code === 0) {
        // Read the generated report
        try {
          const report = JSON.parse(fs.readFileSync(`${reportPath}.json`, 'utf8'));
          res.write(`data: ${JSON.stringify({ 
            type: 'complete', 
            success: true, 
            reportName: reportName || 'result',
            summary: {
              totalRequests: report.summary?.totalRequests || 0,
              successCount: report.summary?.successCount || 0,
              failCount: report.summary?.failCount || 0,
              avgLatency: report.summary?.avgLatency || 0,
              p95Latency: report.summary?.p95Latency || 0,
              p99Latency: report.summary?.p99Latency || 0
            }
          })}\n\n`);
        } catch (e) {
          res.write(`data: ${JSON.stringify({ 
            type: 'complete', 
            success: true, 
            reportName: reportName || 'result'
          })}\n\n`);
        }
      } else {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: output 
        })}\n\n`);
      }
      
      res.end();
    });
    
    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get report list
app.get('/api/reports', (req, res) => {
  try {
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f.replace('.json', ''),
        date: fs.statSync(path.join(REPORTS_DIR, f)).mtime
      }))
      .sort((a, b) => b.date - a.date);
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// Get report details
app.get('/api/reports/:name', (req, res) => {
  const reportPath = path.join(REPORTS_DIR, `${req.params.name}.json`);
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✓ Safe Load Lab UI running at http://localhost:${PORT}`);
  console.log(`  Open your browser to get started\n`);
});
