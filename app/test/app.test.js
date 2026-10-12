'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { createServer, readDeployments } = require('../server');

let server;
let base;
let fixture;

before(async () => {
  fixture = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rc-')), 'deployments.log');
  fs.writeFileSync(
    fixture,
    [
      JSON.stringify({ time: '2026-10-01T10:00:00Z', build: '1', status: 'succeeded' }),
      'this line is not json',
      JSON.stringify({ time: '2026-10-02T10:00:00Z', build: '2', status: 'rolled_back' }),
    ].join('\n') + '\n'
  );

  server = createServer({
    port: 0,
    environment: 'test',
    buildNumber: '42',
    gitCommit: 'abc1234',
    gitBranch: 'main',
    buildTime: '2026-10-13T08:00:00Z',
    deploymentsFile: fixture,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /health reports ok', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/info exposes build metadata', async () => {
  const body = await (await fetch(`${base}/api/info`)).json();
  assert.equal(body.buildNumber, '42');
  assert.equal(body.gitCommit, 'abc1234');
  assert.equal(body.environment, 'test');
  assert.ok(body.hostname);
});

test('GET /api/metrics returns numeric runtime figures', async () => {
  const body = await (await fetch(`${base}/api/metrics`)).json();
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.ok(body.requests >= 1);
  assert.ok(body.memoryRssMb > 0);
});

test('GET /api/deployments returns newest first and skips bad lines', async () => {
  const body = await (await fetch(`${base}/api/deployments`)).json();
  assert.equal(body.deployments.length, 2);
  assert.equal(body.deployments[0].build, '2');
});

test('readDeployments returns an empty list when the file is missing', () => {
  assert.deepEqual(readDeployments('/nonexistent/deployments.log'), []);
});

test('GET / serves the console page', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Release Console/);
});

test('unknown paths return 404 JSON', async () => {
  const res = await fetch(`${base}/does-not-exist`);
  assert.equal(res.status, 404);
});

test('path traversal is blocked', async () => {
  // fetch() normalises "..", so send the raw request line ourselves.
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, path: '/../server.js', method: 'GET' },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert.ok(status === 403 || status === 404);
});

test('non-GET methods are rejected', async () => {
  const res = await fetch(`${base}/health`, { method: 'POST' });
  assert.equal(res.status, 405);
});

test('security headers are set', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});
