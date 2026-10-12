'use strict';

/**
 * Release Console - a small web service whose job is to make every
 * deployment visible. It reports which build is running, how healthy it is,
 * and the history of deployments written by scripts/deploy.sh.
 *
 * Zero runtime dependencies on purpose: the pipeline stays fast and the
 * container image stays small.
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function readConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    environment: env.APP_ENV || 'development',
    buildNumber: env.BUILD_NUMBER || 'local',
    gitCommit: env.GIT_COMMIT || 'unknown',
    gitBranch: env.GIT_BRANCH || 'unknown',
    buildTime: env.BUILD_TIME || null,
    deploymentsFile: env.DEPLOYMENTS_FILE || '/data/deployments.log',
  };
}

function readDeployments(file, limit = 10) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const records = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Ignore a partially written line instead of failing the whole page.
    }
  }
  return records.slice(-limit).reverse();
}

function createServer(config = readConfig()) {
  const startedAt = Date.now();
  const stats = { requests: 0, errors: 0 };

  function log(entry) {
    process.stdout.write(JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n');
  }

  function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': MIME['.json'],
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
    });
    res.end(payload);
  }

  function serveStatic(req, res, pathname) {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.normalize(path.join(PUBLIC_DIR, relative));

    // Block path traversal: the resolved path must stay inside public/.
    if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
      return sendJson(res, 403, { error: 'forbidden' });
    }

    fs.readFile(target, (err, data) => {
      if (err) return sendJson(res, 404, { error: 'not found' });
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    const began = process.hrtime.bigint();
    stats.requests += 1;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');

    res.on('finish', () => {
      if (res.statusCode >= 500) stats.errors += 1;
      if (req.url !== '/health') {
        log({
          level: 'info',
          method: req.method,
          path: req.url,
          status: res.statusCode,
          ms: Number(process.hrtime.bigint() - began) / 1e6,
        });
      }
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    const { pathname } = new URL(req.url, 'http://localhost');

    switch (pathname) {
      case '/health':
        return sendJson(res, 200, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });

      case '/api/info':
        return sendJson(res, 200, {
          service: 'release-console',
          environment: config.environment,
          buildNumber: config.buildNumber,
          gitCommit: config.gitCommit,
          gitBranch: config.gitBranch,
          buildTime: config.buildTime,
          hostname: os.hostname(),
          nodeVersion: process.version,
          startedAt: new Date(startedAt).toISOString(),
        });

      case '/api/metrics': {
        const mem = process.memoryUsage();
        return sendJson(res, 200, {
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          requests: stats.requests,
          errors: stats.errors,
          memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
          loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100),
        });
      }

      case '/api/deployments':
        return sendJson(res, 200, { deployments: readDeployments(config.deploymentsFile) });

      default:
        return serveStatic(req, res, pathname);
    }
  });

  return server;
}

function start() {
  const config = readConfig();

  // Lets you rehearse a bad release: the smoke test runs without the server's app.env,
  // so it passes, while the real deployment (which loads app.env) fails and rolls back.
  if (process.env.SIMULATE_STARTUP_FAILURE === 'true') {
    process.stderr.write(JSON.stringify({ level: 'error', message: 'SIMULATE_STARTUP_FAILURE is set, exiting' }) + '\n');
    process.exit(1);
  }
  const server = createServer(config);

  server.listen(config.port, '0.0.0.0', () => {
    process.stdout.write(
      JSON.stringify({
        time: new Date().toISOString(),
        level: 'info',
        message: 'release-console started',
        port: config.port,
        environment: config.environment,
        build: config.buildNumber,
        commit: config.gitCommit,
      }) + '\n'
    );
  });

  // Docker sends SIGTERM on `docker stop`; close cleanly so no request is cut off.
  const shutdown = (signal) => {
    process.stdout.write(JSON.stringify({ level: 'info', message: `received ${signal}, shutting down` }) + '\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) start();

module.exports = { createServer, readConfig, readDeployments };
