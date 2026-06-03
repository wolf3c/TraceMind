const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '../.github/workflows/cloudflare-capture-publish.yml');

function readWorkflow() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('Cloudflare capture workflow is manual-only and release-bound', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:/m);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
  assert.match(workflow, /version:[\s\S]*?required: true/);
  assert.match(workflow, /commit_sha:[\s\S]*?required: true/);
  assert.match(workflow, /package\.json version/);
  assert.match(workflow, /tracemind-release-\$VERSION/);
});

test('Cloudflare capture workflow deploys static assets and verifies publication', () => {
  const workflow = readWorkflow();

  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /npm run build:capture-static -- --source-url "\$SOURCE_URL" --output-dir "\$OUTPUT_DIR"/);
  assert.match(workflow, /wrangler@latest pages deploy "\$OUTPUT_DIR"/);
  assert.match(workflow, /--project-name="\$PROJECT_NAME"/);
  assert.match(workflow, /--branch=main/);
  assert.match(workflow, /--commit-hash="\$COMMIT_SHA"/);
  assert.match(workflow, /npm run check:capture-static-publication/);
});
