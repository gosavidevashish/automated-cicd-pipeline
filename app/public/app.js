'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const memorySamples = [];
  const MAX_SAMPLES = 40;

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(url + ' returned ' + res.status);
    return res.json();
  }

  function formatTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + s + 's';
    return s + 's';
  }

  function setStatus(ok) {
    const el = $('status');
    el.className = 'status ' + (ok ? 'up' : 'down');
    $('status-text').textContent = ok ? 'Healthy' : 'Not responding';
  }

  async function loadInfo() {
    const info = await getJson('/api/info');
    $('f-build').textContent = '#' + info.buildNumber;
    $('f-commit').textContent = info.gitCommit.slice(0, 7);
    $('f-branch').textContent = info.gitBranch;
    $('f-env').textContent = info.environment;
    $('f-built').textContent = formatTime(info.buildTime);
    $('f-host').textContent = info.hostname;
    $('f-node').textContent = 'Node ' + info.nodeVersion.replace(/^v/, '');
    $('f-started').textContent = formatTime(info.startedAt);
    $('foot-host').textContent = info.hostname;
  }

  function pad0() { return 16; }

  function drawTrend() {
    const canvas = $('trend');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (memorySamples.length < 2) {
      ctx.fillStyle = '#5b6776';
      ctx.font = '13px "IBM Plex Sans", sans-serif';
      ctx.fillText('Collecting samples...', pad0(), h / 2);
      return;
    }

    const pad = { l: 36, r: 8, t: 10, b: 18 };
    const lo = Math.floor(Math.min(...memorySamples) - 1);
    const hi = Math.ceil(Math.max(...memorySamples) + 1);
    const x = (i) => pad.l + (i / (MAX_SAMPLES - 1)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);

    ctx.strokeStyle = '#dde1e7';
    ctx.fillStyle = '#5b6776';
    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.lineWidth = 1;
    [lo, (lo + hi) / 2, hi].forEach((v) => {
      ctx.beginPath();
      ctx.moveTo(pad.l, y(v));
      ctx.lineTo(w - pad.r, y(v));
      ctx.stroke();
      ctx.fillText(String(Math.round(v)), 6, y(v) + 4);
    });

    ctx.strokeStyle = '#2f5d7c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    memorySamples.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();
  }

  async function loadMetrics() {
    const m = await getJson('/api/metrics');
    $('m-uptime').textContent = formatUptime(m.uptimeSeconds);
    $('m-requests').textContent = m.requests.toLocaleString();
    $('m-errors').textContent = m.errors.toLocaleString();
    $('m-memory').textContent = m.memoryRssMb.toFixed(1) + ' MB';
    memorySamples.push(m.memoryRssMb);
    if (memorySamples.length > MAX_SAMPLES) memorySamples.shift();
    drawTrend();
  }

  const RESULT_LABEL = { succeeded: 'Succeeded', rolled_back: 'Rolled back', failed: 'Failed' };

  async function loadHistory() {
    const { deployments } = await getJson('/api/deployments');
    const body = $('history');
    body.textContent = '';

    if (!deployments.length) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 6;
      cell.className = 'empty';
      cell.textContent = 'No deployments recorded yet. They appear here after the first pipeline run.';
      return;
    }

    deployments.forEach((d) => {
      const row = body.insertRow();
      row.insertCell().textContent = formatTime(d.time);
      row.insertCell().textContent = '#' + d.build;
      const commit = row.insertCell();
      commit.className = 'mono';
      commit.textContent = String(d.commit || '-').slice(0, 7);
      row.insertCell().textContent = d.environment || '-';
      const dur = row.insertCell();
      dur.className = 'num';
      dur.textContent = d.durationSeconds != null ? d.durationSeconds + 's' : '-';
      const result = row.insertCell();
      const badge = document.createElement('span');
      const status = String(d.status || '');
      badge.className = 'badge ' + status;
      badge.textContent = RESULT_LABEL[status] || status;
      result.appendChild(badge);
    });
  }

  async function tick() {
    try {
      await getJson('/health');
      setStatus(true);
      await Promise.all([loadMetrics(), loadHistory()]);
    } catch (err) {
      setStatus(false);
    }
  }

  loadInfo().catch(() => setStatus(false));
  tick();
  setInterval(tick, 3000);
})();
