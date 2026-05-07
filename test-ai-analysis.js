/**
 * Test Script for AI Analysis Pipeline
 *
 * This script tests the full AI analysis pipeline:
 * 1. Modal GPU worker endpoints
 * 2. Netlify functions
 * 3. Environment variable configuration
 *
 * Usage: node test-ai-analysis.js
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.blue}━━━ ${msg} ━━━${colors.reset}\n`),
};

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

/**
 * Make HTTP/HTTPS request
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Test 1: Check required environment variables
 */
async function testEnvironmentVariables() {
  log.section('Test 1: Environment Variables');

  const required = [
    'GPU_WORKER_BASE_URL',
    'GPU_WORKER_TOKEN',
    'STORAGE_BUCKET',
    'STORAGE_ACCESS_KEY',
    'STORAGE_SECRET_KEY',
    'STORAGE_ENDPOINT',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ];

  const optional = [
    'MUSIC_API_KEY',
    'LOGTAIL_TOKEN',
    'SENTRY_DSN',
    'EDGE_HMAC_SECRET',
  ];

  let allRequired = true;

  for (const key of required) {
    const value = process.env[key];
    if (!value || value === 'xxxx' || value === 'your-bucket') {
      log.error(`${key} is not set or has placeholder value`);
      results.failed++;
      allRequired = false;
    } else {
      log.success(`${key} is set`);
      results.passed++;
    }
  }

  for (const key of optional) {
    const value = process.env[key];
    if (!value) {
      log.warn(`${key} is not set (optional)`);
      results.warnings++;
    } else {
      log.success(`${key} is set`);
    }
  }

  if (!allRequired) {
    log.error('Some required environment variables are missing!');
    log.info('Please run setup-ai-analysis.bat or follow AI-ANALYSIS-SETUP.md');
    process.exit(1);
  }

  return allRequired;
}

/**
 * Test 2: Test Modal GPU Worker connectivity
 */
async function testModalWorker() {
  log.section('Test 2: Modal GPU Worker Connectivity');

  const baseUrl = process.env.GPU_WORKER_BASE_URL;
  const token = process.env.GPU_WORKER_TOKEN;

  if (!baseUrl || !token) {
    log.error('GPU_WORKER_BASE_URL or GPU_WORKER_TOKEN not set');
    results.failed++;
    return false;
  }

  // Test /highlights endpoint (will fail with invalid data, but tests auth)
  try {
    log.info(`Testing ${baseUrl}/highlights`);

    const res = await request(`${baseUrl}/highlights`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        assetId: 'test',
        proxyUrl: 'https://example.com/test.mp4', // Invalid URL, but tests auth
      },
    });

    // We expect either 200 (success) or 500 (internal error during processing)
    // But NOT 401/403 (auth errors)
    if (res.status === 401 || res.status === 403) {
      log.error(`Authentication failed: ${res.status} - ${JSON.stringify(res.data)}`);
      log.error('GPU_WORKER_TOKEN mismatch between .env and Modal secret');
      results.failed++;
      return false;
    } else if (res.status === 200 || res.status === 500) {
      log.success('Modal worker is reachable and authentication succeeded');
      results.passed++;
      return true;
    } else {
      log.warn(`Unexpected status: ${res.status}`);
      results.warnings++;
      return true;
    }
  } catch (error) {
    log.error(`Failed to connect to Modal worker: ${error.message}`);
    log.info('Make sure you deployed the worker: modal deploy workers/modal/modal_app.py');
    results.failed++;
    return false;
  }
}

/**
 * Test 3: Test beats endpoint
 */
async function testBeatsEndpoint() {
  log.section('Test 3: Beats Detection Endpoint');

  const baseUrl = process.env.GPU_WORKER_BASE_URL;
  const token = process.env.GPU_WORKER_TOKEN;

  try {
    log.info(`Testing ${baseUrl}/beats`);

    const res = await request(`${baseUrl}/beats`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        trackUrl: 'https://example.com/track.mp3',
      },
    });

    if (res.status === 401 || res.status === 403) {
      log.error(`Authentication failed: ${res.status}`);
      results.failed++;
      return false;
    } else {
      log.success('Beats endpoint is accessible');
      results.passed++;
      return true;
    }
  } catch (error) {
    log.error(`Failed to test beats endpoint: ${error.message}`);
    results.failed++;
    return false;
  }
}

/**
 * Test 4: Test audio-analysis endpoint
 */
async function testAudioAnalysisEndpoint() {
  log.section('Test 4: Audio Analysis Endpoint');

  const baseUrl = process.env.GPU_WORKER_BASE_URL;
  const token = process.env.GPU_WORKER_TOKEN;

  try {
    log.info(`Testing ${baseUrl}/audio-analysis`);

    const res = await request(`${baseUrl}/audio-analysis`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        assetId: 'test',
        proxyUrl: 'https://example.com/test.mp4',
      },
    });

    if (res.status === 401 || res.status === 403) {
      log.error(`Authentication failed: ${res.status}`);
      results.failed++;
      return false;
    } else {
      log.success('Audio analysis endpoint is accessible');
      results.passed++;
      return true;
    }
  } catch (error) {
    log.error(`Failed to test audio analysis endpoint: ${error.message}`);
    results.failed++;
    return false;
  }
}

/**
 * Test 5: Check Netlify deployment (if WEB_ORIGIN is set)
 */
async function testNetlifyDeployment() {
  log.section('Test 5: Netlify Deployment (Optional)');

  const webOrigin = process.env.WEB_ORIGIN;

  if (!webOrigin || webOrigin === 'http://localhost:5173') {
    log.warn('WEB_ORIGIN is set to localhost, skipping Netlify test');
    results.warnings++;
    return true;
  }

  try {
    log.info(`Testing ${webOrigin}`);

    const res = await request(webOrigin);

    if (res.status === 200) {
      log.success('Netlify deployment is accessible');
      results.passed++;
      return true;
    } else {
      log.warn(`Unexpected status: ${res.status}`);
      results.warnings++;
      return true;
    }
  } catch (error) {
    log.error(`Failed to reach Netlify deployment: ${error.message}`);
    results.failed++;
    return false;
  }
}

/**
 * Test 6: Verify Modal secret (requires Modal CLI)
 */
async function testModalSecret() {
  log.section('Test 6: Modal Secret Check');

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    log.info('Checking if Modal secret "hoops-hype-studio" exists');

    const { stdout } = await execAsync('modal secret list');

    if (stdout.includes('hoops-hype-studio')) {
      log.success('Modal secret "hoops-hype-studio" exists');
      results.passed++;
      return true;
    } else {
      log.error('Modal secret "hoops-hype-studio" not found');
      log.info('Run: modal secret create hoops-hype-studio ...');
      results.failed++;
      return false;
    }
  } catch (error) {
    log.warn('Modal CLI not found or not authenticated, skipping secret check');
    log.info('Install Modal CLI: pip install modal');
    log.info('Authenticate: modal token new');
    results.warnings++;
    return true;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   Hoops Hype Studio - AI Analysis Test Suite        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
${colors.reset}`);

  await testEnvironmentVariables();
  await testModalWorker();
  await testBeatsEndpoint();
  await testAudioAnalysisEndpoint();
  await testNetlifyDeployment();
  await testModalSecret();

  // Summary
  log.section('Test Summary');

  console.log(`${colors.green}Passed:${colors.reset}   ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset}   ${results.failed}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings}`);

  console.log('');

  if (results.failed === 0) {
    log.success('All critical tests passed! Your AI analysis should be working.');
    log.info('Next step: Drop a video in your app and check if highlights are detected.');
  } else {
    log.error(`${results.failed} test(s) failed. Please fix the issues above.`);
    log.info('See AI-ANALYSIS-SETUP.md for troubleshooting guide.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log.error(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
