const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.join(__dirname, '..');
const runtimeLogsUrl = 'https://my.galaxycloud.app/wolf3c/us-east-1/apps/9e6d8a40-b9bf-4857-ad8c-e7687b41c6fd/logs';

test('deploy:logs prints the authenticated Galaxy Runtime Logs URL', () => {
  const result = spawnSync('npm', ['run', 'deploy:logs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  assert.strictEqual(result.status, 0, output);
  assert.match(output, /authenticated Galaxy Dashboard/);
  assert.match(output, new RegExp(runtimeLogsUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('deployment documentation points operators to Galaxy Runtime Logs', () => {
  const deploymentGuide = fs.readFileSync(path.join(root, 'docs/deployment.md'), 'utf8');

  assert.match(deploymentGuide, /authenticated Galaxy Dashboard/);
  assert.match(deploymentGuide, new RegExp(runtimeLogsUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('deploy skill treats deploy:logs as a dashboard navigation helper', () => {
  const deploySkill = fs.readFileSync(path.join(root, '.codex/skills/deploy/SKILL.md'), 'utf8');

  assert.match(deploySkill, /authenticated Galaxy Dashboard Runtime Logs/);
  assert.match(deploySkill, /does not fetch or tail logs in the terminal/);
});
