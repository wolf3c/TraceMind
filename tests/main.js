import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { buildSemanticEvent, summarizeSemanticEvents } from '../imports/api/semantic';
import {
  CaptureDeliveryReports,
  Developers,
  FeedbackReports,
  PresenceSessions,
  ProductUsageMarkers,
  ProjectDailyReports,
  Projects,
  RawBehaviors,
  SemanticEvents,
  buildEventQuery,
  buildRawBehaviorQuery,
  isSourceBlocked,
  mcpServerNameForProject,
  normalizeCaptureSource,
  normalizeEmail,
  publicPresenceSession,
  publicRawBehavior,
  publicSemanticEvent,
  summarizeBehaviorSources,
  summarizeCaptureDelivery,
  summarizeProjectHealth,
  summarizeProjectHealthFromDailyReports,
  summarizePresenceSessions,
} from '../imports/api/tracemind';
import {
  SDK_RELEASE_MANIFEST,
  latestSdkForSetup,
} from '../imports/api/sdk_release';
import * as TraceMindApi from '../imports/api/tracemind';
import { buildAgentInstallPrompt } from '../imports/ui/agent_setup';
import { resolveConsoleState } from '../imports/ui/console_state';
import {
  mergeProjectIntoDashboard,
  resolveInitialProjectSummaryState,
  resolveSelectedProjectId,
  shouldApplyProjectSummaryResponse,
} from '../imports/ui/project_console_state';
import enMessages from '../imports/ui/i18n/locales/en';
import zhMessages from '../imports/ui/i18n/locales/zh';
import { normalizeLocaleValue, translateMessage } from '../imports/ui/i18n/i18n';

function assertLocalSourceSetup(setup, vendorPath) {
  assert.strictEqual(setup.structuredContent.distributionMode, 'local_source');
  assert.strictEqual(setup.structuredContent.publishStatus, 'not_published');
  assert.strictEqual(setup.structuredContent.sdkSourceRepo, 'https://github.com/wolf3c/TraceMind.git');
  assert.strictEqual(setup.structuredContent.customerVendorPath, vendorPath);
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes('git clone --filter=blob:none --no-checkout https://github.com/wolf3c/TraceMind.git .tracemind-sdk-source')));
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes('git -C .tracemind-sdk-source fetch --depth 1 origin')));
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes('git -C .tracemind-sdk-source checkout --detach FETCH_HEAD')));
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes('contentHash') || step.includes('content hash') || step.includes('source hash mismatch')));
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes(`mkdir -p ${vendorPath}`)));
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes(` ${vendorPath}/`) || step.includes(` ${vendorPath}`)));
  const manifestCommand = setup.structuredContent.installCommands.find((step) => step.includes(`${vendorPath}/.tracemind-sdk.json`));
  assert.ok(manifestCommand?.startsWith('node -e '));
  assert.ok(manifestCommand.includes('fs.writeFileSync'));
  assert.ok(setup.structuredContent.idempotencyChecks.some((check) => check.includes(vendorPath)));
  assert.ok(!JSON.stringify(setup.structuredContent.installCommands).includes('TraceMind SDK distribution'));
  assert.ok(!JSON.stringify(setup.structuredContent.installCommands).includes('Write .tracemind-sdk.json'));
}

function assertLocalJsDependency(setup, vendorPath) {
  assertLocalSourceSetup(setup, vendorPath);
  assert.ok(setup.structuredContent.installCommands.includes(`npm install ./${vendorPath}`));
  assert.ok(setup.structuredContent.installCommands.includes(`pnpm add ./${vendorPath}`));
  assert.ok(setup.structuredContent.installCommands.includes(`yarn add file:./${vendorPath}`));
  assert.ok(setup.structuredContent.installCommands.some((step) => step.includes('do not run npm, pnpm, and yarn together')));
}

function assertRegistrySetup(setup, sdkName, registryType, packageName) {
  const latestSdk = latestSdkForSetup(sdkName);
  assert.ok(latestSdk?.registry, `missing registry metadata for ${sdkName}`);
  assert.strictEqual(setup.structuredContent.distributionMode, 'registry');
  assert.strictEqual(setup.structuredContent.publishStatus, 'published');
  assert.strictEqual(setup.structuredContent.latestSdk.registry.type, registryType);
  assert.strictEqual(setup.structuredContent.latestSdk.registry.packageName, packageName);
  assert.strictEqual(setup.structuredContent.latestSdk.registry.packageVersion, latestSdk.registry.packageVersion);
  assert.strictEqual(setup.structuredContent.registry.packageName, packageName);
  assert.strictEqual(setup.structuredContent.registry.packageVersion, latestSdk.registry.packageVersion);
  assert.ok(setup.structuredContent.localSourceFallback);
  assert.strictEqual(setup.structuredContent.localSourceFallback.distributionMode, 'local_source');
  assert.ok(setup.structuredContent.installedVersionDetection.detectionOrder.some((step) => step.includes('sourceDetails.sdkContentHash')));
  assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes(latestSdk.registry.packageVersion)));
  assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes('verificationCommands')));
}

function assertSdkGovernance(setup, sdkName, vendorPath) {
  const latestSdk = latestSdkForSetup(sdkName);
  assert.ok(latestSdk, `missing latest SDK manifest for ${sdkName}`);
  assert.strictEqual(setup.structuredContent.latestSdk.sdkName, sdkName);
  assert.strictEqual(setup.structuredContent.latestSdk.displayVersion, latestSdk.displayVersion);
  assert.strictEqual(setup.structuredContent.latestSdk.contentHash, latestSdk.contentHash);
  assert.strictEqual(setup.structuredContent.latestSdk.sourceRef, latestSdk.sourceRef);
  assert.match(setup.structuredContent.latestSdk.sourceRef, /^tracemind-release-\d{4}\.\d{1,2}\.\d{1,2}-\d+$/);
  assert.notStrictEqual(setup.structuredContent.latestSdk.sourceRef, 'main');
  assert.deepStrictEqual(setup.structuredContent.latestSdk.verificationCommands, latestSdk.verificationCommands);
  assert.ok(setup.structuredContent.latestSdk.contentHash.startsWith('sha256:'));
  assert.ok(setup.structuredContent.installedVersionDetection.detectionOrder.some((step) => step.includes('contentHash')));
  assert.ok(setup.structuredContent.upgradePolicy.agentPrompt.includes('coding agent'));
  if (setup.structuredContent.distributionMode === 'local_source') {
    assert.ok(setup.structuredContent.installCommands.some((step) => step.includes(latestSdk.sourceRef)));
    assert.ok(setup.structuredContent.installedVersionDetection.manifestPath.includes('.tracemind-sdk.json'));
    assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes('npm run test:sdk-release')));
    assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes(vendorPath)));
    assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes('git -C .tracemind-sdk-source fetch --depth 1 origin')));
    assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes(latestSdk.sourceRef)));
    assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.includes('source hash mismatch')));
    assert.ok(setup.structuredContent.upgradeCommands.some((command) => command.startsWith('node -e ') && command.includes(`${vendorPath}/.tracemind-sdk.json`)));
    assert.strictEqual(setup.structuredContent.installedSdkManifest.sdkName, sdkName);
    assert.strictEqual(setup.structuredContent.installedSdkManifest.contentHash, latestSdk.contentHash);
    assert.strictEqual(setup.structuredContent.installedSdkManifest.vendorPath, vendorPath);
  }
}

describe('TraceMind', function () {
  describe('Coding agent guidance', function () {
    it('builds Chinese install prompts with the current project MCP URL and public guidance links', function () {
      const prompt = buildAgentInstallPrompt({
        locale: 'zh',
        origin: 'https://local.example',
        mcpUrl: 'https://local.example/mcp?mcpToken=tm_mcp_current',
        projectId: 'project-中文-ABC123',
        projectName: '我的 Web App',
        skillUrl: 'https://local.example/agents/tracemind/SKILL.md',
        snippetUrl: 'https://local.example/agents/tracemind/AGENTS_SNIPPET.md',
        manifestUrl: 'https://local.example/agents/tracemind/manifest.json',
      });

      assert.ok(prompt.includes('https://local.example/mcp?mcpToken=tm_mcp_current'));
      assert.ok(prompt.includes('- Name: tracemind-abc123'));
      assert.ok(prompt.includes('- Project label: 我的 Web App'));
      assert.ok(prompt.includes('- Project ID: project-中文-ABC123'));
      assert.ok(prompt.includes('- Expected MCP server: tracemind-abc123'));
      assert.ok(!prompt.includes('tracemind-my-web-app'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/SKILL.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/AGENTS_SNIPPET.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/manifest.json'));
      assert.ok(prompt.includes('不要覆盖已有配置，只能合并或追加'));
      assert.ok(prompt.includes('先确认当前工作目录或仓库就是用户要接入 TraceMind 的目标项目'));
      assert.ok(prompt.includes('请不要创建自定义 skill 目录'));
      assert.ok(prompt.includes('如果已经安装过 TraceMind Skill 或已经追加过 TraceMind rules'));
      assert.ok(prompt.includes('如果项目级 instruction 文件里已经存在不同 Project ID 的 `TraceMind project binding`'));
      assert.ok(prompt.includes('如果已经存在相同 Project ID 的 `TraceMind project binding`'));
      assert.ok(prompt.includes('如果已有同名 MCP server `tracemind-abc123`'));
      assert.ok(prompt.includes('如果已有其他 `tracemind-*` TraceMind MCP server'));
      assert.ok(prompt.includes('如果已有旧的 `tracemind` MCP server'));
      assert.ok(prompt.includes('优先读取 MCP tools/list 的描述或调用 `tracemind.project_info`'));
      assert.ok(prompt.includes('必须使用 MCP server `tracemind-abc123`'));
      assert.ok(prompt.includes('返回的 `projectId` 等于 `project-中文-ABC123`'));
      assert.ok(prompt.includes('安装完成后，优先调用 `tracemind.project_health` 做今日健康检查'));
      assert.ok(prompt.includes('`tracemind.recent_online` 查看实时在线态势'));
      assert.ok(prompt.includes('功能使用分析'));
      assert.ok(prompt.includes('异常或下降原因分析'));
      assert.ok(prompt.includes('不要把 MCP URL、mcpToken 或 Bearer token 写入 AGENTS.md'));
      assert.ok(prompt.includes('通过 `tracemind.capture_setup` 获取 Web Auto Capture 接入脚本'));
      assert.ok(prompt.includes('如果返回 `distributionMode: "local_source"`'));
      assert.ok(!prompt.includes('如果只能使用全局配置，请先告诉我并等待确认'));
      assert.ok(!prompt.includes('pending-global-confirmation'));
      assert.ok(prompt.includes('fallback-installed'));
    });

    it('builds English install prompts for English and unknown locales', function () {
      const prompt = buildAgentInstallPrompt({
        locale: 'en',
        origin: 'https://local.example',
        mcpUrl: 'https://local.example/mcp?mcpToken=tm_mcp_current',
        projectId: 'project-XYZ789',
        projectName: 'Customer Portal',
        skillUrl: 'https://local.example/agents/tracemind/SKILL.md',
        snippetUrl: 'https://local.example/agents/tracemind/AGENTS_SNIPPET.md',
        manifestUrl: 'https://local.example/agents/tracemind/manifest.json',
      });
      const fallbackPrompt = buildAgentInstallPrompt({
        locale: 'fr',
        origin: 'https://local.example',
        mcpUrl: 'https://local.example/mcp?mcpToken=tm_mcp_current',
        projectId: 'project-XYZ789',
        projectName: 'Customer Portal',
      });

      assert.ok(prompt.includes('Install TraceMind coding agent support in the current project.'));
      assert.ok(prompt.includes('- Name: tracemind-xyz789'));
      assert.ok(prompt.includes('- Project label: Customer Portal'));
      assert.ok(prompt.includes('- Project ID: project-XYZ789'));
      assert.ok(prompt.includes('- Expected MCP server: tracemind-xyz789'));
      assert.ok(!prompt.includes('tracemind-customer-portal'));
      assert.ok(prompt.includes('Do not create a custom skill directory'));
      assert.ok(prompt.includes('first confirm that the current working directory or repository is the target project'));
      assert.ok(prompt.includes('If TraceMind Skill or TraceMind rules already exist'));
      assert.ok(prompt.includes('If the project-level instruction file already contains a `TraceMind project binding` with a different Project ID'));
      assert.ok(prompt.includes('If the same Project ID binding already exists'));
      assert.ok(prompt.includes('If an MCP server named `tracemind-xyz789` already exists'));
      assert.ok(prompt.includes('If other `tracemind-*` TraceMind MCP servers exist'));
      assert.ok(prompt.includes('If an old `tracemind` MCP server exists'));
      assert.ok(prompt.includes('Prefer MCP tools/list descriptions or call `tracemind.project_info`'));
      assert.ok(prompt.includes('use MCP server `tracemind-xyz789`'));
      assert.ok(prompt.includes('returned `projectId` is `project-XYZ789`'));
      assert.ok(prompt.includes('After installation, call `tracemind.project_health` first for a daily health check'));
      assert.ok(prompt.includes('`tracemind.recent_online` for real-time online status'));
      assert.ok(prompt.includes('feature usage analysis'));
      assert.ok(prompt.includes('anomaly or drop investigation'));
      assert.ok(prompt.includes('Do not write the MCP URL, mcpToken, or Bearer token into AGENTS.md'));
      assert.ok(prompt.includes('Call `tracemind.capture_setup` to retrieve the Web Auto Capture script'));
      assert.ok(prompt.includes('Use registry install commands when `distributionMode: "registry"`'));
      assert.ok(!prompt.includes('If only global configuration is available, tell me first and wait for confirmation'));
      assert.ok(!prompt.includes('pending-global-confirmation'));
      assert.ok(prompt.includes('fallback-installed'));
      assert.ok(prompt.includes('https://local.example/mcp?mcpToken=tm_mcp_current'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/SKILL.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/AGENTS_SNIPPET.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/manifest.json'));
      assert.strictEqual(fallbackPrompt.includes('Install TraceMind coding agent support in the current project.'), true);
      assert.strictEqual(fallbackPrompt.includes('请帮我在当前项目中安装 TraceMind 的 coding agent 支持。'), false);
    });

    it('builds stable short MCP server names from project ids', function () {
      assert.strictEqual(mcpServerNameForProject({ _id: 'project-中文-ABC123', name: '中文项目' }), 'tracemind-abc123');
      assert.strictEqual(mcpServerNameForProject({ _id: 'tiny' }), 'tracemind-tiny');
      assert.strictEqual(mcpServerNameForProject({ name: 'No id' }), 'tracemind-project');
    });

    it('ships static public guidance without project tokens or hard-coded deployment URLs', async function () {
      const [skill, snippet, manifestResponse] = await Promise.all([
        fetch(Meteor.absoluteUrl('/agents/tracemind/SKILL.md')).then((response) => response.text()),
        fetch(Meteor.absoluteUrl('/agents/tracemind/AGENTS_SNIPPET.md')).then((response) => response.text()),
        fetch(Meteor.absoluteUrl('/agents/tracemind/manifest.json')).then((response) => response.json()),
      ]);
      const manifest = manifestResponse;

      assert.ok(skill.includes('version: 2026.05.17.7'));
      assert.ok(skill.includes('## Auto Capture Setup'));
      assert.ok(skill.includes('## Native SDK Setup Details'));
      assert.ok(skill.includes('## Traffic Attribution'));
      assert.ok(skill.includes('## Platform Loading And Network Restrictions'));
      assert.ok(skill.includes('script-src'));
      assert.ok(skill.includes('NSAppTransportSecurity'));
      assert.ok(skill.includes('network_security_config'));
      assert.ok(skill.includes('egress firewall'));
      assert.ok(skill.includes('## Instrumenting MCP Servers'));
      assert.ok(skill.includes('## Instrumenting Agent Skills'));
      assert.ok(skill.includes('## Instrumenting Server Applications'));
      assert.ok(skill.includes('## Developer Feedback Submission'));
      assert.ok(skill.includes('## End-User Feedback Capture'));
      assert.ok(skill.includes('## Product Behavior Analysis Workflows'));
      assert.ok(skill.includes('tracemind.project_health'));
      assert.ok(skill.includes('tracemind.recent_online'));
      assert.ok(skill.includes('Daily health check'));
      assert.ok(skill.includes('Recent online status'));
      assert.ok(skill.includes('Feature usage analysis'));
      assert.ok(skill.includes('Anomaly or drop investigation'));
      assert.ok(skill.includes('tracemind.submit_feedback'));
      assert.ok(skill.includes('submitFeedback'));
      assert.ok(skill.includes('tracemind.query_user_feedback'));
      assert.ok(skill.includes('tracemind.update_user_feedback'));
      assert.ok(skill.includes('ordinary server applications use manual capture first'));
      assert.ok(skill.includes('static Skill file cannot auto-capture'));
      assert.ok(skill.includes('installCommands'));
      assert.ok(skill.includes('idempotencyChecks'));
      assert.ok(skill.includes('manualCaptureExamples'));
      assert.ok(skill.includes('setAttribution'));
      assert.ok(skill.includes('recordOpenURL'));
      assert.ok(skill.includes('recordDeepLink'));
      assert.ok(skill.includes('{ "platform": "hybrid" }'));
      assert.ok(skill.includes('{ "platform": "mini_program", "provider": "wechat" }'));
      assert.ok(skill.includes('@tracemind/mini-program'));
      assert.ok(skill.includes('{ "platform": "browser_extension" }'));
      assert.ok(skill.includes('@tracemind/browser-extension'));
      assert.ok(skill.includes('local-source GitHub clone'));
      assert.ok(skill.includes('distributionMode` is `registry`'));
      assert.ok(skill.includes('sdkContentHash'));
      assert.ok(skill.includes('latestSdk.sourceRef'));
      assert.ok(skill.includes('tracemind-release-<version>'));
      assert.ok(skill.includes('npm run update:sdk-manifest'));
      assert.ok(skill.includes('npm run prepare:sdk-release-ref -- <version>'));
      assert.ok(skill.includes('npm run check:sdk-registry-publication -- <version>'));
      assert.ok(skill.includes('identifySnippet'));
      assert.ok(skill.includes('tracemind.project_info'));
      assert.ok(snippet.includes('TraceMind Instrumentation Rules'));
      assert.ok(snippet.includes('TraceMind Project Binding'));
      assert.ok(snippet.includes('Expected MCP server'));
      assert.ok(snippet.includes('returned `projectId` matches the Project ID'));
      assert.ok(snippet.includes('Auto Capture before manual custom events'));
      assert.ok(snippet.includes('installCommands'));
      assert.ok(snippet.includes('distributionMode: "registry"'));
      assert.ok(snippet.includes('distributionMode: "local_source"'));
      assert.ok(snippet.includes('sdkContentHash'));
      assert.ok(snippet.includes('latestSdk'));
      assert.ok(snippet.includes('latestSdk.sourceRef'));
      assert.ok(snippet.includes('tracemind-release-<version>'));
      assert.ok(snippet.includes('npm run update:sdk-manifest'));
      assert.ok(snippet.includes('npm run prepare:sdk-release-ref -- <version>'));
      assert.ok(snippet.includes('manualCaptureWorkflow'));
      assert.ok(snippet.includes('supported primitives'));
      assert.ok(snippet.includes('attributionSource'));
      assert.ok(snippet.includes('landingPath'));
      assert.ok(snippet.includes('mcp_node'));
      assert.ok(snippet.includes('hybrid'));
      assert.ok(snippet.includes('mini_program'));
      assert.ok(snippet.includes('browser_extension'));
      assert.ok(snippet.includes('agent_skill'));
      assert.ok(snippet.includes('server_node'));
      assert.ok(snippet.includes('tracemind.project_health'));
      assert.ok(snippet.includes('tracemind.recent_online'));
      assert.ok(snippet.includes('tracemind.submit_feedback'));
      assert.ok(snippet.includes('submitFeedback'));
      assert.ok(snippet.includes('tracemind.query_user_feedback'));
      assert.ok(snippet.includes('tracemind.update_user_feedback'));
      assert.ok(snippet.includes('tracemind.project_info'));
      assert.strictEqual(manifest.guidanceVersion, '2026.05.17.7');
      assert.strictEqual(manifest.resources.skill, '/agents/tracemind/SKILL.md');
      assert.strictEqual(manifest.mcp.serverNamePattern, 'tracemind-<project-code>');
      assert.strictEqual(manifest.mcp.serverName, undefined);
      assert.ok(manifest.mcp.tools.includes('tracemind.project_info'));
      assert.ok(manifest.mcp.tools.includes('tracemind.project_health'));
      assert.ok(manifest.mcp.tools.includes('tracemind.recent_online'));
      assert.ok(manifest.mcp.tools.includes('tracemind.capture_setup'));
      assert.ok(manifest.mcp.tools.includes('tracemind.submit_feedback'));
      assert.ok(manifest.mcp.tools.includes('tracemind.query_user_feedback'));
      assert.ok(manifest.mcp.tools.includes('tracemind.update_user_feedback'));
      assert.ok(manifest.platforms.includes('macos'));
      assert.ok(manifest.platforms.includes('hybrid'));
      assert.ok(manifest.platforms.includes('mini_program'));
      assert.ok(manifest.platforms.includes('browser_extension'));
      assert.ok(manifest.platforms.includes('mcp_node'));
      assert.ok(manifest.platforms.includes('mcp_python'));
      assert.ok(manifest.platforms.includes('agent_skill'));
      assert.ok(manifest.platforms.includes('server_node'));
      assert.ok(manifest.platforms.includes('server_python'));
      assert.ok(manifest.platforms.includes('server_http'));
      assert.ok(manifest.updatePolicy.includes('tracemind.project_info'));
      assert.ok(manifest.updatePolicy.includes('tracemind.project_health'));
      assert.ok(manifest.sdkUpgradePolicy.includes('distributionMode is registry'));
      assert.ok(manifest.sdkUpgradePolicy.includes('sdkContentHash'));
      assert.ok(manifest.sdkUpgradePolicy.includes('latestSdk.sourceRef'));
      assert.ok(manifest.sdkUpgradePolicy.includes('tracemind-release-<version>'));
      [skill, snippet, JSON.stringify(manifest)].forEach((content) => {
        assert.ok(!content.includes('tm_mcp_'));
        assert.ok(!content.includes('tracemind.super-tree.com'));
      });
    });

    it('keeps the SDK release manifest valid through the release gate', async function () {
      if (!Meteor.isServer) return;

      assert.ok(Array.isArray(SDK_RELEASE_MANIFEST.sdks));
      assert.ok(SDK_RELEASE_MANIFEST.sdks.length >= 9);
      SDK_RELEASE_MANIFEST.sdks.forEach((sdk) => {
        assert.ok(sdk.sdkName);
        assert.ok(sdk.displayVersion);
        assert.ok(sdk.contentHash.startsWith('sha256:'));
        assert.ok(sdk.minimumSupportedHash.startsWith('sha256:'));
        assert.ok(sdk.sourceRepo.includes('github.com/wolf3c/TraceMind'));
        assert.match(sdk.sourceRef, /^tracemind-release-\d{4}\.\d{1,2}\.\d{1,2}-\d+$/);
        assert.ok(Array.isArray(sdk.verificationCommands));
        assert.ok(sdk.verificationCommands.length > 0);
        assert.ok(sdk.upgradePolicy.agentPrompt.includes('coding agent'));
        if (sdk.sdkName === 'swift') {
          assert.strictEqual(sdk.distributionMode, 'local_source');
          assert.strictEqual(sdk.publishStatus, 'not_published');
        } else {
          assert.strictEqual(sdk.distributionMode, 'registry');
          assert.strictEqual(sdk.publishStatus, 'published');
          assert.ok(sdk.registry.packageName);
          assert.ok(sdk.registry.packageVersion);
          if (sdk.registry.type === 'pypi') {
            assert.ok(!sdk.registry.packageVersion.includes('-'));
            assert.match(sdk.registry.packageVersion, /\.post\d+$/);
          }
          assert.strictEqual(sdk.registry.contentHash, sdk.contentHash);
          assert.ok(Array.isArray(sdk.registry.installCommands));
          assert.ok(sdk.registry.installCommands.length > 0);
          assert.strictEqual(sdk.localSourceFallback.distributionMode, 'local_source');
          assert.strictEqual(sdk.localSourceFallback.sourceRef, sdk.sourceRef);
        }
      });
    });

    it('serves Web Auto Capture with presence heartbeat support', async function () {
      const { clientScript } = await import('../server/capture_routes');
      const script = clientScript('https://tracemind.example.com');

      assert.ok(script.includes('/api/presence'));
      assert.ok(script.includes('heartbeatIntervalMs = 5000'));
      assert.ok(script.includes('ACTIVE_IDLE_TIMEOUT_MS = 60 * 1000'));
      assert.ok(script.includes("sendPresence('heartbeat')"));
      assert.ok(script.includes("document.addEventListener('visibilitychange'"));
      assert.ok(script.includes("window.addEventListener('blur'"));
      assert.ok(script.includes("window.addEventListener('focus'"));
      assert.ok(script.includes("window.addEventListener('pagehide'"));
      assert.ok(script.includes("stopPresence('end')"));
      const presencePayloadStart = script.indexOf('function buildPresencePayload(state)');
      const presencePayloadEnd = script.indexOf('function sendPresence(state)');
      const presenceScript = script.slice(presencePayloadStart, presencePayloadEnd);
      assert.ok(presenceScript.includes('path: location.pathname,'));
      assert.ok(presenceScript.includes('activeDurationMs: activeDurationMs,'));
      assert.ok(presenceScript.includes('lastActiveAt: lastActiveAt ? new Date(lastActiveAt).toISOString() : undefined,'));
      assert.ok(presenceScript.includes('activeState: activeStartedAt ?'));
      assert.ok(presenceScript.includes('idleTimeoutMs: ACTIVE_IDLE_TIMEOUT_MS,'));
      assert.ok(!presenceScript.includes('location.search'));
    });

    it('serves Web Auto Capture with reliable local queue support', async function () {
      const { clientScript } = await import('../server/capture_routes');
      const script = clientScript('https://tracemind.example.com');

      assert.ok(script.includes('MAX_QUEUE_EVENTS = 300'));
      assert.ok(script.includes('CAPTURE_BATCH_SIZE = 20'));
      assert.ok(script.includes('PRESENCE_BATCH_SIZE = 20'));
      assert.ok(script.includes('/api/user-feedback'));
      assert.ok(script.includes('FEEDBACK_BATCH_SIZE = 5'));
      assert.ok(script.includes('function loadQueue()'));
      assert.ok(script.includes('function persistQueue()'));
      assert.ok(script.includes('function enqueue(kind, payload)'));
      assert.ok(script.includes('function coalescePresenceHeartbeat(record)'));
      assert.ok(script.includes('function flushQueue(reason, unloadMode)'));
      assert.ok(script.includes('function sendBatch(endpoint, body, unloadMode)'));
      assert.ok(script.includes('function buildFeedbackPayload(input)'));
      assert.ok(script.includes('function submitFeedback(input)'));
      assert.ok(script.includes('openFeedback: openFeedback'));
      assert.ok(script.includes('submitFeedback: submitFeedback'));
      assert.ok(script.includes('deliveryStats'));
      assert.ok(script.includes('flush: function ()'));
      assert.ok(script.includes('status: queueStatus'));
      assert.ok(!script.includes('navigator.sendBeacon && navigator.sendBeacon(endpoint'));
    });

    it('queues web capture records in localStorage and clears them after a successful flush', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const fetchCalls = [];
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind test page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: { origin: 'https://app.example.com', href: 'https://app.example.com/docs', pathname: '/docs', hash: '' },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch(endpoint, options) {
          fetchCalls.push({ endpoint, body: options.body });
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      const queued = JSON.parse(storage.get(queueKey));

      assert.ok(queued.some((record) => record.kind === 'capture' && record.payload.type === 'page_view'));
      assert.ok(queued.some((record) => record.kind === 'presence' && record.payload.state === 'start'));

      await sandbox.window.TraceMind.flush();
      const flushedQueue = JSON.parse(storage.get(queueKey));
      const captureBody = JSON.parse(fetchCalls.find((call) => call.endpoint.endsWith('/api/capture')).body);
      const presenceBody = JSON.parse(fetchCalls.find((call) => call.endpoint.endsWith('/api/presence')).body);

      assert.strictEqual(flushedQueue.length, 0);
      assert.strictEqual(captureBody.events.length, 1);
      assert.strictEqual(presenceBody.events.length, 1);
      assert.strictEqual(captureBody.deliveryStats.sent, 1);
      assert.strictEqual(presenceBody.deliveryStats.sent, 1);
    });

    it('attaches privacy-safe first-touch web attribution to capture and presence records', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const sessionStorage = new Map();
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind launch page',
          referrer: 'https://news.ycombinator.com/item?id=123',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: {
          origin: 'https://app.example.com',
          href: 'https://app.example.com/pricing?utm_source=github&utm_medium=social&utm_campaign=launch-week&utm_content=hero&gclid=secret-click&utm_term=private&email=person@example.com#faq',
          pathname: '/pricing',
          hash: '#faq',
          hostname: 'app.example.com',
        },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch() {
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        sessionStorage: {
          getItem(key) { return sessionStorage.has(key) ? sessionStorage.get(key) : null; },
          setItem(key, value) { sessionStorage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;
      sandbox.sessionStorage = sandbox.window.sessionStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      sandbox.location.href = 'https://app.example.com/docs';
      sandbox.location.pathname = '/docs';
      sandbox.location.hash = '';
      sandbox.window.TraceMind.capture('custom', { eventName: 'docs_opened' });
      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      const queued = JSON.parse(storage.get(queueKey));
      const pageView = queued.find((record) => record.kind === 'capture' && record.payload.type === 'page_view');
      const custom = queued.find((record) => record.kind === 'capture' && record.payload.eventName === 'docs_opened');
      const presence = queued.find((record) => record.kind === 'presence' && record.payload.state === 'start');

      assert.deepStrictEqual(pageView.payload.attribution, {
        source: 'github',
        medium: 'social',
        campaign: 'launch-week',
        content: 'hero',
        referrerDomain: 'news.ycombinator.com',
        referrerType: 'social',
        landingPath: '/pricing#faq',
        gclidPresent: true,
      });
      assert.deepStrictEqual(custom.payload.attribution, pageView.payload.attribution);
      assert.deepStrictEqual(presence.payload.attribution, pageView.payload.attribution);
      const serialized = JSON.stringify(queued);
      assert.ok(!serialized.includes('utm_term'));
      assert.ok(!serialized.includes('secret-click'));
      assert.ok(!serialized.includes('person@example.com'));
      assert.ok(!serialized.includes('item?id=123'));
    });

    it('attaches optional framework metadata to Web Auto Capture sources', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const sessionStorage = new Map();
      const sandbox = {
        window: {},
        document: {
          title: 'Hybrid WebView',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              if (name === 'data-tracemind-framework') return 'Capacitor';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: {
          origin: 'https://app.example.com',
          href: 'https://app.example.com/webview',
          pathname: '/webview',
          hash: '',
          hostname: 'app.example.com',
        },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch() {
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        sessionStorage: {
          getItem(key) { return sessionStorage.has(key) ? sessionStorage.get(key) : null; },
          setItem(key, value) { sessionStorage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;
      sandbox.sessionStorage = sandbox.window.sessionStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      sandbox.window.TraceMind.capture('custom', { eventName: 'webview_checkout' });
      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      const queued = JSON.parse(storage.get(queueKey));
      const pageView = queued.find((record) => record.kind === 'capture' && record.payload.type === 'page_view');
      const custom = queued.find((record) => record.kind === 'capture' && record.payload.eventName === 'webview_checkout');
      const presence = queued.find((record) => record.kind === 'presence' && record.payload.state === 'start');

      assert.strictEqual(pageView.payload.source.details.framework, 'capacitor');
      assert.strictEqual(custom.payload.source.details.framework, 'capacitor');
      assert.strictEqual(presence.payload.source.details.framework, 'capacitor');
    });

    it('queues web user feedback separately from capture and presence events', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const fetchCalls = [];
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind feedback page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: { origin: 'https://app.example.com', href: 'https://app.example.com/pricing', pathname: '/pricing', hash: '' },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch(endpoint, options) {
          fetchCalls.push({ endpoint, body: options.body });
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      sandbox.window.TraceMind.submitFeedback({
        message: {
          kind: 'issue',
          title: 'Upgrade failed',
          body: 'The upgrade button did not finish.',
          contact: { email: 'user@example.com', consent: true },
          fields: { plan: 'pro' },
        },
      });
      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      const queued = JSON.parse(storage.get(queueKey));
      const feedbackRecord = queued.find((record) => record.kind === 'feedback');

      assert.ok(feedbackRecord);
      assert.strictEqual(feedbackRecord.payload.message.kind, 'issue');
      assert.strictEqual(feedbackRecord.payload.message.contact.email, 'user@example.com');
      assert.strictEqual(feedbackRecord.payload.path, '/pricing');

      await sandbox.window.TraceMind.flush();
      const feedbackBody = JSON.parse(fetchCalls.find((call) => call.endpoint.endsWith('/api/user-feedback')).body);

      assert.strictEqual(feedbackBody.events.length, 1);
      assert.strictEqual(feedbackBody.events[0].message.title, 'Upgrade failed');
      assert.ok(!fetchCalls.find((call) => call.endpoint.endsWith('/api/capture')).body.includes('Upgrade failed'));
    });

    it('tracks strict web active duration and stops it on window blur', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const fetchCalls = [];
      const documentListeners = {};
      const windowListeners = {};
      let currentTime = Date.parse('2026-05-08T01:00:00.000Z');
      class FakeDate extends Date {
        constructor(...args) {
          super(...(args.length ? args : [currentTime]));
        }

        static now() {
          return currentTime;
        }
      }
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind active page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener(type, handler) {
            documentListeners[type] = handler;
          },
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: { origin: 'https://app.example.com', href: 'https://app.example.com/docs', pathname: '/docs', hash: '' },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date: FakeDate,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch(endpoint, options) {
          fetchCalls.push({ endpoint, body: options.body });
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener(type, handler) {
          windowListeners[type] = handler;
        },
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      currentTime += 30 * 1000;
      windowListeners.blur();
      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      let queued = JSON.parse(storage.get(queueKey));
      const blurHeartbeat = queued.find((record) => record.kind === 'presence' && record.payload.state === 'heartbeat');

      assert.strictEqual(blurHeartbeat.payload.activeDurationMs, 30000);
      assert.strictEqual(blurHeartbeat.payload.activeState, 'inactive');
      assert.strictEqual(blurHeartbeat.payload.idleTimeoutMs, 60000);
      assert.strictEqual(blurHeartbeat.payload.lastActiveAt, '2026-05-08T01:00:00.000Z');

      currentTime += 120 * 1000;
      sandbox.window.TraceMind.presence('heartbeat');
      queued = JSON.parse(storage.get(queueKey));
      assert.strictEqual(queued.filter((record) => record.kind === 'presence').length, 2);
      assert.strictEqual(queued.find((record) => record.kind === 'presence' && record.payload.state === 'heartbeat').payload.activeDurationMs, 30000);

      windowListeners.focus();
      currentTime += 90 * 1000;
      sandbox.window.TraceMind.presence('heartbeat');
      queued = JSON.parse(storage.get(queueKey));
      const heartbeat = queued.find((record) => record.kind === 'presence' && record.payload.state === 'heartbeat');

      assert.strictEqual(heartbeat.payload.activeDurationMs, 90000);
      assert.strictEqual(heartbeat.payload.activeState, 'idle');
    });

    it('keeps failed queue records with retry metadata and coalesces presence heartbeats', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind test page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: { origin: 'https://app.example.com', href: 'https://app.example.com/docs', pathname: '/docs', hash: '' },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch() {
          return Promise.reject(new Error('network_error'));
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) { storage.set(key, value); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      sandbox.window.TraceMind.presence('heartbeat');
      sandbox.window.TraceMind.presence('heartbeat');
      sandbox.window.TraceMind.presence('heartbeat');
      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      let queued = JSON.parse(storage.get(queueKey));

      assert.strictEqual(queued.filter((record) => record.kind === 'presence' && record.payload.state === 'heartbeat').length, 1);
      assert.ok(sandbox.window.TraceMind.status().coalescedPresence >= 2);

      for (let i = 0; i < 305; i += 1) {
        sandbox.window.TraceMind.capture('custom', { eventName: `queue_test_${i}` });
      }

      queued = JSON.parse(storage.get(queueKey));
      const statusBeforeFlush = sandbox.window.TraceMind.status();

      assert.strictEqual(queued.length, 300);
      assert.ok(statusBeforeFlush.droppedOldest > 0);

      await sandbox.window.TraceMind.flush();
      queued = JSON.parse(storage.get(queueKey));

      assert.strictEqual(queued.length, 300);
      assert.ok(queued.some((record) => record.kind === 'capture' && record.attempts === 1 && record.nextAttemptAt > Date.now()));
      assert.strictEqual(sandbox.window.TraceMind.status().lastError, 'network_error');
    });

    it('drops oldest records and reports storage pressure when localStorage quota is tight', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const storage = new Map();
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind quota page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: { origin: 'https://app.example.com', href: 'https://app.example.com/docs', pathname: '/docs', hash: '' },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch() {
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem(key) { return storage.has(key) ? storage.get(key) : null; },
          setItem(key, value) {
            if (key.startsWith('tracemind_queue_') && JSON.parse(value).length > 3) {
              throw new Error('QuotaExceededError');
            }
            storage.set(key, value);
          },
          removeItem(key) { storage.delete(key); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      for (let i = 0; i < 5; i += 1) {
        sandbox.window.TraceMind.capture('custom', { eventName: `storage_pressure_${i}` });
      }

      const queueKey = [...storage.keys()].find((key) => key.startsWith('tracemind_queue_'));
      const queued = JSON.parse(storage.get(queueKey));
      const status = sandbox.window.TraceMind.status();

      assert.strictEqual(queued.length, 3);
      assert.strictEqual(status.storage, 'localStorage');
      assert.strictEqual(status.droppedOldest, 0);
      assert.ok(status.droppedStorage > 0);
      assert.strictEqual(status.lastError, 'storage_quota');
    });

    it('keeps an in-memory queue when localStorage writes are unavailable', async function () {
      const { Script, createContext } = await import('vm');
      const { clientScript } = await import('../server/capture_routes');
      const fetchCalls = [];
      const sandbox = {
        window: {},
        document: {
          title: 'TraceMind private mode page',
          referrer: '',
          visibilityState: 'visible',
          currentScript: {
            getAttribute(name) {
              if (name === 'data-tracemind-token') return 'tm_proj_test';
              return null;
            },
          },
          addEventListener() {},
        },
        navigator: {
          userAgent: 'test-agent',
          language: 'en',
          platform: 'test',
          onLine: true,
        },
        screen: { width: 1280, height: 720, colorDepth: 24 },
        location: { origin: 'https://app.example.com', href: 'https://app.example.com/docs', pathname: '/docs', hash: '' },
        history: { pushState() {}, replaceState() {} },
        URL,
        Intl,
        Promise,
        Blob,
        Date,
        Math,
        JSON,
        Object,
        String,
        Array,
        Number,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        fetch(endpoint, options) {
          fetchCalls.push({ endpoint, body: options.body });
          return Promise.resolve({ ok: true, status: 202 });
        },
      };
      sandbox.window = {
        localStorage: {
          getItem() { throw new Error('storage disabled'); },
          setItem() { throw new Error('storage disabled'); },
          removeItem() { throw new Error('storage disabled'); },
        },
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener() {},
      };
      sandbox.localStorage = sandbox.window.localStorage;

      new Script(clientScript('https://tracemind.example.com')).runInContext(createContext(sandbox));
      const beforeFlush = sandbox.window.TraceMind.status();

      assert.strictEqual(beforeFlush.storage, 'memory');
      assert.strictEqual(beforeFlush.queueLength, 2);
      assert.strictEqual(beforeFlush.droppedStorage, 0);
      assert.strictEqual(beforeFlush.lastError, 'storage_unavailable');

      await sandbox.window.TraceMind.flush();
      const afterFlush = sandbox.window.TraceMind.status();

      assert.strictEqual(afterFlush.queueLength, 0);
      assert.ok(fetchCalls.some((call) => call.endpoint.endsWith('/api/capture')));
      assert.ok(fetchCalls.some((call) => call.endpoint.endsWith('/api/presence')));
    });

    it('serves Web Auto Capture with stable target identity and core SPA signals', async function () {
      const { clientScript } = await import('../server/capture_routes');
      const script = clientScript('https://tracemind.example.com');

      assert.ok(script.includes('function interactiveTarget(event)'));
      assert.ok(script.includes('event.composedPath'));
      assert.ok(script.includes('function targetIdentity(element, eventType, pagePath)'));
      assert.ok(script.includes("data-testid"));
      assert.ok(script.includes('identityConfidence'));
      assert.ok(script.includes('identitySource'));
      assert.ok(script.includes('actionKey'));
      assert.ok(script.includes("targetHash: hash(targetDetails.identityKey || JSON.stringify(targetDetails.target), 'tm_target_')"));
      assert.ok(script.includes("document.addEventListener('input'"));
      assert.ok(script.includes('inputDebounceTimers'));
      assert.ok(script.includes('history.replaceState = function ()'));
      assert.ok(script.includes("window.addEventListener('hashchange'"));
      assert.ok(script.includes("document.addEventListener('keydown'"));
      assert.ok(script.includes('location.pathname,'));
      assert.ok(!script.includes('path: location.pathname + location.search'));
    });

    it('exposes MCP guidance and privacy validation tools', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const projectId = `project-agent-guidance-${Date.now()}`;
      const project = { _id: projectId, name: 'Agent Guidance Project' };
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_started',
        properties: { plan: 'pro' },
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });

      const toolNames = mcpTools().map((tool) => tool.name);
      assert.ok(toolNames.includes('tracemind.agent_guidance'));
      assert.ok(toolNames.includes('tracemind.project_info'));
      assert.ok(toolNames.includes('tracemind.project_health'));
      assert.ok(toolNames.includes('tracemind.recent_online'));
      assert.ok(toolNames.includes('tracemind.capture_setup'));
      assert.ok(toolNames.includes('tracemind.validate_event_payload'));
      assert.ok(toolNames.includes('tracemind.validate_instrumentation_diff'));
      assert.ok(toolNames.includes('tracemind.submit_feedback'));

      const projectTools = mcpTools(project);
      assert.ok(projectTools.some((tool) => (
        tool.name === 'tracemind.summary'
        && tool.title.includes('Agent Guidance Project')
        && tool.description.includes('Agent Guidance Project')
      )));
      assert.ok(projectTools.some((tool) => (
        tool.name === 'tracemind.project_health'
        && tool.title.includes('Agent Guidance Project')
        && tool.description.includes('Agent Guidance Project')
      )));
      assert.ok(projectTools.some((tool) => (
        tool.name === 'tracemind.recent_online'
        && tool.title.includes('Agent Guidance Project')
        && tool.description.includes('Agent Guidance Project')
      )));

      const projectInfo = await callMcpTool({
        ...project,
        projectKey: 'tm_proj_hidden',
        mcpTokens: [{ token: 'tm_mcp_hidden' }],
      }, 'tracemind.project_info', {});
      const otherProjectInfo = await callMcpTool({
        _id: `${projectId}-other`,
        name: 'Other TraceMind Project',
      }, 'tracemind.project_info', {});
      assert.strictEqual(projectInfo.structuredContent.projectId, projectId);
      assert.strictEqual(projectInfo.structuredContent.projectName, 'Agent Guidance Project');
      assert.strictEqual(projectInfo.structuredContent.mcpServerName, mcpServerNameForProject(project));
      assert.notStrictEqual(
        otherProjectInfo.structuredContent.mcpServerName,
        projectInfo.structuredContent.mcpServerName,
      );
      assert.ok(!JSON.stringify(projectInfo.structuredContent).includes('tm_mcp_'));
      assert.ok(!JSON.stringify(projectInfo.structuredContent).includes('tm_proj_'));

      const guidance = await callMcpTool(project, 'tracemind.agent_guidance', {});
      assert.strictEqual(guidance.structuredContent.ok, true);
      assert.strictEqual(guidance.structuredContent.guidanceVersion, '2026.05.17.7');
      assert.strictEqual(guidance.structuredContent.projectName, 'Agent Guidance Project');
      assert.strictEqual(guidance.structuredContent.mcpServerName, mcpServerNameForProject(project));
      assert.ok(guidance.structuredContent.workflow.includes('If multiple TraceMind MCP servers exist or the project is unclear, call tracemind.project_info first.'));
      assert.ok(guidance.structuredContent.workflow.includes('Call tracemind.capture_setup with platform web, ios, macos, android, react_native, hybrid, mini_program, browser_extension, mcp_node, mcp_python, agent_skill, server_node, server_python, or server_http before installing Auto Capture or adding manual events.'));
      assert.ok(guidance.structuredContent.workflow.includes('Use capture_setup installCommands, filesToEdit, initLocation, idempotencyChecks, and initSnippet for platform setup.'));
      assert.ok(guidance.structuredContent.workflow.includes('If setup succeeds but no data appears, check platform loading and network restrictions such as Web CSP, iOS/macOS ATS, Android network security, React Native native linking, Hybrid WebView bridge/storage rules, Mini Program request domain allowlists, Browser Extension host permissions/CSP/service worker context, and server egress/proxy/TLS policy.'));
      assert.ok(guidance.structuredContent.workflow.includes('When the developer reports a product issue or idea, ask whether they want to submit feedback unless they explicitly asked you to submit it.'));
      assert.ok(guidance.structuredContent.workflow.includes('Before calling tracemind.submit_feedback, collect a short sanitized summary plus TraceMind evidence references such as event ids, raw behavior ids, paths, actionKeys, targetHashes, and time window.'));
      assert.ok(guidance.structuredContent.analysisWorkflows.some((workflow) => workflow.name === 'Daily health check'));
      assert.ok(guidance.structuredContent.analysisWorkflows.some((workflow) => workflow.name === 'Recent online status'));
      assert.ok(guidance.structuredContent.analysisWorkflows.some((workflow) => workflow.name === 'Feature usage analysis'));
      assert.ok(guidance.structuredContent.analysisWorkflows.some((workflow) => workflow.name === 'Anomaly or drop investigation'));
      assert.ok(!JSON.stringify(guidance.structuredContent).includes('tm_mcp_'));
      assert.ok(!JSON.stringify(guidance.structuredContent).includes('tm_proj_'));

      const search = await callMcpTool(project, 'tracemind.search_event_names', { query: 'checkout' });
      assert.ok(search.structuredContent.events.some((event) => event.eventName === 'checkout_started'));

      const validation = await callMcpTool(project, 'tracemind.validate_event_payload', {
        eventType: 'custom',
        eventName: 'user_signup_completed',
        properties: {
          email: 'person@example.com',
          plan: 'pro',
        },
      });
      assert.strictEqual(validation.structuredContent.ok, false);
      assert.ok(validation.structuredContent.findings.some((finding) => finding.code === 'forbidden_property'));

      const dottedValidation = await callMcpTool(project, 'tracemind.validate_event_payload', {
        eventType: 'custom',
        eventName: 'invoice_paid',
        properties: {
          'request.body': 'raw request',
          amount: 2900,
        },
        context: {
          'headers.authorization': 'Bearer secret',
          source: 'stripe_webhook',
        },
      });
      assert.strictEqual(dottedValidation.structuredContent.ok, false);
      assert.ok(dottedValidation.structuredContent.findings.some((finding) => finding.path === 'properties.request.body'));
      assert.ok(dottedValidation.structuredContent.findings.some((finding) => finding.path === 'context.headers.authorization'));

      const missingEventNameValidation = await callMcpTool(project, 'tracemind.validate_event_payload', {
        eventType: 'custom',
        properties: {
          plan: 'pro',
        },
      });
      assert.strictEqual(missingEventNameValidation.structuredContent.ok, false);
      assert.ok(missingEventNameValidation.structuredContent.findings.some((finding) => finding.code === 'missing_custom_event_name'));

      const diffValidation = await callMcpTool(project, 'tracemind.validate_instrumentation_diff', {
        diff: "+ TraceMindMCP.capture('custom', { eventName: 'new_checkout_event', sourceDetails: { requestBody: req.body }, properties: { 'request.body': req.body, \"headers.authorization\": token, raw_prompt: userPrompt, raw_args: args, raw_result: result, resource_content: content, raw_request_body: req.body, raw_response_body: body, headers: req.headers, cookies: req.cookies, authorization: req.headers.authorization, userEmail: user.email, access_token: token } })",
      });
      assert.strictEqual(diffValidation.structuredContent.ok, false);
      assert.ok(diffValidation.structuredContent.findings.some((finding) => finding.code === 'new_event_requires_review'));
      assert.ok(diffValidation.structuredContent.findings.some((finding) => finding.message.includes('request.body')));
      assert.ok(diffValidation.structuredContent.findings.some((finding) => finding.message.includes('headers.authorization')));
      assert.ok(diffValidation.structuredContent.findings.filter((finding) => finding.code === 'forbidden_property').length >= 13);

      const mcpAutoDiffValidation = await callMcpTool(project, 'tracemind.validate_instrumentation_diff', {
        diff: "+ capture({ type: 'prompt_request', eventName: 'mcp_prompt_request', properties: { promptName: 'summarize', status: 'success', durationMs: 12 } })\n+ capture({ type: 'tool_call', eventName: 'mcp_tool_call', properties: { toolName: 'sync_docs', status: 'success' } })\n+ capture({ type: 'resource_read', eventName: 'mcp_resource_read', properties: { resourceName: 'docs', uriScheme: 'file' } })\n+ capture({ type: 'skill_lifecycle', eventName: 'agent_skill_lifecycle', properties: { skillName: 'docs-indexer', phase: 'completed' } })",
      });
      assert.strictEqual(mcpAutoDiffValidation.structuredContent.ok, true);
      assert.ok(!mcpAutoDiffValidation.structuredContent.findings.some((finding) => finding.path === 'eventName'));
      assert.ok(!mcpAutoDiffValidation.structuredContent.findings.some((finding) => finding.message.includes('promptName')));
    });

    it('returns materialized project health through MCP without internal actor hashes', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const projectId = `project-mcp-health-${Date.now()}`;
      const otherProjectId = `${projectId}-other`;
      const project = {
        _id: projectId,
        name: 'MCP Health Project',
        mcpTokens: [{ id: 'mcp_health', name: 'Codex Agent', token: 'tm_mcp_health' }],
      };

      await ProjectDailyReports.removeAsync({ projectId: { $in: [projectId, otherProjectId] } });
      await ProjectDailyReports.insertAsync({
        projectId,
        reportDate: '2026-05-11',
        timezone: 'Asia/Shanghai',
        status: 'final',
        computedAt: new Date('2026-05-11T16:30:00.000Z'),
        sourceWindow: {
          startAt: new Date('2026-05-10T16:00:00.000Z'),
          endAt: new Date('2026-05-11T16:00:00.000Z'),
          fullEndAt: new Date('2026-05-11T16:00:00.000Z'),
        },
        current: {
          eventCount: 20,
          activeUsers: 10,
          sessionCount: 8,
          averageActiveDurationMs: 60000,
          topEvents: [{ label: 'signup_started', count: 10 }],
          newUsers: 2,
        },
        delivery: {
          reportCount: 1,
          accepted: 22,
          droppedOldest: 0,
          droppedStorage: 0,
        },
        activeActorKeys: ['internal-previous-active'],
        newActorKeys: ['internal-previous-new'],
        firstSeenActorKeys: ['internal-previous-first'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await ProjectDailyReports.insertAsync({
        projectId,
        reportDate: '2026-05-12',
        timezone: 'Asia/Shanghai',
        status: 'final',
        computedAt: new Date('2026-05-12T16:30:00.000Z'),
        sourceWindow: {
          startAt: new Date('2026-05-11T16:00:00.000Z'),
          endAt: new Date('2026-05-12T16:00:00.000Z'),
          fullEndAt: new Date('2026-05-12T16:00:00.000Z'),
        },
        current: {
          eventCount: 6,
          activeUsers: 4,
          sessionCount: 3,
          averageActiveDurationMs: 30000,
          failureEventCount: 1,
          topEvents: [{ label: 'signup_failed', count: 4 }],
          newUsers: 1,
          retention: { d2: { sampleSize: 1, retainedUsers: 1, rate: 1 } },
        },
        delivery: {
          reportCount: 2,
          accepted: 7,
          retryCount: 1,
          droppedOldest: 1,
          droppedStorage: 0,
        },
        activeActorKeys: ['internal-current-active'],
        newActorKeys: ['internal-current-new'],
        firstSeenActorKeys: ['internal-current-first'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await ProjectDailyReports.insertAsync({
        projectId: otherProjectId,
        reportDate: '2026-05-12',
        timezone: 'Asia/Shanghai',
        status: 'final',
        computedAt: new Date('2026-05-12T16:30:00.000Z'),
        sourceWindow: {
          startAt: new Date('2026-05-11T16:00:00.000Z'),
          endAt: new Date('2026-05-12T16:00:00.000Z'),
        },
        current: {
          eventCount: 999,
          activeUsers: 999,
          sessionCount: 999,
        },
        delivery: { accepted: 999 },
        activeActorKeys: ['other-active'],
        newActorKeys: ['other-new'],
        firstSeenActorKeys: ['other-first'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const health = await callMcpTool(project, 'tracemind.project_health', { reportDate: '2026-05-12' });
      const structured = health.structuredContent;

      assert.ok(mcpTools(project).some((tool) => tool.name === 'tracemind.project_health'));
      assert.strictEqual(structured.ok, true);
      assert.strictEqual(structured.project._id, projectId);
      assert.strictEqual(structured.project.name, 'MCP Health Project');
      assert.strictEqual(structured.reportDate, '2026-05-12');
      assert.strictEqual(structured.previousReportDate, '2026-05-11');
      assert.strictEqual(structured.timezone, 'Asia/Shanghai');
      assert.strictEqual(structured.status, 'final');
      assert.strictEqual(structured.health.current.eventCount, 6);
      assert.strictEqual(structured.health.previous.eventCount, 20);
      assert.strictEqual(structured.health.trends.events, -0.7);
      assert.strictEqual(structured.delivery.accepted, 7);
      assert.ok(structured.health.attentionItems.some((item) => item.code === 'active_users_dropped'));
      assert.ok(JSON.stringify(structured).includes('signup_failed'));
      assert.ok(!JSON.stringify(structured).includes('internal-current-active'));
      assert.ok(!JSON.stringify(structured).includes('internal-current-new'));
      assert.ok(!JSON.stringify(structured).includes('internal-current-first'));
      assert.ok(!JSON.stringify(structured).includes('other-active'));
      assert.notStrictEqual(structured.project._id, otherProjectId);
      assert.notStrictEqual(structured.health.current.eventCount, 999);
      assert.notStrictEqual(structured.delivery.accepted, 999);
    });

    it('returns an empty MCP project health result when a daily report is missing', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-mcp-health-missing-${Date.now()}`;
      const project = { _id: projectId, name: 'Missing Health Project' };

      await ProjectDailyReports.removeAsync({ projectId });

      const health = await callMcpTool(project, 'tracemind.project_health', { reportDate: '2026-04-01' });
      const structured = health.structuredContent;

      assert.strictEqual(structured.ok, true);
      assert.strictEqual(structured.reportDate, '2026-04-01');
      assert.strictEqual(structured.status, 'missing');
      assert.strictEqual(structured.health.current.eventCount, 0);
      assert.strictEqual(structured.health.previous.eventCount, 0);
      assert.deepStrictEqual(structured.delivery, {});
      assert.ok(!JSON.stringify(structured).includes('activeActorKeys'));
      assert.ok(!JSON.stringify(structured).includes('newActorKeys'));
      assert.ok(!JSON.stringify(structured).includes('firstSeenActorKeys'));
    });

    it('returns recent online activity through MCP without internal identifiers', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const now = new Date();
      const projectId = `project-mcp-recent-online-${Date.now()}`;
      const otherProjectId = `${projectId}-other`;
      const project = {
        _id: projectId,
        name: 'MCP Recent Online Project',
        mcpTokens: [{ id: 'mcp_recent_online', name: 'Codex Agent', token: 'tm_mcp_recent_online' }],
      };

      await PresenceSessions.removeAsync({ projectId: { $in: [projectId, otherProjectId] } });
      await SemanticEvents.removeAsync({ projectId: { $in: [projectId, otherProjectId] } });
      await PresenceSessions.insertAsync({
        projectId,
        presenceId: 'tm_presence_recent_should_not_leak',
        sessionId: 'tm_sess_recent_should_not_leak',
        userId: 'user_recent_should_not_leak',
        anonymousId: 'tm_anon_recent_should_not_leak',
        deviceId: 'tm_dev_recent_should_not_leak',
        deviceFingerprint: 'fingerprint_recent_should_not_leak',
        platform: 'web',
        path: '/pricing',
        state: 'heartbeat',
        activeDurationMs: 120000,
        startedAt: new Date(now.getTime() - 20 * 60 * 1000),
        lastSeenAt: new Date(now.getTime() - 60 * 1000),
        geo: { country: 'US' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await PresenceSessions.insertAsync({
        projectId: otherProjectId,
        presenceId: 'tm_presence_sibling_should_not_leak',
        sessionId: 'tm_sess_sibling_should_not_leak',
        userId: 'user_sibling_should_not_leak',
        platform: 'web',
        path: '/sibling-should-not-leak',
        state: 'heartbeat',
        activeDurationMs: 999000,
        startedAt: new Date(now.getTime() - 10 * 60 * 1000),
        lastSeenAt: new Date(now.getTime() - 60 * 1000),
        geo: { country: 'GB' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'pricing_viewed',
        occurredAt: new Date(now.getTime() - 5 * 60 * 1000),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId: otherProjectId,
        eventType: 'custom',
        eventName: 'sibling_event_should_not_leak',
        occurredAt: new Date(now.getTime() - 5 * 60 * 1000),
        createdAt: new Date(),
      });

      const recentOnline = await callMcpTool(project, 'tracemind.recent_online', {});
      const structured = recentOnline.structuredContent;
      const serialized = JSON.stringify(structured);

      assert.ok(mcpTools(project).some((tool) => tool.name === 'tracemind.recent_online'));
      assert.strictEqual(structured.ok, true);
      assert.strictEqual(structured.project._id, projectId);
      assert.strictEqual(structured.project.name, 'MCP Recent Online Project');
      assert.strictEqual(structured.totalOnlineUsers, 1);
      assert.strictEqual(structured.buckets.length, 6);
      assert.ok(structured.buckets.some((bucket) => bucket.onlineUsers === 1));
      assert.deepStrictEqual(structured.topRegions, [{ label: 'US', count: 1 }]);
      assert.deepStrictEqual(structured.topDurationPaths, [{ path: '/pricing', durationMs: 120000, sessions: 1 }]);
      assert.deepStrictEqual(structured.topEvents, [{ label: 'pricing_viewed', count: 1 }]);
      assert.ok(!serialized.includes('tm_presence_recent_should_not_leak'));
      assert.ok(!serialized.includes('tm_sess_recent_should_not_leak'));
      assert.ok(!serialized.includes('user_recent_should_not_leak'));
      assert.ok(!serialized.includes('tm_anon_recent_should_not_leak'));
      assert.ok(!serialized.includes('tm_dev_recent_should_not_leak'));
      assert.ok(!serialized.includes('fingerprint_recent_should_not_leak'));
      assert.ok(!serialized.includes('sibling_should_not_leak'));
      assert.notStrictEqual(structured.project._id, otherProjectId);
    });

    it('returns an empty MCP recent online result when no users are online', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-mcp-recent-online-empty-${Date.now()}`;
      const project = { _id: projectId, name: 'Empty Recent Online Project' };

      await PresenceSessions.removeAsync({ projectId });
      await SemanticEvents.removeAsync({ projectId });

      const recentOnline = await callMcpTool(project, 'tracemind.recent_online', {});
      const structured = recentOnline.structuredContent;

      assert.strictEqual(structured.ok, true);
      assert.strictEqual(structured.project._id, projectId);
      assert.strictEqual(structured.totalOnlineUsers, 0);
      assert.strictEqual(structured.buckets.length, 6);
      assert.ok(structured.buckets.every((bucket) => bucket.onlineUsers === 0));
      assert.deepStrictEqual(structured.topRegions, []);
      assert.deepStrictEqual(structured.topDurationPaths, []);
      assert.deepStrictEqual(structured.topEvents, []);
    });

    it('submits sanitized developer feedback through MCP without creating behavior events', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-feedback-${Date.now()}`;
      const project = {
        _id: projectId,
        name: 'Feedback Project',
        mcpTokens: [{ id: 'mcp_feedback', name: 'Codex Agent', token: 'tm_mcp_feedback' }],
      };

      await FeedbackReports.removeAsync({ projectId });
      const rawBefore = await RawBehaviors.find({ projectId }).countAsync();
      const semanticBefore = await SemanticEvents.find({ projectId }).countAsync();

      const result = await callMcpTool(project, 'tracemind.submit_feedback', {
        type: 'issue',
        title: 'Pricing CTA does not submit',
        summary: 'Users click the pricing CTA, but no submit event appears in the selected time window.',
        expected: 'The CTA should create a submit or checkout event.',
        actual: 'Only repeated click events are visible.',
        suggestion: 'Inspect the form handler and disabled state after the click.',
        reproductionSteps: ['Open /pricing', 'Click Start trial', 'Check that no submit event appears'],
        evidence: {
          startAt: '2026-05-10T00:00:00.000Z',
          endAt: '2026-05-10T01:00:00.000Z',
          paths: ['/pricing'],
          eventIds: ['event_1'],
          rawBehaviorIds: ['raw_1'],
          actionKeys: ['web:/pricing:click:target:data-testid:start-trial'],
          targetHashes: ['tm_target_abc'],
          userIds: ['user_123'],
          sessionIds: ['tm_sess_123'],
          deviceIds: ['tm_dev_123'],
          examples: ['Three clicks from one session with no follow-up submit event.'],
        },
        environment: {
          platform: 'web',
          sourceType: 'web',
          sourceKey: 'app.example.com',
        },
      }, { mcpToken: 'tm_mcp_feedback' });

      assert.strictEqual(result.structuredContent.ok, true);
      assert.ok(result.structuredContent.feedbackId);
      const report = await FeedbackReports.findOneAsync(result.structuredContent.feedbackId);
      assert.strictEqual(report.projectId, projectId);
      assert.strictEqual(report.type, 'issue');
      assert.strictEqual(report.title, 'Pricing CTA does not submit');
      assert.strictEqual(report.submittedVia, 'mcp');
      assert.strictEqual(report.mcpTokenId, 'mcp_feedback');
      assert.strictEqual(report.mcpTokenName, 'Codex Agent');
      assert.strictEqual(report.evidence.paths[0], '/pricing');
      assert.strictEqual(report.evidence.eventIds[0], 'event_1');
      assert.strictEqual(report.environment.platform, 'web');
      assert.ok(!JSON.stringify(report).includes('tm_mcp_feedback'));
      assert.strictEqual(await RawBehaviors.find({ projectId }).countAsync(), rawBefore);
      assert.strictEqual(await SemanticEvents.find({ projectId }).countAsync(), semanticBefore);
    });

    it('rejects invalid or sensitive MCP feedback reports', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-feedback-invalid-${Date.now()}`;
      const project = {
        _id: projectId,
        name: 'Invalid Feedback Project',
        mcpTokens: [{ id: 'mcp_invalid', name: 'Cursor', token: 'tm_mcp_invalid' }],
      };

      await FeedbackReports.removeAsync({ projectId });

      const invalid = await callMcpTool(project, 'tracemind.submit_feedback', {
        type: 'question',
        title: '',
        summary: '',
      }, { mcpToken: 'tm_mcp_invalid' });
      assert.strictEqual(invalid.structuredContent.ok, false);
      assert.ok(invalid.structuredContent.findings.some((finding) => finding.code === 'invalid_feedback_type'));
      assert.ok(invalid.structuredContent.findings.some((finding) => finding.code === 'missing_feedback_title'));
      assert.ok(invalid.structuredContent.findings.some((finding) => finding.code === 'missing_feedback_summary'));

      const sensitive = await callMcpTool(project, 'tracemind.submit_feedback', {
        type: 'idea',
        title: 'Add onboarding hint',
        summary: 'Contact person@example.com and use Bearer tm_mcp_secret to replay the raw prompt.',
        evidence: {
          examples: ['Full URL https://app.example.com/pricing?email=person@example.com'],
          rawPrompt: 'raw user prompt',
          sourceDiff: '+ const token = req.headers.authorization',
        },
        environment: {
          platform: 'web',
          sourceType: 'web',
          sourceKey: 'app.example.com',
        },
      }, { mcpToken: 'tm_mcp_invalid' });
      assert.strictEqual(sensitive.structuredContent.ok, false);
      assert.ok(sensitive.structuredContent.findings.some((finding) => finding.code === 'forbidden_property'));
      assert.strictEqual(await FeedbackReports.find({ projectId }).countAsync(), 0);
    });

    it('deduplicates repeated MCP feedback reports from the same token', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-feedback-dedupe-${Date.now()}`;
      const project = {
        _id: projectId,
        name: 'Feedback Dedupe Project',
        mcpTokens: [{ id: 'mcp_dedupe', name: 'Codex Agent', token: 'tm_mcp_dedupe' }],
      };
      const args = {
        type: 'issue',
        title: 'Setup copy button has no visible feedback',
        summary: 'The copy action succeeds, but the UI does not show a visible copied state.',
        evidence: {
          paths: ['/setup'],
          actionKeys: ['web:/setup:click:copy-mcp-url'],
        },
        environment: {
          platform: 'web',
          sourceType: 'web',
          sourceKey: 'app.example.com',
        },
      };

      await FeedbackReports.removeAsync({ projectId });

      const first = await callMcpTool(project, 'tracemind.submit_feedback', args, { mcpToken: 'tm_mcp_dedupe' });
      const second = await callMcpTool(project, 'tracemind.submit_feedback', args, { mcpToken: 'tm_mcp_dedupe' });

      assert.strictEqual(first.structuredContent.ok, true);
      assert.strictEqual(second.structuredContent.ok, true);
      assert.strictEqual(second.structuredContent.deduplicated, true);
      assert.strictEqual(second.structuredContent.feedbackId, first.structuredContent.feedbackId);
      assert.strictEqual(await FeedbackReports.find({ projectId }).countAsync(), 1);
    });

    it('rate limits excessive MCP feedback reports from the same token', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-feedback-rate-${Date.now()}`;
      const project = {
        _id: projectId,
        name: 'Feedback Rate Project',
        mcpTokens: [{ id: 'mcp_rate', name: 'Cursor', token: 'tm_mcp_rate' }],
      };

      await FeedbackReports.removeAsync({ projectId });

      for (let index = 0; index < 5; index += 1) {
        const result = await callMcpTool(project, 'tracemind.submit_feedback', {
          type: 'idea',
          title: `Improve onboarding step ${index}`,
          summary: `Suggestion ${index} for making onboarding clearer.`,
        }, { mcpToken: 'tm_mcp_rate' });
        assert.strictEqual(result.structuredContent.ok, true);
      }

      const limited = await callMcpTool(project, 'tracemind.submit_feedback', {
        type: 'idea',
        title: 'Improve onboarding after limit',
        summary: 'Another unique suggestion that should be rate limited.',
      }, { mcpToken: 'tm_mcp_rate' });

      assert.strictEqual(limited.structuredContent.ok, false);
      assert.ok(limited.structuredContent.findings.some((finding) => finding.code === 'feedback_rate_limited'));
      assert.strictEqual(await FeedbackReports.find({ projectId }).countAsync(), 5);
    });

    it('submits end-user feedback with structured message and evidence without behavior events', async function () {
      const { ingestUserFeedbackPayload, callMcpTool } = await import('../server/capture_routes');
      const UserFeedbackReports = TraceMindApi.UserFeedbackReports;
      const projectId = `project-user-feedback-${Date.now()}`;
      const projectKey = `tm_proj_user_feedback_${Date.now()}`;
      const occurredAt = new Date('2026-05-16T10:00:00.000Z');
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-user-feedback',
        name: 'User Feedback Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });
      const rawId = await RawBehaviors.insertAsync({
        projectId,
        type: 'click',
        sessionId: 'tm_sess_feedback',
        userId: 'user_123',
        anonymousId: 'tm_anon_feedback',
        deviceId: 'tm_dev_feedback',
        platform: 'web',
        path: '/pricing',
        actionKey: 'web:/pricing:click:target:data-testid:upgrade',
        targetHash: 'tm_target_upgrade',
        occurredAt: new Date(occurredAt.getTime() - 30 * 1000),
        createdAt: new Date(),
      });
      const eventId = await SemanticEvents.insertAsync({
        projectId,
        eventType: 'click',
        eventName: 'click',
        sessionId: 'tm_sess_feedback',
        userId: 'user_123',
        anonymousId: 'tm_anon_feedback',
        deviceId: 'tm_dev_feedback',
        platform: 'web',
        path: '/pricing',
        actionKey: 'web:/pricing:click:target:data-testid:upgrade',
        targetHash: 'tm_target_upgrade',
        occurredAt: new Date(occurredAt.getTime() - 20 * 1000),
        createdAt: new Date(),
      });
      const rawBefore = await RawBehaviors.find({ projectId }).countAsync();
      const semanticBefore = await SemanticEvents.find({ projectId }).countAsync();

      const result = await ingestUserFeedbackPayload({
        projectKey,
        sessionId: 'tm_sess_feedback',
        anonymousId: 'tm_anon_feedback',
        userId: 'user_123',
        deviceId: 'tm_dev_feedback',
        platform: 'web',
        path: '/pricing',
        source: { type: 'web', url: 'https://app.example.com/pricing' },
        occurredAt: occurredAt.toISOString(),
        message: {
          formatVersion: 1,
          kind: 'issue',
          title: 'Cannot upgrade',
          body: 'The upgrade button did not finish.',
          contact: {
            name: 'Alex',
            email: 'alex@example.com',
            preferredChannel: 'email',
            consent: true,
          },
          fields: {
            plan: 'pro',
            urgency: 'high',
          },
          attachments: [{ name: 'future.png' }],
        },
      }, { headers: {}, socket: {} });

      assert.strictEqual(result.ok, true);
      assert.ok(result.userFeedbackId);
      const report = await UserFeedbackReports.findOneAsync(result.userFeedbackId);
      assert.strictEqual(report.projectId, projectId);
      assert.strictEqual(report.status, 'new');
      assert.strictEqual(report.message.kind, 'issue');
      assert.strictEqual(report.message.contact.email, 'alex@example.com');
      assert.strictEqual(report.message.fields.plan, 'pro');
      assert.deepStrictEqual(report.message.attachments, []);
      assert.strictEqual(report.evidence.sessionIds[0], 'tm_sess_feedback');
      assert.strictEqual(report.evidence.eventIds[0], eventId);
      assert.strictEqual(report.evidence.rawBehaviorIds[0], rawId);
      assert.strictEqual(report.evidence.actionKeys[0], 'web:/pricing:click:target:data-testid:upgrade');
      assert.strictEqual(report.evidence.targetHashes[0], 'tm_target_upgrade');
      assert.strictEqual(report.environment.sourceKey, 'app.example.com');
      assert.ok(report.searchText.includes('pro'));
      const fieldQuery = await callMcpTool({ _id: projectId, name: 'User Feedback Project' }, 'tracemind.query_user_feedback', {
        keyword: 'pro',
      });
      assert.strictEqual(fieldQuery.structuredContent.ok, true);
      assert.strictEqual(fieldQuery.structuredContent.feedback[0]._id, result.userFeedbackId);
      assert.strictEqual(await RawBehaviors.find({ projectId }).countAsync(), rawBefore);
      assert.strictEqual(await SemanticEvents.find({ projectId }).countAsync(), semanticBefore);
    });

    it('rejects sensitive end-user feedback fields while allowing consented contact fields', async function () {
      const { ingestUserFeedbackPayload } = await import('../server/capture_routes');
      const UserFeedbackReports = TraceMindApi.UserFeedbackReports;
      const projectId = `project-user-feedback-invalid-${Date.now()}`;
      const projectKey = `tm_proj_user_feedback_invalid_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-user-feedback-invalid',
        name: 'Invalid User Feedback Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const sensitive = await ingestUserFeedbackPayload({
        projectKey,
        sessionId: 'tm_sess_feedback_invalid',
        source: { type: 'web', url: 'https://app.example.com/settings' },
        message: {
          kind: 'issue',
          title: 'Settings issue',
          body: 'Please inspect Bearer secret_token and raw prompt.',
          contact: { email: 'alex@example.com', consent: true },
          fields: {
            accessToken: 'secret',
            plan: 'pro',
          },
        },
      }, { headers: {}, socket: {} });

      assert.strictEqual(sensitive.ok, false);
      assert.ok(sensitive.findings.some((finding) => finding.code === 'forbidden_user_feedback_field'));
      assert.strictEqual(await UserFeedbackReports.find({ projectId }).countAsync(), 0);

      const embeddedUrl = await ingestUserFeedbackPayload({
        projectKey,
        sessionId: 'tm_sess_feedback_invalid',
        source: { type: 'web', url: 'https://app.example.com/settings' },
        message: {
          kind: 'issue',
          title: 'Settings issue',
          body: 'This happens after opening https://app.example.com/settings?token=secret.',
        },
      }, { headers: {}, socket: {} });

      assert.strictEqual(embeddedUrl.ok, false);
      assert.ok(embeddedUrl.findings.some((finding) => finding.code === 'forbidden_user_feedback_field'));
      assert.strictEqual(await UserFeedbackReports.find({ projectId }).countAsync(), 0);

      const contactWithoutConsent = await ingestUserFeedbackPayload({
        projectKey,
        sessionId: 'tm_sess_feedback_invalid',
        source: { type: 'web', url: 'https://app.example.com/settings' },
        message: {
          kind: 'question',
          title: 'Can you contact me?',
          body: 'Reach out when this is fixed.',
          contact: { email: 'alex@example.com', consent: false },
        },
      }, { headers: {}, socket: {} });

      assert.strictEqual(contactWithoutConsent.ok, true);
      const report = await UserFeedbackReports.findOneAsync(contactWithoutConsent.userFeedbackId);
      assert.deepStrictEqual(report.message.contact, { consent: false });
    });

    it('queries and updates end-user feedback through MCP without editing the original message', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const UserFeedbackReports = TraceMindApi.UserFeedbackReports;
      const projectId = `project-user-feedback-mcp-${Date.now()}`;
      const project = {
        _id: projectId,
        name: 'User Feedback MCP Project',
        mcpTokens: [{ id: 'mcp_user_feedback', name: 'Codex Agent', token: 'tm_mcp_user_feedback' }],
      };
      const feedbackId = await UserFeedbackReports.insertAsync({
        projectId,
        projectName: project.name,
        status: 'new',
        message: {
          formatVersion: 1,
          kind: 'issue',
          title: 'Upgrade failed',
          body: 'The upgrade button did not finish.',
          contact: { email: 'alex@example.com', consent: true },
          fields: { plan: 'pro' },
          attachments: [],
        },
        evidence: {
          paths: ['/pricing'],
          sessionIds: ['tm_sess_feedback_mcp'],
          eventIds: ['event_user_feedback_mcp'],
          rawBehaviorIds: ['raw_user_feedback_mcp'],
          actionKeys: ['web:/pricing:click:target:data-testid:upgrade'],
          targetHashes: ['tm_target_upgrade'],
        },
        environment: { platform: 'web', sourceType: 'web', sourceKey: 'app.example.com' },
        hasContact: true,
        createdAt: new Date('2026-05-16T10:00:00.000Z'),
        updatedAt: new Date('2026-05-16T10:00:00.000Z'),
      });

      const query = await callMcpTool(project, 'tracemind.query_user_feedback', {
        status: 'new',
        kind: 'issue',
        path: '/pricing',
        hasContact: true,
        keyword: 'upgrade',
      }, { mcpToken: 'tm_mcp_user_feedback' });
      assert.strictEqual(query.structuredContent.ok, true);
      assert.strictEqual(query.structuredContent.feedback.length, 1);
      assert.strictEqual(query.structuredContent.feedback[0]._id, feedbackId);
      assert.strictEqual(query.structuredContent.feedback[0].message.body, undefined);
      assert.strictEqual(query.structuredContent.feedback[0].message.preview, 'The upgrade button did not finish.');

      const detail = await callMcpTool(project, 'tracemind.query_user_feedback', {
        id: feedbackId,
        includeMessage: true,
      }, { mcpToken: 'tm_mcp_user_feedback' });
      assert.strictEqual(detail.structuredContent.feedback[0].message.body, 'The upgrade button did not finish.');

      const updated = await callMcpTool(project, 'tracemind.update_user_feedback', {
        id: feedbackId,
        status: 'resolved',
        note: 'Fixed disabled state in checkout form.',
        resolution: 'Patched upgrade submit handler.',
        linkedIssueUrl: 'https://linear.app/acme/issue/TR-123',
      }, { mcpToken: 'tm_mcp_user_feedback' });
      assert.strictEqual(updated.structuredContent.ok, true);
      assert.strictEqual(updated.structuredContent.feedback.status, 'resolved');

      const report = await UserFeedbackReports.findOneAsync(feedbackId);
      assert.strictEqual(report.message.body, 'The upgrade button did not finish.');
      assert.strictEqual(report.status, 'resolved');
      assert.strictEqual(report.resolution, 'Patched upgrade submit handler.');
      assert.strictEqual(report.linkedIssueUrl, 'https://linear.app/acme/issue/TR-123');
      assert.strictEqual(report.activityLog.length, 1);
      assert.strictEqual(report.activityLog[0].mcpTokenId, 'mcp_user_feedback');
      assert.strictEqual(report.activityLog[0].note, 'Fixed disabled state in checkout form.');
    });

    it('returns the current project web auto capture setup through MCP', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const project = {
        _id: `project-capture-setup-${Date.now()}`,
        name: 'Capture Setup Project',
        projectKey: 'tm_proj_test',
      };

      const setup = await callMcpTool(project, 'tracemind.capture_setup', {});

      assert.strictEqual(setup.structuredContent.ok, true);
      assert.strictEqual(setup.structuredContent.projectKey, 'tm_proj_test');
      assert.strictEqual(setup.structuredContent.tokenType, 'public_auto_capture_project_key');
      assert.ok(setup.structuredContent.captureScriptUrl.includes('/capture.js'));
      assert.ok(setup.structuredContent.captureSnippet.includes('/capture.js'));
      assert.ok(setup.structuredContent.captureSnippet.includes('data-tracemind-token="tm_proj_test"'));
      assert.ok(setup.structuredContent.installCommands.some((step) => step.includes('No package install')));
      assert.notStrictEqual(setup.structuredContent.distributionMode, 'local_source');
      assert.strictEqual(setup.structuredContent.latestSdk, undefined);
      assert.strictEqual(setup.structuredContent.installedSdkManifest, undefined);
      assert.strictEqual(setup.structuredContent.upgradeCommands, undefined);
      assert.ok(setup.structuredContent.filesToEdit.some((file) => file.includes('root layout')));
      assert.ok(setup.structuredContent.idempotencyChecks.some((check) => check.includes('data-tracemind-token')));
      assert.ok(setup.structuredContent.verificationCommands.some((command) => command.includes('query TraceMind')));
      assert.ok(setup.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
      assert.deepStrictEqual(setup.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
      assert.ok(setup.structuredContent.identifySnippet.includes('window.TraceMind.identify'));
      assert.ok(setup.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.search_event_names')));
      assert.ok(setup.structuredContent.manualCaptureWarnings.some((warning) => warning.includes('stable business outcomes')));
      assert.ok(setup.structuredContent.manualCaptureExamples.some((example) => example.includes('amount: 29')));
      assert.ok(setup.structuredContent.trafficAttribution.analysisFilters.includes('attributionSource'));
      assert.ok(setup.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('Web Auto Capture')));
      assert.ok(setup.structuredContent.manualCaptureExample.includes('window.TraceMind.capture'));
      assert.ok(setup.structuredContent.networkRestrictionChecks.some((check) => check.includes('script-src')));
      assert.ok(setup.structuredContent.networkRestrictionChecks.some((check) => check.includes('connect-src')));
      assert.ok(setup.structuredContent.notes.some((note) => note.includes('Do not use the MCP token')));
      assert.ok(!JSON.stringify(setup.structuredContent).includes('tm_mcp_'));
    });

    it('returns native auto capture setup snippets through MCP', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const project = {
        _id: `project-native-capture-setup-${Date.now()}`,
        name: 'Native Capture Setup Project',
        projectKey: 'tm_proj_native',
      };

      const setupTool = mcpTools(project).find((tool) => tool.name === 'tracemind.capture_setup');
      const feedbackTool = mcpTools(project).find((tool) => tool.name === 'tracemind.submit_feedback');
      assert.strictEqual(setupTool.inputSchema.properties.platform.type, 'string');
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('macos'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('hybrid'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('mini_program'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('browser_extension'));
      assert.deepStrictEqual(setupTool.inputSchema.properties.provider.enum, ['wechat', 'alipay', 'douyin', 'dingtalk']);
      assert.ok(feedbackTool.inputSchema.properties.environment.properties.platform.enum.includes('macos'));
      assert.ok(feedbackTool.inputSchema.properties.environment.properties.sourceType.enum.includes('macos'));
      assert.ok(feedbackTool.inputSchema.properties.environment.properties.platform.enum.includes('mini_program'));
      assert.ok(feedbackTool.inputSchema.properties.environment.properties.sourceType.enum.includes('mini_program'));
      assert.ok(feedbackTool.inputSchema.properties.environment.properties.platform.enum.includes('browser_extension'));
      assert.ok(feedbackTool.inputSchema.properties.environment.properties.sourceType.enum.includes('browser_extension'));

      const ios = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'ios' });
      const macos = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'macos' });
      const android = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'android' });
      const reactNative = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'react_native' });

      assert.strictEqual(ios.structuredContent.platform, 'ios');
      assertLocalSourceSetup(ios, 'vendor/TraceMind');
      assertSdkGovernance(ios, 'swift', 'vendor/TraceMind');
      assert.ok(ios.structuredContent.installCommands.some((step) => step.includes('.package(path: "vendor/TraceMind")')));
      assert.ok(ios.structuredContent.dependencyEdits.some((edit) => edit.includes('.product(name: "TraceMind", package: "TraceMind")')));
      assert.ok(ios.structuredContent.install.includes('Swift Package'));
      assert.ok(ios.structuredContent.installCommands.some((step) => step.includes('Swift Package')));
      assert.ok(ios.structuredContent.filesToEdit.includes('App.swift'));
      assert.ok(ios.structuredContent.initLocation.includes('app startup'));
      assert.ok(ios.structuredContent.idempotencyChecks.some((check) => check.includes('TraceMind.start(')));
      assert.ok(ios.structuredContent.initSnippet.includes('TraceMind.start(projectKey: "tm_proj_native")'));
      assert.ok(ios.structuredContent.source.key.includes('bundle id'));
      assert.ok(ios.structuredContent.sourceModel.includes('bundle id'));
      assert.ok(ios.structuredContent.verificationCommands.includes('swift test --package-path sdk/ios'));
      assert.ok(ios.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(ios.structuredContent.manualCaptureExamples.some((example) => example.includes('"amount": 29')));
      assert.ok(ios.structuredContent.trafficAttribution.setupExamples.some((example) => example.includes('TraceMind.recordOpenURL')));
      assert.ok(ios.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('universal links')));
      assert.ok(ios.structuredContent.manualCaptureExample.includes('TraceMind.capture'));
      assert.ok(ios.structuredContent.networkRestrictionChecks.some((check) => check.includes('NSAppTransportSecurity')));

      assert.strictEqual(macos.structuredContent.platform, 'macos');
      assert.strictEqual(macos.structuredContent.eventPlatform, 'macos');
      assertLocalSourceSetup(macos, 'vendor/TraceMind');
      assertSdkGovernance(macos, 'swift', 'vendor/TraceMind');
      assert.ok(macos.structuredContent.installCommands.some((step) => step.includes('.package(path: "vendor/TraceMind")')));
      assert.ok(macos.structuredContent.install.includes('Swift Package'));
      assert.ok(macos.structuredContent.installCommands.some((step) => step.includes('sdk/ios')));
      assert.ok(macos.structuredContent.filesToEdit.includes('App.swift'));
      assert.ok(macos.structuredContent.initLocation.includes('user window'));
      assert.ok(macos.structuredContent.idempotencyChecks.some((check) => check.includes('TraceMind.start(')));
      assert.ok(macos.structuredContent.initSnippet.includes('TraceMind.start(projectKey: "tm_proj_native")'));
      assert.ok(macos.structuredContent.source.type === 'macos');
      assert.ok(macos.structuredContent.source.key.includes('bundle id'));
      assert.ok(macos.structuredContent.sourceModel.includes('platform remains macos'));
      assert.ok(macos.structuredContent.autoCapturedSignals.includes('window or main-window change'));
      assert.ok(!macos.structuredContent.autoCapturedSignals.includes('input changed without input values'));
      assert.ok(macos.structuredContent.verificationCommands.includes('swift test --package-path sdk/ios'));
      assert.ok(macos.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(macos.structuredContent.manualCaptureExamples.some((example) => example.includes('TraceMind.setScreen')));
      assert.ok(macos.structuredContent.manualCaptureExample.includes('TraceMind.capture'));

      assert.strictEqual(android.structuredContent.platform, 'android');
      assertRegistrySetup(android, 'android', 'maven_central', 'io.github.wolf3c.tracemind:tracemind-android');
      assertSdkGovernance(android, 'android', 'vendor/tracemind-android');
      assert.ok(android.structuredContent.installCommands.some((step) => step.includes('implementation("io.github.wolf3c.tracemind:tracemind-android:')));
      assert.ok(android.structuredContent.install.includes('Maven Central'));
      assert.ok(android.structuredContent.installCommands.some((step) => step.includes('mavenCentral()')));
      assert.ok(android.structuredContent.filesToEdit.some((file) => file.includes('AndroidManifest.xml')));
      assert.ok(android.structuredContent.initLocation.includes('Application.onCreate()'));
      assert.ok(android.structuredContent.idempotencyChecks.some((check) => check.includes('Gradle')));
      assert.ok(android.structuredContent.initSnippet.includes('TraceMind.start(application, projectKey = "tm_proj_native")'));
      assert.ok(android.structuredContent.source.key.includes('package name'));
      assert.ok(android.structuredContent.sourceModel.includes('package name'));
      assert.ok(android.structuredContent.verificationCommands.includes('npm run test:sdk:android'));
      assert.ok(android.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(android.structuredContent.manualCaptureExamples.some((example) => example.includes('"amount" to 29')));
      assert.ok(android.structuredContent.trafficAttribution.setupExamples.some((example) => example.includes('TraceMind.recordDeepLink')));
      assert.ok(android.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('app links')));
      assert.ok(android.structuredContent.manualCaptureExample.includes('TraceMind.capture'));
      assert.ok(android.structuredContent.networkRestrictionChecks.some((check) => check.includes('android.permission.INTERNET')));
      assert.ok(android.structuredContent.networkRestrictionChecks.some((check) => check.includes('network_security_config')));

      assert.strictEqual(reactNative.structuredContent.platform, 'react_native');
      assertRegistrySetup(reactNative, 'react_native', 'npm', '@tracemind/react-native');
      assertSdkGovernance(reactNative, 'react_native', 'vendor/tracemind/react-native');
      assert.ok(reactNative.structuredContent.install.includes('@tracemind/react-native'));
      assert.ok(reactNative.structuredContent.packageManagerNotes.some((note) => note.includes('@tracemind/react-native')));
      assert.ok(reactNative.structuredContent.filesToEdit.includes('package.json'));
      assert.ok(reactNative.structuredContent.initLocation.includes('bootstrap'));
      assert.ok(reactNative.structuredContent.idempotencyChecks.some((check) => check.includes('@tracemind/react-native')));
      assert.ok(reactNative.structuredContent.initSnippet.includes('TraceMind.start({ projectKey: "tm_proj_native" })'));
      assert.strictEqual(reactNative.structuredContent.eventPlatform, 'ios_or_android');
      assert.ok(reactNative.structuredContent.sourceModel.includes('Do not create a react_native platform value'));
      assert.ok(reactNative.structuredContent.verificationCommands.includes('npm test --prefix sdk/react-native'));
      assert.ok(reactNative.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(reactNative.structuredContent.manualCaptureExamples.some((example) => example.includes('amount: 29')));
      assert.ok(reactNative.structuredContent.trafficAttribution.setupExamples.some((example) => example.includes('TraceMind.setAttribution')));
      assert.ok(reactNative.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('native attribution helpers')));
      assert.ok(reactNative.structuredContent.manualCaptureExample.includes('TraceMind.capture'));
      assert.ok(reactNative.structuredContent.networkRestrictionChecks.some((check) => check.includes('native module')));

      [ios, android, reactNative].forEach((result) => {
        assert.strictEqual(result.structuredContent.tokenType, 'public_auto_capture_project_key');
        assert.ok(result.structuredContent.autoCapturedSignals.includes('input changed without input values'));
        assert.deepStrictEqual(result.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
        assert.ok(result.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.validate_event_payload')));
        assert.ok(result.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
        assert.ok(result.structuredContent.notes.some((note) => note.includes('Do not use the MCP token')));
        assert.ok(!JSON.stringify(result.structuredContent).includes('tm_mcp_'));
      });
      assert.strictEqual(macos.structuredContent.tokenType, 'public_auto_capture_project_key');
      assert.deepStrictEqual(macos.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
      assert.ok(macos.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.validate_event_payload')));
      assert.ok(macos.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
      assert.ok(macos.structuredContent.notes.some((note) => note.includes('Do not use the MCP token')));
      assert.ok(!JSON.stringify(macos.structuredContent).includes('tm_mcp_'));
    });

    it('returns hybrid app setup guidance through MCP', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const project = {
        _id: `project-hybrid-capture-setup-${Date.now()}`,
        name: 'Hybrid Capture Setup Project',
        projectKey: 'tm_proj_hybrid',
      };

      const setupTool = mcpTools(project).find((tool) => tool.name === 'tracemind.capture_setup');
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('hybrid'));

      const hybrid = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'hybrid' });

      assert.strictEqual(hybrid.structuredContent.ok, true);
      assert.strictEqual(hybrid.structuredContent.platform, 'hybrid');
      assert.strictEqual(hybrid.structuredContent.eventPlatform, 'web_plus_native');
      assert.strictEqual(hybrid.structuredContent.distributionMode, 'web_snippet_plus_registry_native');
      assert.strictEqual(hybrid.structuredContent.publishStatus, 'partially_published');
      assert.ok(hybrid.structuredContent.nativeSdkInstallOptions.some((option) => option.latestSdk.sdkName === 'swift'));
      assert.ok(hybrid.structuredContent.nativeSdkInstallOptions.some((option) => option.latestSdk.sdkName === 'android'));
      assert.ok(hybrid.structuredContent.upgradeCommands.some((command) => command.includes('.tracemind-sdk.json')));
      assert.ok(hybrid.structuredContent.installCommands.some((step) => step.includes('vendor/TraceMind')));
      assert.ok(hybrid.structuredContent.installCommands.some((step) => step.includes('implementation("io.github.wolf3c.tracemind:tracemind-android:')));
      assert.ok(hybrid.structuredContent.captureSnippet.includes('/capture.js'));
      assert.ok(hybrid.structuredContent.captureSnippet.includes('data-tracemind-token="tm_proj_hybrid"'));
      assert.ok(hybrid.structuredContent.captureSnippet.includes('data-tracemind-framework="hybrid"'));
      assert.ok(hybrid.structuredContent.install.includes('Web Auto Capture'));
      assert.ok(hybrid.structuredContent.installCommands.some((step) => step.includes('WebView')));
      assert.ok(hybrid.structuredContent.installCommands.some((step) => step.includes('same stable internal userId')));
      assert.ok(hybrid.structuredContent.filesToEdit.some((file) => file.includes('WebView')));
      assert.ok(hybrid.structuredContent.filesToEdit.some((file) => file.includes('Application.kt')));
      assert.ok(hybrid.structuredContent.initLocation.includes('WebView page'));
      assert.ok(hybrid.structuredContent.idempotencyChecks.some((check) => check.includes('TraceMind.start(')));
      assert.ok(hybrid.structuredContent.initSnippet.includes('tm_proj_hybrid'));
      assert.ok(hybrid.structuredContent.sourceModel.includes('Do not create a hybrid event platform'));
      assert.ok(hybrid.structuredContent.sourceModel.includes('WebView events remain platform web'));
      assert.ok(hybrid.structuredContent.autoCapturedSignals.some((signal) => signal.includes('WebView page view')));
      assert.ok(hybrid.structuredContent.networkRestrictionChecks.some((check) => check.includes('WebView enables JavaScript')));
      assert.ok(hybrid.structuredContent.verificationCommands.some((command) => command.includes('WebView content')));
      assert.ok(hybrid.structuredContent.verificationCommands.some((command) => command.includes('same stable userId')));
      assert.ok(hybrid.structuredContent.identifySnippet.includes('window.TraceMind.identify'));
      assert.ok(hybrid.structuredContent.manualCaptureExamples.some((example) => example.includes('window.TraceMind.capture')));
      assert.ok(hybrid.structuredContent.manualCaptureExample.includes('never duplicate'));
      assert.ok(hybrid.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('WebView')));
      assert.ok(hybrid.structuredContent.trafficAttribution.setupExamples.some((example) => example.includes('captureSnippet')));
      assert.strictEqual(hybrid.structuredContent.tokenType, 'public_auto_capture_project_key');
      assert.deepStrictEqual(hybrid.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
      assert.ok(hybrid.structuredContent.notes.some((note) => note.includes('Do not use the MCP token')));
      assert.ok(!JSON.stringify(hybrid.structuredContent).includes('tm_mcp_'));
    });

    it('returns mini program setup guidance through MCP', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const project = {
        _id: `project-mini-program-capture-setup-${Date.now()}`,
        name: 'Mini Program Capture Setup Project',
        projectKey: 'tm_proj_mini',
      };

      const setupTool = mcpTools(project).find((tool) => tool.name === 'tracemind.capture_setup');
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('mini_program'));
      assert.deepStrictEqual(setupTool.inputSchema.properties.provider.enum, ['wechat', 'alipay', 'douyin', 'dingtalk']);

      const wechat = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'mini_program', provider: 'wechat' });
      const alipay = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'alipay_mini_program' });
      const douyin = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'mini_program', provider: 'douyin' });
      const dingtalk = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'dingtalk_mini_program' });

      assert.strictEqual(wechat.structuredContent.ok, true);
      assert.strictEqual(wechat.structuredContent.platform, 'mini_program');
      assert.strictEqual(wechat.structuredContent.provider, 'wechat');
      assert.strictEqual(wechat.structuredContent.eventPlatform, 'mini_program');
      assertRegistrySetup(wechat, 'mini_program', 'npm', '@tracemind/mini-program');
      assertSdkGovernance(wechat, 'mini_program', 'vendor/tracemind/mini-program');
      assert.ok(wechat.structuredContent.install.includes('@tracemind/mini-program'));
      assert.ok(wechat.structuredContent.installCommands.some((step) => step.includes('provider: "wechat"')));
      assert.ok(wechat.structuredContent.filesToEdit.some((file) => file.includes('app.js')));
      assert.ok(wechat.structuredContent.initLocation.includes('App'));
      assert.ok(wechat.structuredContent.idempotencyChecks.some((check) => check.includes('@tracemind/mini-program')));
      assert.ok(wechat.structuredContent.initSnippet.includes('TraceMind.start({'));
      assert.ok(wechat.structuredContent.initSnippet.includes('projectKey: "tm_proj_mini"'));
      assert.ok(wechat.structuredContent.initSnippet.includes('provider: "wechat"'));
      assert.ok(wechat.structuredContent.sourceModel.includes('platform is mini_program'));
      assert.ok(wechat.structuredContent.sourceModel.includes('sourceType is mini_program'));
      assert.ok(wechat.structuredContent.sourceModel.includes('sourceDetails.provider'));
      assert.ok(wechat.structuredContent.autoCapturedSignals.some((signal) => signal.includes('mini program app/session start')));
      assert.ok(wechat.structuredContent.autoCapturedSignals.some((signal) => signal.includes('presence heartbeat')));
      assert.ok(wechat.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
      assert.ok(wechat.structuredContent.networkRestrictionChecks.some((check) => check.includes('wx.request')));
      assert.ok(wechat.structuredContent.verificationCommands.includes('npm test --prefix sdk/mini-program'));
      assert.ok(wechat.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(wechat.structuredContent.manualCaptureExamples.some((example) => example.includes('TraceMind.trackTap')));
      assert.ok(wechat.structuredContent.manualCaptureExample.includes('TraceMind.capture'));
      assert.ok(wechat.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('Mini Program')));
      assert.ok(wechat.structuredContent.trafficAttribution.setupExamples.some((example) => example.includes('TraceMind.setAttribution')));
      assert.strictEqual(wechat.structuredContent.tokenType, 'public_auto_capture_project_key');
      assert.deepStrictEqual(wechat.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
      assert.ok(!JSON.stringify(wechat.structuredContent).includes('tm_mcp_'));

      assert.strictEqual(alipay.structuredContent.provider, 'alipay');
      assert.ok(alipay.structuredContent.initSnippet.includes('provider: "alipay"'));
      assert.ok(alipay.structuredContent.networkRestrictionChecks.some((check) => check.includes('my.request')));
      assert.strictEqual(douyin.structuredContent.provider, 'douyin');
      assert.ok(douyin.structuredContent.networkRestrictionChecks.some((check) => check.includes('tt.request')));
      assert.strictEqual(dingtalk.structuredContent.provider, 'dingtalk');
      assert.ok(dingtalk.structuredContent.networkRestrictionChecks.some((check) => check.includes('dd.request')));
    });

    it('returns browser extension setup guidance through MCP', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const project = {
        _id: `project-browser-extension-capture-setup-${Date.now()}`,
        name: 'Browser Extension Capture Setup Project',
        projectKey: 'tm_proj_extension',
      };

      const setupTool = mcpTools(project).find((tool) => tool.name === 'tracemind.capture_setup');
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('browser_extension'));

      const extension = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'browser_extension' });
      const chromeAlias = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'chrome_extension' });
      const firefoxAlias = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'firefox_extension' });

      assert.strictEqual(extension.structuredContent.ok, true);
      assert.strictEqual(extension.structuredContent.platform, 'browser_extension');
      assert.strictEqual(extension.structuredContent.eventPlatform, 'browser_extension');
      assertRegistrySetup(extension, 'browser_extension', 'npm', '@tracemind/browser-extension');
      assertSdkGovernance(extension, 'browser_extension', 'vendor/tracemind/browser-extension');
      assert.ok(extension.structuredContent.install.includes('@tracemind/browser-extension'));
      assert.ok(extension.structuredContent.installCommands.some((step) => step.includes('popup')));
      assert.ok(extension.structuredContent.installCommands.some((step) => step.includes('background')));
      assert.ok(extension.structuredContent.filesToEdit.some((file) => file.includes('manifest.json')));
      assert.ok(extension.structuredContent.initLocation.includes('popup'));
      assert.ok(extension.structuredContent.idempotencyChecks.some((check) => check.includes('@tracemind/browser-extension')));
      assert.ok(extension.structuredContent.initSnippet.includes('TraceMind.start({'));
      assert.ok(extension.structuredContent.initSnippet.includes('projectKey: "tm_proj_extension"'));
      assert.ok(extension.structuredContent.sourceModel.includes('platform is browser_extension'));
      assert.ok(extension.structuredContent.sourceModel.includes('sourceType is browser_extension'));
      assert.ok(extension.structuredContent.sourceModel.includes('sourceDetails.browser'));
      assert.ok(extension.structuredContent.autoCapturedSignals.some((signal) => signal.includes('extension UI start')));
      assert.ok(extension.structuredContent.autoCapturedSignals.some((signal) => signal.includes('presence heartbeat')));
      assert.ok(extension.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
      assert.ok(extension.structuredContent.networkRestrictionChecks.some((check) => check.includes('host_permissions')));
      assert.ok(extension.structuredContent.verificationCommands.includes('npm test --prefix sdk/browser-extension'));
      assert.ok(extension.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(extension.structuredContent.manualCaptureExamples.some((example) => example.includes('TraceMind.trackTap')));
      assert.ok(extension.structuredContent.manualCaptureExample.includes('TraceMind.capture'));
      assert.ok(extension.structuredContent.trafficAttribution.platformNotes.some((note) => note.includes('Browser Extension')));
      assert.ok(extension.structuredContent.trafficAttribution.setupExamples.some((example) => example.includes('TraceMind.setAttribution')));
      assert.ok(extension.structuredContent.manifestPermissions.some((permission) => permission.includes('host_permissions')));
      assert.strictEqual(extension.structuredContent.tokenType, 'public_auto_capture_project_key');
      assert.deepStrictEqual(extension.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
      assert.ok(!JSON.stringify(extension.structuredContent).includes('tm_mcp_'));

      assert.strictEqual(chromeAlias.structuredContent.platform, 'browser_extension');
      assert.strictEqual(firefoxAlias.structuredContent.platform, 'browser_extension');
    });

    it('returns third-party MCP and agent skill setup snippets through MCP', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const project = {
        _id: `project-mcp-sdk-setup-${Date.now()}`,
        name: 'MCP SDK Setup Project',
        projectKey: 'tm_proj_mcp_sdk',
      };

      const setupTool = mcpTools(project).find((tool) => tool.name === 'tracemind.capture_setup');
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('mcp_node'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('mcp_python'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('agent_skill'));

      const node = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'mcp_node' });
      const python = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'mcp_python' });
      const skill = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'agent_skill' });

      assert.strictEqual(node.structuredContent.platform, 'mcp_node');
      assert.strictEqual(node.structuredContent.eventPlatform, 'server');
      assertRegistrySetup(node, 'mcp_node', 'npm', '@tracemind/mcp-node');
      assertSdkGovernance(node, 'mcp_node', 'vendor/tracemind/mcp-node');
      assert.ok(node.structuredContent.initSnippet.includes('TraceMindMCP.start(server'));
      assert.ok(node.structuredContent.initSnippet.includes('projectKey: "tm_proj_mcp_sdk"'));
      assert.ok(node.structuredContent.packageManagerNotes.some((note) => note.includes('@tracemind/mcp-node')));
      assert.ok(node.structuredContent.autoCapturedSignals.includes('MCP tool call completed'));
      assert.ok(node.structuredContent.privacyConstraints.some((constraint) => constraint.includes('tool arguments')));
      assert.ok(node.structuredContent.manualCaptureExample.includes('TraceMindMCP.capture'));
      assert.ok(node.structuredContent.sourceModel.includes('sourceType is mcp_server'));

      assert.strictEqual(python.structuredContent.platform, 'mcp_python');
      assert.strictEqual(python.structuredContent.eventPlatform, 'server');
      assertRegistrySetup(python, 'mcp_python', 'pypi', 'tracemind-mcp');
      assertSdkGovernance(python, 'mcp_python', 'vendor/tracemind_mcp');
      assert.ok(python.structuredContent.installCommands.some((step) => step.includes('pip install tracemind-mcp==')));
      assert.ok(python.structuredContent.initSnippet.includes('TraceMindMCP.start(server'));
      assert.ok(python.structuredContent.initSnippet.includes('project_key="tm_proj_mcp_sdk"'));
      assert.ok(python.structuredContent.idempotencyChecks.some((step) => step.includes('tracemind_mcp')));
      assert.ok(python.structuredContent.manualCaptureExample.includes('TraceMindMCP.capture'));

      assert.strictEqual(skill.structuredContent.platform, 'agent_skill');
      assert.strictEqual(skill.structuredContent.eventPlatform, 'server');
      assert.ok(skill.structuredContent.initSnippet.includes('TraceMindMCP.captureSkillLifecycle'));
      assert.ok(skill.structuredContent.installCommands.some((step) => step.includes('host agent runtime')));
      assert.ok(skill.structuredContent.autoCapturedSignals.includes('skill lifecycle started/completed/failed when the host exposes lifecycle hooks'));
      assert.ok(skill.structuredContent.manualCaptureWarnings.some((warning) => warning.includes('Static Skill files cannot auto-capture')));
      assert.ok(skill.structuredContent.sourceModel.includes('sourceType is agent_skill'));

      [node, python, skill].forEach((result) => {
        assert.strictEqual(result.structuredContent.tokenType, 'public_auto_capture_project_key');
        assert.deepStrictEqual(result.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
        assert.ok(result.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.validate_event_payload')));
        assert.ok(result.structuredContent.notes.some((note) => note.includes('Do not use the MCP token')));
        assert.ok(!JSON.stringify(result.structuredContent).includes('tm_mcp_'));
      });
    });

    it('returns server manual capture setup snippets through MCP', async function () {
      const { callMcpTool, mcpTools } = await import('../server/capture_routes');
      const project = {
        _id: `project-server-sdk-setup-${Date.now()}`,
        name: 'Server Manual Capture Project',
        projectKey: 'tm_proj_server_sdk',
      };

      const setupTool = mcpTools(project).find((tool) => tool.name === 'tracemind.capture_setup');
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('server_node'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('server_python'));
      assert.ok(setupTool.inputSchema.properties.platform.enum.includes('server_http'));

      const node = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'server_node' });
      const python = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'server_python' });
      const http = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'server_http' });

      assert.strictEqual(node.structuredContent.platform, 'server_node');
      assert.strictEqual(node.structuredContent.eventPlatform, 'server');
      assertRegistrySetup(node, 'server_node', 'npm', '@tracemind/server-node');
      assertSdkGovernance(node, 'server_node', 'vendor/tracemind/server-node');
      assert.ok(node.structuredContent.initSnippet.includes('TraceMindServer.start'));
      assert.ok(node.structuredContent.initSnippet.includes('projectKey: "tm_proj_server_sdk"'));
      assert.ok(node.structuredContent.manualCaptureExample.includes('TraceMindServer.capture'));
      assert.ok(node.structuredContent.sourceModel.includes('sourceType is server_app'));
      assert.deepStrictEqual(node.structuredContent.autoCapturedSignals, []);
      assert.ok(node.structuredContent.manualCaptureWarnings.some((warning) => warning.includes('manual capture only')));

      assert.strictEqual(python.structuredContent.platform, 'server_python');
      assert.strictEqual(python.structuredContent.eventPlatform, 'server');
      assertRegistrySetup(python, 'server_python', 'pypi', 'tracemind-server');
      assertSdkGovernance(python, 'server_python', 'vendor/tracemind_server');
      assert.ok(python.structuredContent.installCommands.some((step) => step.includes('pip install tracemind-server==')));
      assert.ok(python.structuredContent.initSnippet.includes('TraceMindServer.start'));
      assert.ok(python.structuredContent.initSnippet.includes('project_key="tm_proj_server_sdk"'));
      assert.ok(python.structuredContent.manualCaptureExample.includes('TraceMindServer.capture'));

      assert.strictEqual(http.structuredContent.platform, 'server_http');
      assert.strictEqual(http.structuredContent.eventPlatform, 'server');
      assert.notStrictEqual(http.structuredContent.distributionMode, 'local_source');
      assert.strictEqual(http.structuredContent.latestSdk, undefined);
      assert.strictEqual(http.structuredContent.installedSdkManifest, undefined);
      assert.strictEqual(http.structuredContent.upgradeCommands, undefined);
      assert.ok(http.structuredContent.installCommands.some((step) => step.includes('HTTP client')));
      assert.ok(http.structuredContent.payloadTemplate.projectKey === 'tm_proj_server_sdk');
      assert.strictEqual(http.structuredContent.payloadTemplate.source.type, 'server_app');
      assert.ok(http.structuredContent.manualCaptureExample.includes('/api/capture'));
      assert.ok(http.structuredContent.networkRestrictionChecks.some((check) => check.includes('egress firewall')));
      assert.ok(http.structuredContent.networkRestrictionChecks.some((check) => check.includes('Content-Type: application/json')));

      [node, python, http].forEach((result) => {
        assert.strictEqual(result.structuredContent.tokenType, 'public_auto_capture_project_key');
        assert.deepStrictEqual(result.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
        assert.ok(result.structuredContent.installCommands.length > 0);
        assert.ok(result.structuredContent.filesToEdit.length > 0);
        assert.ok(result.structuredContent.idempotencyChecks.length > 0);
        assert.ok(result.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.search_event_names')));
        assert.ok(result.structuredContent.privacyConstraints.some((constraint) => constraint.includes('request body')));
        assert.ok(!JSON.stringify(result.structuredContent).includes('tm_mcp_'));
      });
    });

    it('exposes MCP and skill event definitions through MCP', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const definitions = await callMcpTool({ _id: 'project-definitions' }, 'tracemind.event_definitions', {});
      const byType = new Map(definitions.structuredContent.eventDefinitions.map((definition) => [definition.eventType, definition]));

      assert.ok(byType.get('tool_call').platforms.includes('server'));
      assert.ok(byType.get('resource_read').typicalProperties.includes('uriScheme'));
      assert.ok(byType.get('prompt_request').typicalProperties.includes('promptName'));
      assert.ok(byType.get('skill_lifecycle').meaning.includes('Skill'));
    });

    it('exposes project identity through MCP initialize and tools/list metadata', async function () {
      const { mcpInitializeInstructions, mcpTools } = await import('../server/capture_routes');
      const projectId = `project-http-mcp-${Date.now()}`;
      const projectName = 'HTTP MCP Project';
      const project = { _id: projectId, name: projectName };
      const initializeInstructions = mcpInitializeInstructions(project);
      const tools = mcpTools(project);

      assert.ok(initializeInstructions.includes(projectName));
      assert.ok(initializeInstructions.includes(mcpServerNameForProject(project)));
      assert.deepStrictEqual(
        tools.map((tool) => tool.name).sort(),
        mcpTools().map((tool) => tool.name).sort(),
      );
      assert.ok(tools.some((tool) => (
        tool.name === 'tracemind.project_info'
        && tool.title.includes(projectName)
        && tool.description.includes(projectName)
      )));
    });

    it('reports a clear capture setup error when projectKey is missing', async function () {
      const { callMcpTool } = await import('../server/capture_routes');

      const setup = await callMcpTool({ _id: 'project-missing-key' }, 'tracemind.capture_setup', {});

      assert.strictEqual(setup.structuredContent.ok, false);
      assert.ok(setup.structuredContent.findings.some((finding) => finding.code === 'missing_project_key'));
    });
  });

  describe('UI i18n', function () {
    const requiredKeys = [
      'Language',
      'AI-native behavior intelligence',
      'Let AI agents understand',
      'real user behavior.',
      'Add one line of code and TraceMind turns clicks, paths, forms, and active time into product evidence that Codex, Claude Code, and Cursor can question through MCP.',
      '1-minute setup · public projectKey writes · independent MCP token authorization',
      'View setup docs',
      'Supported platforms: Web · iOS · macOS · Android · React Native · Hybrid (Electron / Tauri / Capacitor / Cordova) · Mini Program (WeChat / Alipay / Douyin / DingTalk) · Browser Extension (Chrome / Edge / Firefox) · Server · MCP · Agent Skill',
      'Email',
      'Send code',
      'Checking your session...',
      'Loading your console...',
      'Could not load your console.',
      'Retry',
      'Create project',
      'Project created.',
      'Recent users',
      'Recent DAU',
      'Recent devices',
      '{{count}} events',
      'Recent behavior evidence from the selected project. Showing the latest {{count}} rows.',
    ];

    it('normalizes supported UI locales and falls back to English', function () {
      assert.strictEqual(normalizeLocaleValue('zh-CN'), 'zh');
      assert.strictEqual(normalizeLocaleValue('en-US'), 'en');
      assert.strictEqual(normalizeLocaleValue('fr-FR'), 'en');
    });

    it('keeps English messages compact by relying on source-text fallback', function () {
      assert.deepStrictEqual(enMessages, {});
      assert.strictEqual(translateMessage(enMessages, 'Create project'), 'Create project');
    });

    it('ships required Chinese UI message overrides', function () {
      requiredKeys.forEach((key) => {
        assert.ok(zhMessages[key], `missing Chinese message: ${key}`);
      });
    });

    it('translates messages with fallback and interpolation', function () {
      const messages = {
        greeting: 'Hello {{name}}',
      };

      assert.strictEqual(translateMessage(messages, 'greeting', { name: 'TraceMind' }), 'Hello TraceMind');
      assert.strictEqual(translateMessage(messages, 'missing.key'), 'missing.key');
    });
  });

  describe('Console state', function () {
    it('shows the dashboard when dashboard data exists', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: { developer: { email: 'founder@example.com' } },
          userId: null,
          loggingIn: true,
          dashboardLoadError: 'network failed',
        }),
        'ready',
      );
    });

    it('keeps the login form hidden while Meteor restores the session', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: null,
          loggingIn: true,
          dashboardLoadError: '',
        }),
        'restoring-session',
      );
    });

    it('shows the login form only after the signed-out state is confirmed', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: null,
          loggingIn: false,
          dashboardLoadError: '',
        }),
        'signed-out',
      );
    });

    it('keeps the login form hidden while an authenticated dashboard loads', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: 'user-1',
          loggingIn: false,
          dashboardLoadError: '',
        }),
        'loading-dashboard',
      );
    });

    it('shows an authenticated dashboard error instead of the login form', function () {
      assert.strictEqual(
        resolveConsoleState({
          dashboard: null,
          userId: 'user-1',
          loggingIn: false,
          dashboardLoadError: 'network failed',
        }),
        'dashboard-error',
      );
    });
  });

  describe('Project console state', function () {
    it('resolves selected projects with a stable fallback', function () {
      const projects = [{ _id: 'project-a' }, { _id: 'project-b' }];

      assert.strictEqual(resolveSelectedProjectId(projects, 'project-b'), 'project-b');
      assert.strictEqual(resolveSelectedProjectId(projects, 'missing-project'), 'project-a');
      assert.strictEqual(resolveSelectedProjectId([], 'project-a'), '');
      assert.deepStrictEqual(resolveInitialProjectSummaryState(), {
        selectedProjectSummary: null,
        projectSummaryLoading: false,
        projectSummaryError: '',
      });
    });

    it('merges newly created projects into dashboard state immediately', function () {
      const dashboard = {
        rawCount: 1,
        projects: [{ _id: 'project-a', name: 'Existing' }],
      };
      const createdProject = { _id: 'project-b', name: 'Created' };

      const nextDashboard = mergeProjectIntoDashboard(dashboard, createdProject);
      const sameDashboard = mergeProjectIntoDashboard(nextDashboard, {
        _id: 'project-b',
        name: 'Created again',
      });

      assert.deepStrictEqual(nextDashboard.projects.map((project) => project.name), ['Existing', 'Created']);
      assert.deepStrictEqual(sameDashboard.projects.map((project) => project.name), ['Existing', 'Created again']);
      assert.strictEqual(sameDashboard.projects.length, 2);
      assert.strictEqual(sameDashboard.rawCount, 1);
    });

    it('rejects stale project summary responses', function () {
      const current = {
        requestId: 7,
        activeRequestId: 7,
        requestUserId: 'user-a',
        currentUserId: 'user-a',
        projectId: 'project-a',
        selectedProjectId: 'project-a',
      };

      assert.strictEqual(shouldApplyProjectSummaryResponse(current), true);
      assert.strictEqual(shouldApplyProjectSummaryResponse({ ...current, requestId: 6 }), false);
      assert.strictEqual(shouldApplyProjectSummaryResponse({ ...current, currentUserId: 'user-b' }), false);
      assert.strictEqual(shouldApplyProjectSummaryResponse({ ...current, selectedProjectId: 'project-b' }), false);
    });
  });

  it('normalizes developer emails', function () {
    assert.strictEqual(normalizeEmail('  Founder@Example.COM  '), 'founder@example.com');
  });

  it('turns click behavior into a semantic event', function () {
    const event = buildSemanticEvent({
      _id: 'raw-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      type: 'click',
      path: '/pricing',
      targetText: 'Start trial',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.strictEqual(event.title, '点击了 "Start trial"');
    assert.strictEqual(event.meaning, '用户在 /pricing 点击了 "Start trial"。');
    assert.strictEqual(event.rawBehaviorId, 'raw-1');
  });

  it('keeps identity, device, geo, and custom fields on semantic events', function () {
    const event = buildSemanticEvent({
      _id: 'raw-identity',
      projectId: 'project-1',
      sessionId: 'session-1',
      anonymousId: 'anon-1',
      userId: 'user-1',
      deviceId: 'device-1',
      deviceFingerprint: 'fp-1',
      platform: 'web',
      deviceInfo: { browser: 'Chrome', os: 'macOS' },
      ip: '203.0.113.10',
      geo: { country: 'US', region: 'CA', city: 'San Francisco', source: 'headers' },
      type: 'custom',
      eventName: 'plan_selected',
      path: '/pricing',
      target: {
        tag: 'BUTTON',
        text: 'More',
        path: 'main:nth-of-type(1)>section:nth-of-type(2)>button:nth-of-type(1)',
      },
      targetHash: 'tm_target_abc123',
      targetIdentity: {
        key: 'target:data-testid:pricing-more',
        source: 'data-testid',
        confidence: 'high',
      },
      identitySource: 'data-testid',
      identityConfidence: 'high',
      actionKey: 'web:/pricing:click:target:data-testid:pricing-more',
      properties: { plan: 'pro', amount: 29 },
      context: { source: 'manual' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    assert.strictEqual(event.userId, 'user-1');
    assert.strictEqual(event.anonymousId, 'anon-1');
    assert.strictEqual(event.deviceId, 'device-1');
    assert.strictEqual(event.deviceFingerprint, 'fp-1');
    assert.strictEqual(event.platform, 'web');
    assert.deepStrictEqual(event.deviceInfo, { browser: 'Chrome', os: 'macOS' });
    assert.deepStrictEqual(event.geo, { country: 'US', region: 'CA', city: 'San Francisco', source: 'headers' });
    assert.strictEqual(event.eventName, 'plan_selected');
    assert.deepStrictEqual(event.target, {
      tag: 'BUTTON',
      text: 'More',
      path: 'main:nth-of-type(1)>section:nth-of-type(2)>button:nth-of-type(1)',
    });
    assert.strictEqual(event.targetHash, 'tm_target_abc123');
    assert.deepStrictEqual(event.targetIdentity, {
      key: 'target:data-testid:pricing-more',
      source: 'data-testid',
      confidence: 'high',
    });
    assert.strictEqual(event.identitySource, 'data-testid');
    assert.strictEqual(event.identityConfidence, 'high');
    assert.strictEqual(event.actionKey, 'web:/pricing:click:target:data-testid:pricing-more');
    assert.deepStrictEqual(event.properties, { plan: 'pro', amount: 29 });
    assert.deepStrictEqual(event.context, { source: 'manual' });
  });

  it('builds target-specific queries for repeated labels on the same page', function () {
    assert.deepStrictEqual(
      buildEventQuery('project-1', {
        path: '/settings',
        eventType: 'click',
        targetHash: 'tm_target_more_footer',
        actionKey: 'web:/settings:click:target:data-testid:footer-more',
      }),
      {
        projectId: 'project-1',
        eventType: 'click',
        path: '/settings',
        targetHash: 'tm_target_more_footer',
        actionKey: 'web:/settings:click:target:data-testid:footer-more',
      },
    );

    assert.deepStrictEqual(
      buildRawBehaviorQuery('project-1', {
        path: '/settings',
        eventType: 'click',
        targetHash: 'tm_target_more_footer',
        actionKey: 'web:/settings:click:target:data-testid:footer-more',
      }),
      {
        projectId: 'project-1',
        type: 'click',
        path: '/settings',
        targetHash: 'tm_target_more_footer',
        actionKey: 'web:/settings:click:target:data-testid:footer-more',
      },
    );
  });

  it('summarizes semantic event counts, paths, and action keys', function () {
    const summary = summarizeSemanticEvents([
      { eventType: 'click', path: '/pricing', actionKey: 'web:/pricing:click:target:data-testid:start-trial', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T01:00:00.000Z') },
      { eventType: 'click', path: '/pricing', actionKey: 'web:/pricing:click:target:data-testid:start-trial', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T02:00:00.000Z') },
      { eventType: 'page_view', path: '/', anonymousId: 'anon-1', deviceFingerprint: 'fp-1', occurredAt: new Date('2026-05-06T03:00:00.000Z') },
    ]);

    assert.deepStrictEqual(summary.topEvents[0], { eventType: 'click', count: 2 });
    assert.deepStrictEqual(summary.topPaths[0], { path: '/pricing', count: 2 });
    assert.deepStrictEqual(summary.topActions[0], { actionKey: 'web:/pricing:click:target:data-testid:start-trial', count: 2 });
    assert.strictEqual(summary.uniqueUsers, 2);
    assert.strictEqual(summary.uniqueDevices, 2);
    assert.deepStrictEqual(summary.dailyActiveUsers[0], { date: '2026-05-06', count: 2 });
  });

  it('summarizes project health with rolling 24 hour windows and new-user retention cohorts', function () {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const health = summarizeProjectHealth({
      events: [
        { eventType: 'page_view', eventName: 'page_view', userId: 'current-user', deviceInfo: { platform: 'MacIntel' }, geo: { country: 'US' }, path: '/', occurredAt: new Date('2026-05-09T11:00:00.000Z') },
        { eventType: 'click', eventName: 'cta_clicked', anonymousId: 'new-current', deviceInfo: { platform: 'iPhone' }, geo: { country: 'CN' }, path: '/setup', occurredAt: new Date('2026-05-09T10:00:00.000Z') },
        { eventType: 'tool_call', eventName: 'tool_call', userId: 'current-user', properties: { status: 'failed' }, path: '/mcp', occurredAt: new Date('2026-05-09T09:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', userId: 'returning-d2', path: '/', occurredAt: new Date('2026-05-09T08:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', userId: 'returning-d7', path: '/', occurredAt: new Date('2026-05-09T07:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', userId: 'current-user', path: '/', occurredAt: new Date('2026-05-08T10:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', userId: 'previous-only', path: '/', occurredAt: new Date('2026-05-08T09:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', userId: 'returning-d2', path: '/', occurredAt: new Date('2026-05-08T08:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', userId: 'returning-d7', path: '/', occurredAt: new Date('2026-05-02T13:00:00.000Z') },
      ],
      presenceSessions: [
        { presenceId: 'current-1', userId: 'current-user', path: '/', sourceKey: 'web', sourceLabel: 'Web', startedAt: new Date('2026-05-09T10:00:00.000Z'), lastSeenAt: new Date('2026-05-09T10:30:00.000Z'), activeDurationMs: 300000 },
        { presenceId: 'current-2', anonymousId: 'new-current', path: '/setup', sourceKey: 'web', sourceLabel: 'Web', startedAt: new Date('2026-05-09T11:00:00.000Z'), lastSeenAt: new Date('2026-05-09T11:15:00.000Z'), activeDurationMs: 120000 },
        { presenceId: 'previous-1', userId: 'previous-only', path: '/', sourceKey: 'web', sourceLabel: 'Web', startedAt: new Date('2026-05-08T10:00:00.000Z'), lastSeenAt: new Date('2026-05-08T10:10:00.000Z'), activeDurationMs: 60000 },
      ],
      now,
    });

    assert.strictEqual(health.status, 'needs_attention');
    assert.strictEqual(health.current.activeUsers, 4);
    assert.strictEqual(health.previous.activeUsers, 3);
    assert.strictEqual(health.current.newUsers, 1);
    assert.strictEqual(health.current.eventCount, 5);
    assert.strictEqual(health.previous.eventCount, 3);
    assert.strictEqual(health.current.sessionCount, 2);
    assert.strictEqual(health.previous.sessionCount, 1);
    assert.strictEqual(health.current.averageActiveDurationMs, 105000);
    assert.strictEqual(health.current.averageSessionEvents, 2.5);
    assert.deepStrictEqual(health.current.retention.d2, { sampleSize: 3, retainedUsers: 2, rate: 2 / 3 });
    assert.deepStrictEqual(health.current.retention.d3, { sampleSize: 0, retainedUsers: 0, rate: null });
    assert.deepStrictEqual(health.current.retention.d7, { sampleSize: 1, retainedUsers: 1, rate: 1 });
    assert.deepStrictEqual(health.current.topEvents[0], { label: 'page_view', count: 3 });
    assert.deepStrictEqual(health.current.userRegions[0], { label: 'US', count: 1 });
    assert.ok(health.attentionItems.some((item) => item.code === 'failure_events_increased'));
    assert.ok(health.attentionSummary.includes('近 24h'));
  });

  it('surfaces SDK upgrade findings from reported SDK content hashes', function () {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const swiftLatest = latestSdkForSetup('swift');
    const serverLatest = latestSdkForSetup('server_node');
    const oldHash = `sha256:${'0'.repeat(64)}`;
    const health = summarizeProjectHealth({
      events: [
        {
          eventType: 'page_view',
          eventName: 'page_view',
          userId: 'ios-user',
          platform: 'ios',
          sourceType: 'ios',
          sourceKey: 'com.example.ios',
          sourceDetails: {
            framework: 'swift',
            sdkVersion: swiftLatest.displayVersion,
            sdkContentHash: oldHash,
          },
          path: '/',
          occurredAt: new Date('2026-05-09T11:00:00.000Z'),
        },
        {
          eventType: 'custom',
          eventName: 'job_completed',
          userId: 'server-user',
          platform: 'server',
          sourceType: 'server_app',
          sourceKey: 'billing-api',
          sourceDetails: {
            language: 'javascript',
            sdkVersion: serverLatest.displayVersion,
            sdkContentHash: serverLatest.contentHash,
          },
          path: '/jobs',
          occurredAt: new Date('2026-05-09T11:10:00.000Z'),
        },
        {
          eventType: 'page_view',
          eventName: 'page_view',
          userId: 'web-user',
          platform: 'web',
          sourceType: 'web',
          sourceKey: 'app.example.com',
          sourceDetails: {},
          path: '/',
          occurredAt: new Date('2026-05-09T11:20:00.000Z'),
        },
      ],
      presenceSessions: [
        {
          presenceId: 'android-unknown',
          deviceId: 'android-device',
          platform: 'android',
          sourceType: 'android',
          sourceKey: 'com.example.android',
          sourceDetails: { framework: 'kotlin' },
          path: '/',
          startedAt: new Date('2026-05-09T11:30:00.000Z'),
          lastSeenAt: new Date('2026-05-09T11:40:00.000Z'),
          activeDurationMs: 120000,
        },
        {
          presenceId: 'http-server',
          deviceId: 'server-http',
          platform: 'server',
          sourceType: 'server_app',
          sourceKey: 'raw-http',
          sourceDetails: { language: 'http' },
          path: '/webhook',
          startedAt: new Date('2026-05-09T11:45:00.000Z'),
          lastSeenAt: new Date('2026-05-09T11:50:00.000Z'),
          activeDurationMs: 0,
        },
      ],
      now,
    });

    assert.ok(health.sdkUpgradeFindings.some((finding) => finding.code === 'sdk_update_available' && finding.sdkName === 'swift'));
    assert.ok(health.sdkUpgradeFindings.some((finding) => finding.code === 'sdk_version_unknown' && finding.sdkName === 'android'));
    assert.ok(!health.sdkUpgradeFindings.some((finding) => finding.sourceKey === 'app.example.com'));
    assert.ok(!health.sdkUpgradeFindings.some((finding) => finding.sourceKey === 'raw-http'));
  });

  it('formats daily report health attention copy by selected day', function () {
    const health = summarizeProjectHealthFromDailyReports({
      currentReport: {
        reportDate: '2026-05-12',
        sourceWindow: {
          startAt: new Date('2026-05-11T16:00:00.000Z'),
          endAt: new Date('2026-05-12T16:00:00.000Z'),
        },
        current: {
          activeUsers: 1,
          eventCount: 1,
          sessionCount: 1,
          failureEventCount: 0,
          lastEventAt: new Date('2026-05-12T15:30:00.000Z'),
        },
      },
      previousReport: {
        reportDate: '2026-05-11',
        sourceWindow: {
          startAt: new Date('2026-05-10T16:00:00.000Z'),
          endAt: new Date('2026-05-11T16:00:00.000Z'),
        },
        current: {
          activeUsers: 4,
          eventCount: 10,
          sessionCount: 4,
          failureEventCount: 0,
        },
      },
    });
    const messages = health.attentionItems.map((item) => item.message);

    assert.strictEqual(health.window.granularity, 'day');
    assert.strictEqual(health.attentionSummary, '所选日期活跃用户较前一天下降 75%。');
    assert.ok(messages.some((message) => message === '所选日期用户行为事件较前一天下降 90%。'));
    assert.ok(messages.every((message) => !message.includes('24h')));
  });

  it('uses strict active duration for health time metrics', function () {
    const health = summarizeProjectHealth({
      events: [
        { eventType: 'page_view', userId: 'user-1', occurredAt: new Date('2026-05-09T01:00:00.000Z') },
      ],
      presenceSessions: [
        { presenceId: 'active', userId: 'user-1', path: '/docs', startedAt: new Date('2026-05-09T01:00:00.000Z'), lastSeenAt: new Date('2026-05-09T02:00:00.000Z'), durationMs: 3600000, activeDurationMs: 600000 },
        { presenceId: 'legacy', userId: 'user-2', path: '/legacy', startedAt: new Date('2026-05-09T03:00:00.000Z'), lastSeenAt: new Date('2026-05-09T04:00:00.000Z'), durationMs: 3600000 },
        { presenceId: 'spanning', userId: 'user-3', path: '/spanning', startedAt: new Date('2026-05-08T11:59:30.000Z'), lastSeenAt: new Date('2026-05-08T12:00:30.000Z'), durationMs: 60000, activeDurationMs: 120000 },
      ],
      now: new Date('2026-05-09T12:00:00.000Z'),
    });

    assert.strictEqual(health.current.totalDurationMs, 630000);
    assert.strictEqual(health.current.averageActiveDurationMs, 210000);
    assert.deepStrictEqual(health.current.topDurationUsers[0], { label: 'user-1', durationMs: 600000 });
    assert.deepStrictEqual(health.current.topDurationPaths[0], { path: '/docs', durationMs: 600000, sessions: 1 });
  });

  it('uses stable actor ids for presence health without counting session ids as users', function () {
    const health = summarizeProjectHealth({
      events: [],
      presenceSessions: [
        { presenceId: 'presence-1', sessionId: 'session-1', deviceId: 'device-1', path: '/', startedAt: new Date('2026-05-09T11:00:00.000Z'), lastSeenAt: new Date('2026-05-09T11:00:00.000Z'), activeDurationMs: 0 },
        { presenceId: 'presence-2', sessionId: 'session-2', deviceId: 'device-1', path: '/', startedAt: new Date('2026-05-09T11:30:00.000Z'), lastSeenAt: new Date('2026-05-09T11:45:00.000Z'), activeDurationMs: 120000 },
      ],
      now: new Date('2026-05-09T12:00:00.000Z'),
    });

    assert.strictEqual(health.current.activeUsers, 1);
    assert.strictEqual(health.current.sessionCount, 2);
    assert.deepStrictEqual(health.current.topDurationUsers[0], { label: 'device-1', durationMs: 120000 });
  });

  it('summarizes recent online activity in 5 minute buckets for the dashboard', function () {
    assert.strictEqual(typeof TraceMindApi.summarizeRecentOnlineActivity, 'function');

    const now = new Date('2026-05-09T12:00:00.000Z');
    const recentOnline = TraceMindApi.summarizeRecentOnlineActivity({
      now,
      events: [
        { eventType: 'page_view', eventName: 'page_view', userId: 'user-1', geo: { country: 'US' }, occurredAt: new Date('2026-05-09T11:35:00.000Z') },
        { eventType: 'click', eventName: 'cta_clicked', userId: 'user-1', geo: { country: 'US' }, occurredAt: new Date('2026-05-09T11:45:00.000Z') },
        { eventType: 'custom', eventName: 'signup_completed', anonymousId: 'anon-2', geo: { country: 'CN' }, occurredAt: new Date('2026-05-09T11:55:00.000Z') },
        { eventType: 'click', eventName: 'cta_clicked', userId: 'user-1', geo: { country: 'US' }, occurredAt: new Date('2026-05-09T11:56:00.000Z') },
        { eventType: 'click', eventName: 'cta_clicked', userId: 'old-user', geo: { country: 'CA' }, occurredAt: new Date('2026-05-09T11:20:00.000Z') },
      ],
      presenceSessions: [
        { presenceId: 'presence-1', userId: 'user-1', path: '/pricing', geo: { country: 'US' }, startedAt: new Date('2026-05-09T11:32:00.000Z'), lastSeenAt: new Date('2026-05-09T11:47:00.000Z'), activeDurationMs: 600000 },
        { presenceId: 'presence-2', anonymousId: 'anon-2', path: '/signup', geo: { country: 'CN' }, startedAt: new Date('2026-05-09T11:50:00.000Z'), lastSeenAt: new Date('2026-05-09T11:59:00.000Z'), activeDurationMs: 240000 },
        { presenceId: 'presence-3', deviceId: 'device-3', path: '/pricing', geo: { country: 'US' }, startedAt: new Date('2026-05-09T11:58:00.000Z'), lastSeenAt: new Date('2026-05-09T12:00:00.000Z'), activeDurationMs: 60000 },
        { presenceId: 'presence-old', userId: 'old-user', path: '/old', geo: { country: 'CA' }, startedAt: new Date('2026-05-09T11:00:00.000Z'), lastSeenAt: new Date('2026-05-09T11:20:00.000Z'), activeDurationMs: 1200000 },
      ],
    });

    assert.strictEqual(recentOnline.totalOnlineUsers, 3);
    assert.strictEqual(recentOnline.buckets.length, 6);
    assert.deepStrictEqual(
      recentOnline.buckets.map((bucket) => bucket.onlineUsers),
      [1, 1, 1, 1, 1, 2],
    );
    assert.deepStrictEqual(recentOnline.topRegions, [
      { label: 'US', count: 2 },
      { label: 'CN', count: 1 },
    ]);
    assert.deepStrictEqual(recentOnline.topDurationPaths, [
      { path: '/pricing', durationMs: 660000, sessions: 2 },
      { path: '/signup', durationMs: 240000, sessions: 1 },
    ]);
    assert.deepStrictEqual(recentOnline.topEvents, [
      { label: 'cta_clicked', count: 2 },
      { label: 'page_view', count: 1 },
      { label: 'signup_completed', count: 1 },
    ]);
  });

  it('summarizes top bounce pages by session-level presence and interactions', function () {
    const health = summarizeProjectHealth({
      events: [
        { eventType: 'page_view', eventName: 'page_view', sessionId: 'pricing-bounce-1', anonymousId: 'anon-1', path: '/pricing', occurredAt: new Date('2026-05-09T09:00:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', sessionId: 'pricing-bounce-2', anonymousId: 'anon-2', path: '/pricing', occurredAt: new Date('2026-05-09T09:10:00.000Z') },
        { eventType: 'page_view', eventName: 'page_view', sessionId: 'pricing-click', anonymousId: 'anon-3', path: '/pricing', occurredAt: new Date('2026-05-09T09:20:00.000Z') },
        { eventType: 'click', eventName: 'cta_clicked', sessionId: 'pricing-click', anonymousId: 'anon-3', path: '/pricing', occurredAt: new Date('2026-05-09T09:20:10.000Z') },
        { eventType: 'page_view', eventName: 'page_view', sessionId: 'multi-page', anonymousId: 'anon-4', path: '/home', occurredAt: new Date('2026-05-09T09:30:00.000Z') },
        { eventType: 'route_change', eventName: 'route_change', sessionId: 'multi-page', anonymousId: 'anon-4', path: '/checkout', occurredAt: new Date('2026-05-09T09:31:00.000Z') },
      ],
      presenceSessions: [
        { presenceId: 'pricing-presence-1', sessionId: 'pricing-bounce-1', anonymousId: 'anon-1', path: '/pricing', startedAt: new Date('2026-05-09T09:00:00.000Z'), lastSeenAt: new Date('2026-05-09T09:00:10.000Z'), activeDurationMs: 10000 },
        { presenceId: 'pricing-presence-2', sessionId: 'pricing-bounce-2', anonymousId: 'anon-2', path: '/pricing', startedAt: new Date('2026-05-09T09:10:00.000Z'), lastSeenAt: new Date('2026-05-09T09:10:20.000Z'), activeDurationMs: 5000 },
        { presenceId: 'pricing-presence-3', sessionId: 'pricing-click', anonymousId: 'anon-3', path: '/pricing', startedAt: new Date('2026-05-09T09:20:00.000Z'), lastSeenAt: new Date('2026-05-09T09:20:40.000Z'), activeDurationMs: 20000 },
        { presenceId: 'home-presence', sessionId: 'multi-page', anonymousId: 'anon-4', path: '/home', startedAt: new Date('2026-05-09T09:30:00.000Z'), lastSeenAt: new Date('2026-05-09T09:31:00.000Z'), activeDurationMs: 30000 },
        { presenceId: 'checkout-presence', sessionId: 'multi-page', anonymousId: 'anon-4', path: '/checkout', startedAt: new Date('2026-05-09T09:31:00.000Z'), lastSeenAt: new Date('2026-05-09T09:32:00.000Z'), activeDurationMs: 30000 },
        { presenceId: 'legacy-presence', path: '/legacy', startedAt: new Date('2026-05-09T10:00:00.000Z'), lastSeenAt: new Date('2026-05-09T10:00:05.000Z') },
        { presenceId: 'spanning-presence', sessionId: 'spanning-bounce', path: '/spanning', startedAt: new Date('2026-05-08T11:30:00.000Z'), lastSeenAt: new Date('2026-05-08T12:30:00.000Z'), activeDurationMs: 120000 },
      ],
      now: new Date('2026-05-09T12:00:00.000Z'),
    });

    assert.deepStrictEqual(health.current.topBouncePages, [
      { path: '/legacy', sessions: 1, bounces: 1, bounceRate: 1, averageBounceDurationMs: 0 },
      { path: '/spanning', sessions: 1, bounces: 1, bounceRate: 1, averageBounceDurationMs: 120000 },
      { path: '/pricing', sessions: 3, bounces: 2, bounceRate: 2 / 3, averageBounceDurationMs: 7500 },
    ]);
  });

  it('summarizes privacy-safe traffic attribution by visit', function () {
    const health = summarizeProjectHealth({
      events: [
        {
          eventType: 'page_view',
          eventName: 'page_view',
          sessionId: 'github-session',
          anonymousId: 'anon-github',
          path: '/pricing',
          attribution: {
            source: 'github',
            medium: 'social',
            campaign: 'launch-week',
            landingPath: '/pricing',
            referrerType: 'social',
          },
          occurredAt: new Date('2026-05-09T09:00:00.000Z'),
        },
        {
          eventType: 'click',
          eventName: 'click',
          sessionId: 'github-session',
          anonymousId: 'anon-github',
          path: '/pricing',
          attribution: {
            source: 'github',
            medium: 'social',
            campaign: 'launch-week',
            landingPath: '/pricing',
            referrerType: 'social',
          },
          occurredAt: new Date('2026-05-09T09:01:00.000Z'),
        },
        {
          eventType: 'page_view',
          eventName: 'page_view',
          sessionId: 'direct-session',
          anonymousId: 'anon-direct',
          path: '/',
          attribution: {
            source: 'direct',
            medium: 'direct',
            landingPath: '/',
            referrerType: 'direct',
          },
          occurredAt: new Date('2026-05-09T10:00:00.000Z'),
        },
      ],
      presenceSessions: [
        {
          presenceId: 'github-presence',
          sessionId: 'github-session',
          anonymousId: 'anon-github',
          path: '/pricing',
          attribution: {
            source: 'github',
            medium: 'social',
            campaign: 'launch-week',
            landingPath: '/pricing',
            referrerType: 'social',
          },
          startedAt: new Date('2026-05-09T09:00:00.000Z'),
          lastSeenAt: new Date('2026-05-09T09:02:00.000Z'),
          activeDurationMs: 60000,
        },
        {
          presenceId: 'direct-presence',
          sessionId: 'direct-session',
          anonymousId: 'anon-direct',
          path: '/',
          attribution: {
            source: 'direct',
            medium: 'direct',
            landingPath: '/',
            referrerType: 'direct',
          },
          startedAt: new Date('2026-05-09T10:00:00.000Z'),
          lastSeenAt: new Date('2026-05-09T10:01:00.000Z'),
          activeDurationMs: 30000,
        },
      ],
      now: new Date('2026-05-09T12:00:00.000Z'),
    });

    assert.deepStrictEqual(health.current.trafficSources, [
      { label: 'direct', count: 1 },
      { label: 'github', count: 1 },
    ]);
    assert.deepStrictEqual(health.current.trafficMediums, [
      { label: 'direct', count: 1 },
      { label: 'social', count: 1 },
    ]);
    assert.deepStrictEqual(health.current.trafficCampaigns, [
      { label: 'launch-week', count: 1 },
    ]);
    assert.deepStrictEqual(health.current.trafficLandingPaths, [
      { path: '/', count: 1 },
      { path: '/pricing', count: 1 },
    ]);
  });

  it('normalizes native traffic attribution without preserving full URLs or identifiers', function () {
    assert.deepStrictEqual(TraceMindApi.normalizeAttribution({
      source: 'com.twitter.android',
      medium: 'app_link',
      campaign: 'launch-week',
      content: 'invite-card',
      referrerDomain: 'twitter.com',
      referrerType: 'external',
      landingPath: '/invite?code=secret',
      gclidPresent: true,
      fbclidPresent: true,
      clickId: 'secret-click',
      email: 'user@example.com',
      fullUrl: 'https://example.com/invite?token=secret',
    }), {
      source: 'com.twitter.android',
      medium: 'app_link',
      campaign: 'launch-week',
      content: 'invite-card',
      referrerDomain: 'twitter.com',
      referrerType: 'external',
      landingPath: '/invite',
      gclidPresent: true,
      fbclidPresent: true,
    });
  });

  it('normalizes capture sources with cross-platform source fields', function () {
    const sdkContentHash = `sha256:${'a'.repeat(64)}`;
    assert.deepStrictEqual(
      normalizeCaptureSource({
        source: {
          type: 'web',
          url: 'https://app.example.com/pricing?plan=pro',
          referrer: 'https://google.com/search?q=app',
        },
      }),
      {
        sourceType: 'web',
        sourceKey: 'app.example.com',
        sourceLabel: 'app.example.com',
        sourceDetails: {
          origin: 'https://app.example.com',
          path: '/pricing?plan=pro',
          referrer: 'https://google.com/search?q=app',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource(
        {
          platform: 'web',
          source: { url: 'https://spoofed.example/pricing?plan=pro' },
        },
        { origin: 'https://fallback.example.org', referer: 'https://fallback.example.org/docs' },
      ),
      {
        sourceType: 'web',
        sourceKey: 'fallback.example.org',
        sourceLabel: 'fallback.example.org',
        sourceDetails: {
          origin: 'https://fallback.example.org',
          path: '/',
          referrer: 'https://fallback.example.org/docs',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource(
        {
          platform: 'web',
          source: { url: 'https://spoofed.example/pricing?plan=pro' },
        },
        { referer: 'https://referrer.example.org/docs' },
      ),
      {
        sourceType: 'web',
        sourceKey: 'referrer.example.org',
        sourceLabel: 'referrer.example.org',
        sourceDetails: {
          origin: 'https://referrer.example.org',
          path: '/docs',
          referrer: 'https://referrer.example.org/docs',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'web',
        source: {
          url: 'https://app.example.com/webview',
          details: {
            framework: 'Capacitor',
            token: 'do-not-store',
            requestBody: 'do-not-store',
          },
        },
      }),
      {
        sourceType: 'web',
        sourceKey: 'app.example.com',
        sourceLabel: 'app.example.com',
        sourceDetails: {
          origin: 'https://app.example.com',
          path: '/webview',
          referrer: '',
          framework: 'capacitor',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'web',
        source: { url: 'https://app.example.com/webview' },
        sourceDetails: {
          framework: 'Cordova',
          headers: { authorization: 'do-not-store' },
        },
      }),
      {
        sourceType: 'web',
        sourceKey: 'app.example.com',
        sourceLabel: 'app.example.com',
        sourceDetails: {
          origin: 'https://app.example.com',
          path: '/webview',
          referrer: '',
          framework: 'cordova',
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'ios',
        source: {
          key: 'com.example.app',
          label: 'Example iOS',
          details: {
            framework: 'swift',
            sdkVersion: '0.1.0',
            sdkContentHash,
            token: 'do-not-store',
          },
        },
      }),
      {
        sourceType: 'ios',
        sourceKey: 'com.example.app',
        sourceLabel: 'Example iOS',
        sourceDetails: {
          framework: 'swift',
          sdkVersion: '0.1.0',
          sdkContentHash,
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({ platform: 'macos', source: { key: 'com.example.mac', label: 'Example macOS' } }),
      {
        sourceType: 'macos',
        sourceKey: 'com.example.mac',
        sourceLabel: 'Example macOS',
        sourceDetails: {},
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'server',
        source: {
          type: 'mcp_server',
          key: 'docs-mcp',
          label: 'Docs MCP',
          details: { language: 'javascript', runtime: 'node', sdkVersion: '0.1.0', sdkContentHash },
        },
      }),
      {
        sourceType: 'mcp_server',
        sourceKey: 'docs-mcp',
        sourceLabel: 'Docs MCP',
        sourceDetails: { language: 'javascript', runtime: 'node', sdkVersion: '0.1.0', sdkContentHash },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'server',
        source: {
          type: 'agent_skill',
          key: 'docs-indexer',
          label: 'Docs Indexer Skill',
          details: { version: '1.2.0' },
        },
      }),
      {
        sourceType: 'agent_skill',
        sourceKey: 'docs-indexer',
        sourceLabel: 'Docs Indexer Skill',
        sourceDetails: { version: '1.2.0' },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'mini_program',
        source: {
          type: 'mini_program',
          appId: 'wx123',
          label: 'Example Mini Program',
          details: {
            provider: 'wechat',
            sdkVersion: '0.1.0',
            sdkContentHash,
            token: 'do-not-store',
          },
        },
      }),
      {
        sourceType: 'mini_program',
        sourceKey: 'wx123',
        sourceLabel: 'Example Mini Program',
        sourceDetails: { provider: 'wechat', sdkVersion: '0.1.0', sdkContentHash },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'mini_program',
        sourceKey: 'configured-mini-source',
        sourceDetails: {
          provider: 'alipay',
          sdkVersion: '0.1.0',
          sdkContentHash,
          requestBody: 'do-not-store',
        },
      }),
      {
        sourceType: 'mini_program',
        sourceKey: 'configured-mini-source',
        sourceLabel: 'configured-mini-source',
        sourceDetails: { provider: 'alipay', sdkVersion: '0.1.0', sdkContentHash },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'browser_extension',
        source: {
          type: 'browser_extension',
          extensionId: 'abc123',
          label: 'Example Extension',
          details: {
            browser: 'chrome',
            manifestVersion: 3,
            runtimeContext: 'popup',
            sdkVersion: '0.1.0',
            sdkContentHash,
            tabUrl: 'https://example.com/page?token=secret',
            token: 'do-not-store',
          },
        },
      }),
      {
        sourceType: 'browser_extension',
        sourceKey: 'abc123',
        sourceLabel: 'Example Extension',
        sourceDetails: {
          browser: 'chrome',
          manifestVersion: '3',
          runtimeContext: 'popup',
          sdkVersion: '0.1.0',
          sdkContentHash,
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'browser_extension',
        sourceKey: 'configured-extension-source',
        sourceDetails: {
          browser: 'firefox',
          manifestVersion: '3',
          runtimeContext: 'background',
          sdkVersion: '0.1.0',
          sdkContentHash,
          cookies: 'do-not-store',
        },
      }),
      {
        sourceType: 'browser_extension',
        sourceKey: 'configured-extension-source',
        sourceLabel: 'configured-extension-source',
        sourceDetails: {
          browser: 'firefox',
          manifestVersion: '3',
          runtimeContext: 'background',
          sdkVersion: '0.1.0',
          sdkContentHash,
        },
      },
    );

    assert.deepStrictEqual(
      normalizeCaptureSource({
        platform: 'browser_extension',
        source: {
          type: 'browser_extension',
          extensionId: 'content-script-extension',
          details: {
            browser: 'chrome',
            manifestVersion: '3',
            runtimeContext: 'content_script',
            sdkVersion: '0.1.0',
            sdkContentHash,
            tabUrl: 'https://example.com/account?token=secret',
            pageContent: 'do-not-store',
          },
        },
      }),
      {
        sourceType: 'browser_extension',
        sourceKey: 'content-script-extension',
        sourceLabel: 'content-script-extension',
        sourceDetails: {
          browser: 'chrome',
          manifestVersion: '3',
          runtimeContext: 'content_script',
          sdkVersion: '0.1.0',
          sdkContentHash,
        },
      },
    );
  });

  it('summarizes raw behavior sources and marks blocked sources', function () {
    const blockedSources = [
      {
        sourceType: 'web',
        sourceKey: 'evil.example',
        sourceLabel: 'evil.example',
        reason: 'Not our app',
        blockedAt: new Date('2026-05-06T04:00:00.000Z'),
      },
      {
        sourceType: 'web',
        sourceKey: 'old.example',
        sourceLabel: 'old.example',
        reason: 'Old abuse',
        blockedAt: new Date('2026-05-06T05:00:00.000Z'),
      },
    ];
    const sources = summarizeBehaviorSources([
      { sourceType: 'web', sourceKey: 'app.example.com', sourceLabel: 'app.example.com', occurredAt: new Date('2026-05-06T01:00:00.000Z') },
      { sourceType: 'web', sourceKey: 'app.example.com', sourceLabel: 'app.example.com', occurredAt: new Date('2026-05-06T02:00:00.000Z') },
      { sourceType: 'web', sourceKey: 'evil.example', sourceLabel: 'evil.example', occurredAt: new Date('2026-05-06T03:00:00.000Z') },
    ], blockedSources);

    assert.deepStrictEqual(sources, [
      {
        sourceType: 'web',
        sourceKey: 'app.example.com',
        sourceLabel: 'app.example.com',
        count: 2,
        lastSeenAt: new Date('2026-05-06T02:00:00.000Z'),
        blocked: false,
      },
      {
        sourceType: 'web',
        sourceKey: 'evil.example',
        sourceLabel: 'evil.example',
        count: 1,
        lastSeenAt: new Date('2026-05-06T03:00:00.000Z'),
        blocked: true,
        reason: 'Not our app',
        blockedAt: new Date('2026-05-06T04:00:00.000Z'),
      },
      {
        sourceType: 'web',
        sourceKey: 'old.example',
        sourceLabel: 'old.example',
        count: 0,
        lastSeenAt: null,
        blocked: true,
        reason: 'Old abuse',
        blockedAt: new Date('2026-05-06T05:00:00.000Z'),
      },
    ]);

    assert.strictEqual(isSourceBlocked({ blockedSources }, { sourceType: 'web', sourceKey: 'evil.example' }), true);
    assert.strictEqual(isSourceBlocked({ blockedSources }, { sourceType: 'web', sourceKey: 'app.example.com' }), false);
  });

  it('summarizes capture delivery reports for project health', function () {
    const reports = [
      {
        droppedOldest: 2,
        droppedStorage: 1,
        retryCount: 3,
        coalescedPresence: 4,
        maxQueueDepth: 12,
        sent: 10,
        accepted: 9,
        ignored: 1,
        lastError: '',
        createdAt: new Date('2026-05-09T10:00:00.000Z'),
      },
      {
        droppedOldest: 1,
        droppedStorage: 0,
        retryCount: 1,
        coalescedPresence: 0,
        maxQueueDepth: 20,
        sent: 0,
        accepted: 0,
        ignored: 0,
        lastError: 'network_error',
        createdAt: new Date('2026-05-09T10:05:00.000Z'),
      },
    ];

    assert.deepStrictEqual(summarizeCaptureDelivery(reports), {
      reportCount: 2,
      sent: 10,
      accepted: 9,
      ignored: 1,
      droppedOldest: 3,
      droppedStorage: 1,
      retryCount: 4,
      coalescedPresence: 4,
      maxQueueDepth: 20,
      failedFlushes: 1,
      lastSuccessfulFlushAt: new Date('2026-05-09T10:00:00.000Z'),
      lastFailedFlushAt: new Date('2026-05-09T10:05:00.000Z'),
    });
  });

  if (Meteor.isServer) {
    let ingestCapturePayload;
    let ingestPresencePayload;
    let computeProjectDailyReport;
    let ensureTraceMindIndexes;
    let resolveProjectDailyHealth;
    let resolveProjectByMcpToken;
    let extractSemanticEventsOnce;
    let configureProductUsageInstrumentationForTest;
    let drainProductUsageInstrumentationForTest;
    let resetProductUsageInstrumentationForTest;

    before(async function () {
      const captureRoutes = await import('../server/capture_routes');
      const dailyReports = await import('../server/daily_reports');
      await import('../server/tracemind_publications');
      const methods = await import('../server/tracemind_methods');
      const semanticJobs = await import('../server/semantic_jobs');
      ingestCapturePayload = captureRoutes.ingestCapturePayload;
      ingestPresencePayload = captureRoutes.ingestPresencePayload;
      computeProjectDailyReport = dailyReports.computeProjectDailyReport;
      ensureTraceMindIndexes = dailyReports.ensureTraceMindIndexes;
      resolveProjectDailyHealth = dailyReports.resolveProjectDailyHealth;
      resolveProjectByMcpToken = methods.resolveProjectByMcpToken;
      extractSemanticEventsOnce = semanticJobs.extractSemanticEventsOnce;
      configureProductUsageInstrumentationForTest = captureRoutes.configureProductUsageInstrumentationForTest;
      drainProductUsageInstrumentationForTest = captureRoutes.drainProductUsageInstrumentationForTest;
      resetProductUsageInstrumentationForTest = captureRoutes.resetProductUsageInstrumentationForTest;
    });

    afterEach(async function () {
      resetProductUsageInstrumentationForTest?.();
    });

    it('creates indexes for capture, MCP, presence, and event query paths', async function () {
      this.timeout(5000);
      await ensureTraceMindIndexes();

      const indexNames = async (collection) => new Set((await collection.rawCollection().indexes()).map((index) => index.name));

      const projectIndexes = await indexNames(Projects);
      const developerIndexes = await indexNames(Developers);
      const rawIndexes = await indexNames(RawBehaviors);
      const semanticIndexes = await indexNames(SemanticEvents);
      const presenceIndexes = await indexNames(PresenceSessions);
      const deliveryIndexes = await indexNames(CaptureDeliveryReports);
      const feedbackIndexes = await indexNames(FeedbackReports);
      const userFeedbackIndexes = await indexNames(TraceMindApi.UserFeedbackReports);
      const reportIndexes = await indexNames(ProjectDailyReports);
      const productUsageMarkerIndexes = await indexNames(ProductUsageMarkers);

      [
        'project_key_unique',
        'mcp_token_unique',
        'developer_projects_created',
      ].forEach((name) => assert.ok(projectIndexes.has(name), `missing ${name}`));
      [
        'developer_user_unique',
        'developer_email_unique',
        'developer_auth_token_unique',
      ].forEach((name) => assert.ok(developerIndexes.has(name), `missing ${name}`));
      [
        'projectId_1_occurredAt_-1',
        'raw_semantic_queue',
        'raw_project_action_time',
        'raw_project_target_time',
        'raw_project_attribution_source_time',
      ].forEach((name) => assert.ok(rawIndexes.has(name), `missing ${name}`));
      [
        'projectId_1_occurredAt_-1',
        'semantic_project_event_name_time',
        'semantic_project_event_type_time',
        'semantic_project_action_time',
        'semantic_project_target_time',
        'semantic_project_attribution_source_time',
      ].forEach((name) => assert.ok(semanticIndexes.has(name), `missing ${name}`));
      [
        'presence_project_presence_unique',
        'projectId_1_startedAt_-1',
        'projectId_1_lastSeenAt_-1',
      ].forEach((name) => assert.ok(presenceIndexes.has(name), `missing ${name}`));
      assert.ok(deliveryIndexes.has('projectId_1_createdAt_-1'));
      [
        'feedback_project_token_fingerprint_time',
        'feedback_project_token_time',
      ].forEach((name) => assert.ok(feedbackIndexes.has(name), `missing ${name}`));
      [
        'user_feedback_project_status_time',
        'user_feedback_project_kind_time',
        'user_feedback_project_actor_time',
        'user_feedback_project_fingerprint_time',
      ].forEach((name) => assert.ok(userFeedbackIndexes.has(name), `missing ${name}`));
      assert.ok(reportIndexes.has('projectId_1_reportDate_1'));
      assert.ok(productUsageMarkerIndexes.has('product_usage_project_day_unique'));
    });

    it('records one self-instrumented capture usage event per customer project day', async function () {
      const batches = [];
      const projectId = `project-product-usage-capture-${Date.now()}`;
      const projectKey = `tm_proj_product_usage_capture_${Date.now()}`;
      const developerId = `developer-product-usage-capture-${Date.now()}`;

      await ProductUsageMarkers.removeAsync({ projectId });
      configureProductUsageInstrumentationForTest({
        productProjectId: `self-product-usage-${Date.now()}`,
        productProjectKey: `tm_proj_self_usage_capture_${Date.now()}`,
        now: () => new Date('2026-05-21T02:00:00.000Z'),
        transport: async (body) => {
          batches.push(body);
          return { ok: true, accepted: body.events.length };
        },
      });
      await Projects.insertAsync({
        _id: projectId,
        developerId,
        name: 'Product Usage Capture Project',
        projectKey,
        mcpTokens: [],
        createdAt: new Date(),
      });

      const first = await ingestCapturePayload({
        projectKey,
        type: 'page_view',
        path: '/',
        occurredAt: '2026-05-20T16:30:00.000Z',
      }, { headers: {}, socket: {} });
      const duplicate = await ingestCapturePayload({
        projectKey,
        type: 'click',
        path: '/',
        occurredAt: '2026-05-20T17:00:00.000Z',
      }, { headers: {}, socket: {} });
      await drainProductUsageInstrumentationForTest();

      const markers = await ProductUsageMarkers.find({ projectId }).fetchAsync();
      const event = batches[0].events[0];

      assert.deepStrictEqual(first, { ok: true, ignored: false });
      assert.deepStrictEqual(duplicate, { ok: true, ignored: false });
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].reportDate, '2026-05-21');
      assert.strictEqual(markers[0].activitySource, 'capture');
      assert.strictEqual(batches.length, 1);
      assert.strictEqual(batches[0].projectKey.startsWith('tm_proj_self_usage_capture_'), true);
      assert.strictEqual(event.platform, 'server');
      assert.strictEqual(event.source.type, 'server_app');
      assert.strictEqual(event.source.key, 'tracemind-server');
      assert.ok(event.source.details.sdkContentHash);
      assert.strictEqual(event.type, 'custom');
      assert.strictEqual(event.eventName, 'customer_project_capture_active');
      assert.strictEqual(event.userId, developerId);
      assert.deepStrictEqual(event.properties, {
        reportDate: '2026-05-21',
        customerAccountId: developerId,
        customerProjectId: projectId,
        activitySource: 'capture',
      });
      assert.deepStrictEqual(event.context, {
        source: 'capture_ingestion',
        platform: 'server',
      });
    });

    it('records presence-only product usage and dedupes later capture for the same day', async function () {
      const batches = [];
      const projectId = `project-product-usage-presence-${Date.now()}`;
      const projectKey = `tm_proj_product_usage_presence_${Date.now()}`;
      const developerId = `developer-product-usage-presence-${Date.now()}`;

      await ProductUsageMarkers.removeAsync({ projectId });
      configureProductUsageInstrumentationForTest({
        productProjectId: `self-product-usage-${Date.now()}`,
        productProjectKey: `tm_proj_self_usage_presence_${Date.now()}`,
        now: () => new Date('2026-05-21T02:00:00.000Z'),
        transport: async (body) => {
          batches.push(body);
          return { ok: true, accepted: body.events.length };
        },
      });
      await Projects.insertAsync({
        _id: projectId,
        developerId,
        name: 'Product Usage Presence Project',
        projectKey,
        mcpTokens: [],
        createdAt: new Date(),
      });

      await ingestPresencePayload({
        projectKey,
        presenceId: 'tm_pres_product_usage',
        path: '/',
        state: 'start',
        occurredAt: '2026-05-20T16:15:00.000Z',
      }, { headers: {}, socket: {} });
      await ingestCapturePayload({
        projectKey,
        type: 'page_view',
        path: '/',
        occurredAt: '2026-05-20T16:45:00.000Z',
      }, { headers: {}, socket: {} });
      await drainProductUsageInstrumentationForTest();

      const markers = await ProductUsageMarkers.find({ projectId }).fetchAsync();

      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].activitySource, 'presence');
      assert.strictEqual(batches.length, 1);
      assert.strictEqual(batches[0].events[0].eventName, 'customer_project_capture_active');
      assert.strictEqual(batches[0].events[0].properties.activitySource, 'presence');
    });

    it('lets MCP summary count active capture projects and accounts from self-instrumented events', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const selfProjectId = `project-product-usage-self-${Date.now()}`;
      const selfProjectKey = `tm_proj_product_usage_self_${Date.now()}`;
      const developerId = `developer-product-usage-summary-${Date.now()}`;
      const projectAId = `project-product-usage-summary-a-${Date.now()}`;
      const projectBId = `project-product-usage-summary-b-${Date.now()}`;
      const projectAKey = `tm_proj_product_usage_summary_a_${Date.now()}`;
      const projectBKey = `tm_proj_product_usage_summary_b_${Date.now()}`;

      await ProductUsageMarkers.removeAsync({ projectId: { $in: [selfProjectId, projectAId, projectBId] } });
      await Projects.insertAsync({
        _id: selfProjectId,
        developerId: `developer-self-${Date.now()}`,
        name: 'TraceMind Self Project',
        projectKey: selfProjectKey,
        mcpTokens: [],
        createdAt: new Date(),
      });
      await Projects.insertAsync({
        _id: projectAId,
        developerId,
        name: 'Usage Summary A',
        projectKey: projectAKey,
        mcpTokens: [],
        createdAt: new Date(),
      });
      await Projects.insertAsync({
        _id: projectBId,
        developerId,
        name: 'Usage Summary B',
        projectKey: projectBKey,
        mcpTokens: [],
        createdAt: new Date(),
      });
      configureProductUsageInstrumentationForTest({
        productProjectId: selfProjectId,
        productProjectKey: selfProjectKey,
        now: () => new Date('2026-05-21T02:00:00.000Z'),
        transport: (body) => ingestCapturePayload(body, { headers: {}, socket: {} }),
      });

      await ingestCapturePayload({
        projectKey: projectAKey,
        type: 'page_view',
        path: '/',
        occurredAt: '2026-05-20T18:00:00.000Z',
      }, { headers: {}, socket: {} });
      await ingestPresencePayload({
        projectKey: projectBKey,
        presenceId: 'tm_pres_usage_summary_b',
        state: 'start',
        path: '/',
        occurredAt: '2026-05-20T18:30:00.000Z',
      }, { headers: {}, socket: {} });
      await drainProductUsageInstrumentationForTest();
      await extractSemanticEventsOnce();

      const summary = await callMcpTool(
        { _id: selfProjectId, name: 'TraceMind Self Project' },
        'tracemind.summary',
        {
          eventName: 'customer_project_capture_active',
          startAt: '2026-05-21T00:00:00.000Z',
          endAt: '2026-05-21T23:59:59.999Z',
          limit: 20,
        },
      );

      assert.strictEqual(summary.structuredContent.summary.totalEvents, 2);
      assert.strictEqual(summary.structuredContent.summary.uniqueUsers, 1);
    });

    it('skips the configured TraceMind self project to avoid recursive usage events', async function () {
      const batches = [];
      const selfProjectId = `project-product-usage-skip-self-${Date.now()}`;
      const selfProjectKey = `tm_proj_product_usage_skip_self_${Date.now()}`;

      await ProductUsageMarkers.removeAsync({ projectId: selfProjectId });
      configureProductUsageInstrumentationForTest({
        productProjectId: selfProjectId,
        productProjectKey: selfProjectKey,
        now: () => new Date('2026-05-21T02:00:00.000Z'),
        transport: async (body) => {
          batches.push(body);
          return { ok: true, accepted: body.events.length };
        },
      });
      await Projects.insertAsync({
        _id: selfProjectId,
        developerId: `developer-self-skip-${Date.now()}`,
        name: 'TraceMind Self Skip Project',
        projectKey: selfProjectKey,
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload({
        projectKey: selfProjectKey,
        type: 'custom',
        eventName: 'customer_project_capture_active',
        occurredAt: '2026-05-20T18:00:00.000Z',
      }, { headers: {}, socket: {} });
      await drainProductUsageInstrumentationForTest();

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.strictEqual(await ProductUsageMarkers.find({ projectId: selfProjectId }).countAsync(), 0);
      assert.strictEqual(batches.length, 0);
    });

    it('does not fail customer capture when self-instrumentation flush fails', async function () {
      const projectId = `project-product-usage-flush-fail-${Date.now()}`;
      const projectKey = `tm_proj_product_usage_flush_fail_${Date.now()}`;

      await ProductUsageMarkers.removeAsync({ projectId });
      configureProductUsageInstrumentationForTest({
        productProjectId: `self-product-usage-${Date.now()}`,
        productProjectKey: `tm_proj_self_usage_flush_fail_${Date.now()}`,
        now: () => new Date('2026-05-21T02:00:00.000Z'),
        logger: () => {},
        transport: async () => {
          throw new Error('self instrumentation offline');
        },
      });
      await Projects.insertAsync({
        _id: projectId,
        developerId: `developer-product-usage-flush-fail-${Date.now()}`,
        name: 'Product Usage Flush Failure Project',
        projectKey,
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload({
        projectKey,
        type: 'page_view',
        path: '/',
        occurredAt: '2026-05-20T18:00:00.000Z',
      }, { headers: {}, socket: {} });
      await drainProductUsageInstrumentationForTest();

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.strictEqual(await RawBehaviors.find({ projectId }).countAsync(), 1);
      assert.strictEqual(await ProductUsageMarkers.find({ projectId }).countAsync(), 1);
    });

    it('publishes owned daily reports without internal actor hash fields', async function () {
      const email = `daily-report-pub-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const developerId = await Developers.insertAsync({
        userId,
        email,
        authToken: `tm_dev_pub_${Date.now()}`,
        createdAt: new Date(),
      });
      const projectId = `project-daily-pub-${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId,
        name: 'Published Daily Report App',
        projectKey: `tm_proj_pub_${Date.now()}`,
        createdAt: new Date(),
      });
      await ProjectDailyReports.insertAsync({
        projectId,
        reportDate: '2026-05-12',
        timezone: 'Asia/Shanghai',
        status: 'final',
        computedAt: new Date('2026-05-12T16:30:00.000Z'),
        sourceWindow: {
          startAt: new Date('2026-05-11T16:00:00.000Z'),
          endAt: new Date('2026-05-12T16:00:00.000Z'),
        },
        current: {
          eventCount: 1,
          activeUsers: 1,
          retention: { d2: { sampleSize: 1, retainedUsers: 1, rate: 1 } },
        },
        activeActorKeys: ['internal-active-hash'],
        newActorKeys: ['internal-new-hash'],
        firstSeenActorKeys: ['internal-first-hash'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const publish = Meteor.server.publish_handlers['tracemind.project.dailyReports'];
      const cursor = await publish.apply({ userId }, [projectId, ['2026-05-12']]);
      const reports = await cursor.fetchAsync();

      assert.strictEqual(reports.length, 1);
      assert.strictEqual(reports[0].reportDate, '2026-05-12');
      assert.strictEqual(reports[0].current.eventCount, 1);
      assert.strictEqual(reports[0].activeActorKeys, undefined);
      assert.strictEqual(reports[0].newActorKeys, undefined);
      assert.strictEqual(reports[0].firstSeenActorKeys, undefined);
    });

    it('publishes developer profile and owned projects without internal auth fields', async function () {
      const email = `project-pub-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const developerId = await Developers.insertAsync({
        userId,
        email,
        authToken: `tm_dev_project_pub_${Date.now()}`,
        createdAt: new Date(),
      });
      const ownedProjectId = `project-owned-pub-${Date.now()}`;
      await Projects.insertAsync({
        _id: ownedProjectId,
        developerId,
        name: 'Owned Project',
        projectKey: `tm_proj_owned_${Date.now()}`,
        mcpTokens: [{
          id: 'mcp-owned',
          name: 'Default MCP Token',
          token: `tm_mcp_owned_${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        blockedSources: [{
          sourceType: 'web',
          sourceKey: 'owned.example',
          sourceLabel: 'owned.example',
          reason: 'test',
          blockedAt: new Date(),
        }],
        createdAt: new Date(),
      });
      await Projects.insertAsync({
        _id: `project-other-pub-${Date.now()}`,
        developerId: 'other-developer',
        name: 'Other Project',
        projectKey: `tm_proj_other_${Date.now()}`,
        mcpTokens: [],
        createdAt: new Date(),
      });

      const profilePublish = Meteor.server.publish_handlers['tracemind.developer.profile'];
      const projectsPublish = Meteor.server.publish_handlers['tracemind.projects'];
      const profileCursor = profilePublish.apply({ userId }, []);
      const projectsCursor = await projectsPublish.apply({ userId }, []);
      const profiles = await profileCursor.fetchAsync();
      const projects = await projectsCursor.fetchAsync();

      assert.strictEqual(profiles.length, 1);
      assert.strictEqual(profiles[0].email, email);
      assert.strictEqual(profiles[0].authToken, undefined);
      assert.strictEqual(projects.length, 1);
      assert.strictEqual(projects[0]._id, ownedProjectId);
      assert.strictEqual(projects[0].name, 'Owned Project');
      assert.strictEqual(projects[0].developerId, undefined);
      assert.strictEqual(projects[0].projectKey.startsWith('tm_proj_owned_'), true);
      assert.strictEqual(projects[0].mcpTokens[0].id, 'mcp-owned');
      assert.strictEqual(projects[0].blockedSources[0].sourceKey, 'owned.example');
    });

    it('creates TraceMind developer data from a Meteor Accounts user', async function () {
      const email = `founder-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];

      const result = await dashboardMethod.apply({ userId }, []);

      const developer = await Developers.findOneAsync({ userId });
      const project = await Projects.findOneAsync({ developerId: developer._id });

      assert.strictEqual(result.developer.email, email);
      assert.ok(result.developer.authToken.startsWith('tm_dev_'));
      assert.strictEqual(result.projects.length, 1);
      assert.strictEqual(result.summary.totalEvents, 0);
      assert.ok(result.projects[0].projectKey.startsWith('tm_proj_'));
      assert.strictEqual(result.projects[0].mcpTokens.length, 1);
      assert.strictEqual(result.projects[0].mcpTokens[0].name, 'Default MCP Token');
      assert.ok(result.projects[0].mcpTokens[0].token.startsWith('tm_mcp_'));
      assert.strictEqual(project._id, result.projects[0]._id);
    });

    it('summarizes only the selected project for project detail views', async function () {
      const email = `project-summary-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const createProjectMethod = Meteor.server.method_handlers['tracemind.project.create'];
      const projectSummaryMethod = Meteor.server.method_handlers['tracemind.project.summary'];
      const projectEventsMethod = Meteor.server.method_handlers['tracemind.project.events'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const selectedProject = dashboard.projects[0];
      const otherProject = await createProjectMethod.apply({ userId }, ['Other Web App']);

      await RawBehaviors.insertAsync({
        projectId: selectedProject._id,
        type: 'page_view',
        sourceType: 'web',
        sourceKey: 'selected.example',
        sourceLabel: 'selected.example',
        occurredAt: new Date('2026-05-07T01:00:00.000Z'),
        createdAt: new Date('2026-05-07T01:00:00.000Z'),
      });
      await RawBehaviors.insertAsync({
        projectId: otherProject._id,
        type: 'page_view',
        sourceType: 'web',
        sourceKey: 'other.example',
        sourceLabel: 'other.example',
        occurredAt: new Date('2026-05-07T02:00:00.000Z'),
        createdAt: new Date('2026-05-07T02:00:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId: selectedProject._id,
        eventType: 'custom',
        eventName: 'selected_event',
        title: 'Selected event',
        meaning: 'Selected project event.',
        userId: 'selected-user',
        deviceId: 'selected-device',
        occurredAt: new Date('2026-05-08T01:05:00.000Z'),
        createdAt: new Date('2026-05-08T01:05:00.000Z'),
      });
      await Promise.all(Array.from({ length: 25 }, (_, index) => SemanticEvents.insertAsync({
        projectId: selectedProject._id,
        eventType: 'custom',
        eventName: `selected_day_event_${index}`,
        title: `Selected day event ${index}`,
        meaning: 'Selected project day event.',
        userId: 'selected-user',
        deviceId: 'selected-device',
        occurredAt: new Date(`2026-05-08T01:${String(10 + index).padStart(2, '0')}:00.000Z`),
        createdAt: new Date(`2026-05-08T01:${String(10 + index).padStart(2, '0')}:00.000Z`),
      })));
      await Promise.all(Array.from({ length: 200 }, (_, index) => SemanticEvents.insertAsync({
        projectId: selectedProject._id,
        eventType: 'custom',
        eventName: `selected_window_event_${index}`,
        title: `Selected window event ${index}`,
        meaning: 'Selected project window event.',
        userId: 'selected-user',
        deviceId: 'selected-device',
        occurredAt: new Date(`2026-05-06T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
        createdAt: new Date(`2026-05-06T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
      })));
      await SemanticEvents.insertAsync({
        projectId: otherProject._id,
        eventType: 'custom',
        eventName: 'other_event',
        title: 'Other event',
        meaning: 'Other project event.',
        userId: 'other-user',
        deviceId: 'other-device',
        occurredAt: new Date('2026-05-07T02:05:00.000Z'),
        createdAt: new Date('2026-05-07T02:05:00.000Z'),
      });
      await PresenceSessions.insertAsync({
        projectId: selectedProject._id,
        presenceId: 'selected-presence',
        userId: 'selected-user',
        sessionId: 'selected-session',
        sourceType: 'web',
        sourceKey: 'selected.example',
        path: '/pricing',
        startedAt: new Date('2026-05-08T01:00:00.000Z'),
        lastSeenAt: new Date('2026-05-08T01:01:00.000Z'),
        endedAt: new Date('2026-05-08T01:01:00.000Z'),
        state: 'end',
        durationMs: 60000,
        createdAt: new Date('2026-05-08T01:00:00.000Z'),
      });
      await PresenceSessions.insertAsync({
        projectId: otherProject._id,
        presenceId: 'other-presence',
        userId: 'other-user',
        sessionId: 'other-session',
        sourceType: 'web',
        sourceKey: 'other.example',
        path: '/other',
        startedAt: new Date('2026-05-08T01:00:00.000Z'),
        lastSeenAt: new Date('2026-05-08T01:01:00.000Z'),
        durationMs: 60000,
        createdAt: new Date('2026-05-08T01:00:00.000Z'),
      });
      await computeProjectDailyReport(selectedProject._id, '2026-05-08', {
        final: true,
        now: new Date('2026-05-08T16:30:00.000Z'),
      });

      const result = await projectSummaryMethod.apply({ userId }, [selectedProject._id, '2026-05-08']);

      assert.strictEqual(result.project._id, selectedProject._id);
      assert.strictEqual(result.rawCount, 1);
      assert.strictEqual(result.semanticCount, 226);
      assert.strictEqual(result.summaryWindow.eventStreamPageSize, 20);
      assert.strictEqual(result.summaryWindow.rawBehaviorLimit, 500);
      assert.strictEqual(result.summaryWindow.presenceSessionLimit, 500);
      assert.strictEqual(result.summaryWindow.deliveryReportLimit, 500);
      assert.strictEqual(result.summaryWindow.semanticEventSampleSize, 0);
      assert.strictEqual(result.summaryWindow.rawBehaviorSampleSize, 1);
      assert.strictEqual(result.summaryWindow.presenceSessionSampleSize, 1);
      assert.strictEqual(result.summaryWindow.deliveryReportSampleSize, 0);
      assert.ok(result.summaryWindow.reportDate);
      assert.strictEqual(result.summary.totalEvents, 26);
      assert.strictEqual(result.summary.uniqueUsers, 1);
      assert.strictEqual(result.summary.uniqueDevices, 0);
      assert.strictEqual(result.presence.totalDurationMs, 60000);
      assert.strictEqual(result.presence.topPaths[0].path, '/pricing');
      assert.deepStrictEqual(result.sources.map((source) => source.sourceKey), ['selected.example']);
      assert.deepStrictEqual(result.recentEvents, []);

      const firstPage = await projectEventsMethod.apply({ userId }, [selectedProject._id, '2026-05-08']);
      assert.strictEqual(firstPage.events.length, 20);
      assert.strictEqual(firstPage.offset, 0);
      assert.strictEqual(firstPage.limit, 20);
      assert.strictEqual(firstPage.nextOffset, 20);
      assert.strictEqual(firstPage.hasMore, true);
      assert.strictEqual(firstPage.events[0].eventName, 'selected_day_event_24');
      assert.strictEqual(firstPage.events.some((event) => event.eventName === 'other_event'), false);

      const secondPage = await projectEventsMethod.apply({ userId }, [
        selectedProject._id,
        '2026-05-08',
        { offset: firstPage.nextOffset, limit: 20 },
      ]);
      assert.strictEqual(secondPage.events.length, 6);
      assert.strictEqual(secondPage.nextOffset, 26);
      assert.strictEqual(secondPage.hasMore, false);
      assert.ok(secondPage.events.some((event) => event.eventName === 'selected_event'));
    });

    it('computes daily project reports with hashed actor sets and retention-ready metrics', async function () {
      const projectId = `project-daily-report-${Date.now()}`;
      await ProjectDailyReports.removeAsync({ projectId });
      await Projects.insertAsync({
        _id: projectId,
        developerId: `developer-${projectId}`,
        name: 'Daily Report App',
        projectKey: `tm_proj_daily_${Date.now()}`,
        authToken: `tm_auth_daily_${Date.now()}`,
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'page_view',
        eventName: 'page_view',
        anonymousId: 'anon-a',
        deviceId: 'device-a',
        platform: 'web',
        geo: { country: 'CN' },
        deviceInfo: { browser: 'Chrome' },
        path: '/home',
        occurredAt: new Date('2026-05-11T16:30:00.000Z'),
        createdAt: new Date('2026-05-11T16:30:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_failed',
        userId: 'user-b',
        platform: 'web',
        properties: { status: 'failed' },
        path: '/checkout',
        occurredAt: new Date('2026-05-12T01:00:00.000Z'),
        createdAt: new Date('2026-05-12T01:00:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'outside_day',
        userId: 'outside-user',
        occurredAt: new Date('2026-05-12T16:01:00.000Z'),
        createdAt: new Date('2026-05-12T16:01:00.000Z'),
      });
      await PresenceSessions.insertAsync({
        projectId,
        presenceId: 'presence-a',
        anonymousId: 'anon-a',
        sessionId: 'session-a',
        sourceType: 'web',
        sourceKey: 'app.example',
        path: '/home',
        startedAt: new Date('2026-05-11T16:30:00.000Z'),
        lastSeenAt: new Date('2026-05-11T16:35:00.000Z'),
        endedAt: new Date('2026-05-11T16:35:00.000Z'),
        activeDurationMs: 120000,
      });
      await PresenceSessions.insertAsync({
        projectId,
        presenceId: 'presence-other-day',
        userId: 'outside-user',
        sessionId: 'session-other-day',
        path: '/other',
        startedAt: new Date('2026-05-12T16:01:00.000Z'),
        lastSeenAt: new Date('2026-05-12T16:05:00.000Z'),
        activeDurationMs: 120000,
      });

      const report = await computeProjectDailyReport(projectId, '2026-05-12', {
        final: true,
        now: new Date('2026-05-12T16:30:00.000Z'),
      });

      assert.strictEqual(report.reportDate, '2026-05-12');
      assert.strictEqual(report.status, 'final');
      assert.strictEqual(report.current.eventCount, 2);
      assert.strictEqual(report.current.activeUsers, 2);
      assert.strictEqual(report.current.sessionCount, 1);
      assert.strictEqual(report.current.failureEventCount, 1);
      assert.deepStrictEqual(report.current.topEvents[0], { label: 'checkout_failed', count: 1 });
      assert.strictEqual(report.activeActorKeys.length, 2);
      assert.strictEqual(report.activeActorKeys.some((key) => key.includes('anon-a') || key.includes('user-b')), false);

      const savedReports = await ProjectDailyReports.find({ projectId, reportDate: '2026-05-12' }).fetchAsync();
      assert.strictEqual(savedReports.length, 1);
    });

    it('reads materialized daily reports for project health trends without synchronously backfilling history', async function () {
      const projectId = `project-daily-health-${Date.now()}`;
      await ProjectDailyReports.removeAsync({ projectId });
      await Projects.insertAsync({
        _id: projectId,
        developerId: `developer-${projectId}`,
        name: 'Daily Health App',
        projectKey: `tm_proj_health_${Date.now()}`,
        authToken: `tm_auth_health_${Date.now()}`,
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'signup_started',
        anonymousId: 'cohort-user',
        occurredAt: new Date('2026-05-10T01:00:00.000Z'),
        createdAt: new Date('2026-05-10T01:00:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'signup_started',
        anonymousId: 'cohort-user',
        occurredAt: new Date('2026-05-12T01:00:00.000Z'),
        createdAt: new Date('2026-05-12T01:00:00.000Z'),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'yesterday_event',
        anonymousId: 'yesterday-user',
        occurredAt: new Date('2026-05-11T01:00:00.000Z'),
        createdAt: new Date('2026-05-11T01:00:00.000Z'),
      });

      await computeProjectDailyReport(projectId, '2026-05-10', {
        final: true,
        now: new Date('2026-05-10T16:30:00.000Z'),
      });
      await computeProjectDailyReport(projectId, '2026-05-11', {
        final: true,
        now: new Date('2026-05-11T16:30:00.000Z'),
      });
      await computeProjectDailyReport(projectId, '2026-05-12', {
        final: false,
        now: new Date('2026-05-12T03:00:00.000Z'),
      });
      const first = await resolveProjectDailyHealth(projectId, '2026-05-12', {
        now: new Date('2026-05-12T03:00:00.000Z'),
      });
      const second = await resolveProjectDailyHealth(projectId, '2026-05-12', {
        now: new Date('2026-05-12T03:00:30.000Z'),
      });

      assert.strictEqual(first.report._id, second.report._id);
      assert.deepStrictEqual(first.health.current.retention.d2, {
        sampleSize: 1,
        retainedUsers: 1,
        rate: 1,
      });
      assert.strictEqual(first.health.current.eventCount, 1);
      assert.strictEqual(first.health.previous.eventCount, 1);
      assert.strictEqual(first.health.trends.events, 0);

      const missing = await resolveProjectDailyHealth(projectId, '2026-04-01', {
        now: new Date('2026-05-12T03:00:30.000Z'),
      });
      assert.ok(!missing.report);
      assert.strictEqual(missing.health.current.eventCount, 0);
    });

    it('resolves MCP access only through independent MCP tokens', async function () {
      const projectId = `project-mcp-auth-${Date.now()}`;
      const mcpToken = `tm_mcp_test_${Date.now()}`;
      const projectKey = `tm_proj_test_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-mcp-auth',
        name: 'MCP Auth Project',
        projectKey,
        mcpTokens: [{
          id: 'mcp-token-1',
          name: 'Agent Seat',
          token: mcpToken,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        createdAt: new Date(),
      });

      const projectByToken = await resolveProjectByMcpToken(mcpToken);
      const projectByProjectKey = await resolveProjectByMcpToken(projectKey);

      assert.strictEqual(projectByToken._id, projectId);
      assert.strictEqual(projectByProjectKey, null);
    });

    it('lets project owners create, rename, refresh, and remove MCP tokens', async function () {
      const email = `mcp-owner-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const createMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.create'];
      const renameMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.rename'];
      const refreshMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.refresh'];
      const removeMethod = Meteor.server.method_handlers['tracemind.project.mcpToken.remove'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const projectId = dashboard.projects[0]._id;

      const createdProject = await createMethod.apply({ userId }, [projectId, 'Claude']);
      const createdToken = createdProject.mcpTokens.find((token) => token.name === 'Claude');
      assert.ok(createdToken.token.startsWith('tm_mcp_'));

      const renamedProject = await renameMethod.apply({ userId }, [projectId, createdToken.id, 'Cursor']);
      assert.strictEqual(
        renamedProject.mcpTokens.find((token) => token.id === createdToken.id).name,
        'Cursor',
      );

      const refreshedProject = await refreshMethod.apply({ userId }, [projectId, createdToken.id]);
      const refreshedToken = refreshedProject.mcpTokens.find((token) => token.id === createdToken.id);
      assert.ok(refreshedToken.token.startsWith('tm_mcp_'));
      assert.notStrictEqual(refreshedToken.token, createdToken.token);
      assert.strictEqual(await resolveProjectByMcpToken(createdToken.token), null);
      assert.strictEqual((await resolveProjectByMcpToken(refreshedToken.token))._id, projectId);

      const removedProject = await removeMethod.apply({ userId }, [projectId, createdToken.id]);
      assert.strictEqual(
        removedProject.mcpTokens.some((token) => token.id === createdToken.id),
        false,
      );
      assert.strictEqual(await resolveProjectByMcpToken(refreshedToken.token), null);
    });

    it('lets project owners rename only their own projects', async function () {
      const ownerUserId = await Meteor.users.insertAsync({
        emails: [{ address: `project-owner-${Date.now()}@example.com`, verified: true }],
        createdAt: new Date(),
      });
      const otherUserId = await Meteor.users.insertAsync({
        emails: [{ address: `project-other-${Date.now()}@example.com`, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const renameMethod = Meteor.server.method_handlers['tracemind.project.rename'];

      const ownerDashboard = await dashboardMethod.apply({ userId: ownerUserId }, []);
      const projectId = ownerDashboard.projects[0]._id;

      const renamedProject = await renameMethod.apply({ userId: ownerUserId }, [projectId, '  Renamed Project  ']);
      const storedProject = await Projects.findOneAsync(projectId);

      assert.strictEqual(renamedProject._id, projectId);
      assert.strictEqual(renamedProject.name, 'Renamed Project');
      assert.strictEqual(storedProject.name, 'Renamed Project');
      assert.strictEqual(renamedProject.developerId, undefined);

      await assert.rejects(
        () => renameMethod.apply({ userId: otherUserId }, [projectId, 'Other User Name']),
        (error) => error.error === 'not-found',
      );
      assert.strictEqual((await Projects.findOneAsync(projectId)).name, 'Renamed Project');
    });

    it('hard deletes owned projects and their captured data without touching sibling projects', async function () {
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: `project-remove-${Date.now()}@example.com`, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const createProjectMethod = Meteor.server.method_handlers['tracemind.project.create'];
      const removeMethod = Meteor.server.method_handlers['tracemind.project.remove'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const removedProjectId = dashboard.projects[0]._id;
      const siblingProject = await createProjectMethod.apply({ userId }, ['Sibling Project']);

      await RawBehaviors.insertAsync({
        projectId: removedProjectId,
        type: 'page_view',
        occurredAt: new Date(),
        createdAt: new Date(),
      });
      await RawBehaviors.insertAsync({
        projectId: siblingProject._id,
        type: 'page_view',
        occurredAt: new Date(),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId: removedProjectId,
        eventType: 'page_view',
        title: 'Removed project event',
        meaning: 'Removed project event.',
        occurredAt: new Date(),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId: siblingProject._id,
        eventType: 'page_view',
        title: 'Sibling project event',
        meaning: 'Sibling project event.',
        occurredAt: new Date(),
        createdAt: new Date(),
      });
      await PresenceSessions.insertAsync({
        projectId: removedProjectId,
        presenceId: 'removed-presence',
        startedAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
      });
      await PresenceSessions.insertAsync({
        projectId: siblingProject._id,
        presenceId: 'sibling-presence',
        startedAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
      });
      await FeedbackReports.insertAsync({
        projectId: removedProjectId,
        type: 'issue',
        title: 'Removed project feedback',
        summary: 'Feedback for deleted project.',
        submittedVia: 'mcp',
        createdAt: new Date(),
      });
      await FeedbackReports.insertAsync({
        projectId: siblingProject._id,
        type: 'idea',
        title: 'Sibling project feedback',
        summary: 'Feedback for sibling project.',
        submittedVia: 'mcp',
        createdAt: new Date(),
      });
      await TraceMindApi.UserFeedbackReports.insertAsync({
        projectId: removedProjectId,
        status: 'new',
        message: { kind: 'issue', title: 'Removed user feedback', body: 'For removed project.' },
        createdAt: new Date(),
      });
      await TraceMindApi.UserFeedbackReports.insertAsync({
        projectId: siblingProject._id,
        status: 'new',
        message: { kind: 'idea', title: 'Sibling user feedback', body: 'For sibling project.' },
        createdAt: new Date(),
      });
      await ProjectDailyReports.insertAsync({
        projectId: removedProjectId,
        reportDate: '2026-05-12',
        status: 'final',
        activeActorKeys: ['removed-actor'],
        newActorKeys: ['removed-actor'],
        current: { eventCount: 1 },
        createdAt: new Date(),
      });
      await ProjectDailyReports.insertAsync({
        projectId: siblingProject._id,
        reportDate: '2026-05-12',
        status: 'final',
        activeActorKeys: ['sibling-actor'],
        newActorKeys: ['sibling-actor'],
        current: { eventCount: 1 },
        createdAt: new Date(),
      });

      const result = await removeMethod.apply({ userId }, [removedProjectId]);

      assert.deepStrictEqual(result, { removed: true, projectId: removedProjectId });
      assert.strictEqual(await Projects.findOneAsync(removedProjectId), undefined);
      assert.strictEqual(await RawBehaviors.find({ projectId: removedProjectId }).countAsync(), 0);
      assert.strictEqual(await SemanticEvents.find({ projectId: removedProjectId }).countAsync(), 0);
      assert.strictEqual(await PresenceSessions.find({ projectId: removedProjectId }).countAsync(), 0);
      assert.strictEqual(await FeedbackReports.find({ projectId: removedProjectId }).countAsync(), 0);
      assert.strictEqual(await TraceMindApi.UserFeedbackReports.find({ projectId: removedProjectId }).countAsync(), 0);
      assert.strictEqual(await ProjectDailyReports.find({ projectId: removedProjectId }).countAsync(), 0);
      assert.ok(await Projects.findOneAsync(siblingProject._id));
      assert.strictEqual(await RawBehaviors.find({ projectId: siblingProject._id }).countAsync(), 1);
      assert.strictEqual(await SemanticEvents.find({ projectId: siblingProject._id }).countAsync(), 1);
      assert.strictEqual(await PresenceSessions.find({ projectId: siblingProject._id }).countAsync(), 1);
      assert.strictEqual(await FeedbackReports.find({ projectId: siblingProject._id }).countAsync(), 1);
      assert.strictEqual(await TraceMindApi.UserFeedbackReports.find({ projectId: siblingProject._id }).countAsync(), 1);
      assert.strictEqual(await ProjectDailyReports.find({ projectId: siblingProject._id }).countAsync(), 1);
    });

    it('rejects project deletion by non-owners', async function () {
      const ownerUserId = await Meteor.users.insertAsync({
        emails: [{ address: `remove-owner-${Date.now()}@example.com`, verified: true }],
        createdAt: new Date(),
      });
      const otherUserId = await Meteor.users.insertAsync({
        emails: [{ address: `remove-other-${Date.now()}@example.com`, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const removeMethod = Meteor.server.method_handlers['tracemind.project.remove'];

      const dashboard = await dashboardMethod.apply({ userId: ownerUserId }, []);
      const projectId = dashboard.projects[0]._id;

      await assert.rejects(
        () => removeMethod.apply({ userId: otherUserId }, [projectId]),
        (error) => error.error === 'not-found',
      );
      assert.ok(await Projects.findOneAsync(projectId));
    });

    it('lets project owners block and unblock capture sources', async function () {
      const email = `source-owner-${Date.now()}@example.com`;
      const userId = await Meteor.users.insertAsync({
        emails: [{ address: email, verified: true }],
        createdAt: new Date(),
      });
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];
      const blockMethod = Meteor.server.method_handlers['tracemind.project.source.block'];
      const unblockMethod = Meteor.server.method_handlers['tracemind.project.source.unblock'];

      const dashboard = await dashboardMethod.apply({ userId }, []);
      const projectId = dashboard.projects[0]._id;

      const blockedProject = await blockMethod.apply(
        { userId },
        [projectId, { sourceType: 'web', sourceKey: 'evil.example', reason: 'Not our app' }],
      );
      assert.deepStrictEqual(blockedProject.blockedSources.map((source) => ({
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
        reason: source.reason,
      })), [{ sourceType: 'web', sourceKey: 'evil.example', reason: 'Not our app' }]);

      const unblockedProject = await unblockMethod.apply(
        { userId },
        [projectId, { sourceType: 'web', sourceKey: 'evil.example' }],
      );
      assert.deepStrictEqual(unblockedProject.blockedSources, []);
    });

    it('accepts blocked capture requests without inserting raw behavior', async function () {
      const projectId = `project-blocked-capture-${Date.now()}`;
      const projectKey = `tm_proj_blocked_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-blocked-capture',
        name: 'Blocked Capture Project',
        projectKey,
        blockedSources: [{ sourceType: 'web', sourceKey: 'evil.example', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload(
        {
          projectKey,
          type: 'page_view',
          source: { type: 'web', url: 'https://evil.example/pricing' },
        },
        { headers: {}, socket: {} },
      );
      const count = await RawBehaviors.find({ projectId }).countAsync();

      assert.deepStrictEqual(result, { ok: true, ignored: true });
      assert.strictEqual(count, 0);
    });

    it('extracts semantic events from pending raw behaviors only', async function () {
      const projectId = `project-semantic-queue-${Date.now()}`;
      await RawBehaviors.insertAsync({
        projectId,
        type: 'page_view',
        path: '/pending',
        semanticStatus: 'pending',
        occurredAt: new Date('2026-05-10T10:00:00.000Z'),
        createdAt: new Date('2026-05-10T10:00:00.000Z'),
      });
      await RawBehaviors.insertAsync({
        projectId,
        type: 'page_view',
        path: '/legacy',
        semanticStatus: 'retry',
        occurredAt: new Date('2026-05-10T10:01:00.000Z'),
        createdAt: new Date('2026-05-10T10:01:00.000Z'),
      });

      await extractSemanticEventsOnce();
      const events = await SemanticEvents.find({ projectId }).fetchAsync();
      const remainingRetry = await RawBehaviors.findOneAsync({ projectId, path: '/legacy' });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].path, '/pending');
      assert.strictEqual(remainingRetry.semanticStatus, 'retry');
    });

    it('records capture delivery stats separately from raw behavior', async function () {
      const projectId = `project-capture-delivery-${Date.now()}`;
      const projectKey = `tm_proj_delivery_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-capture-delivery',
        name: 'Capture Delivery Project',
        projectKey,
        blockedSources: [{ sourceType: 'web', sourceKey: 'blocked.example', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload({
        projectKey,
        sessionId: 'tm_sess_delivery',
        deviceId: 'tm_dev_delivery',
        deliveryStats: {
          batchId: 'tm_batch_capture',
          reason: 'scheduled',
          queued: 3,
          sent: 3,
          droppedOldest: 2,
          droppedStorage: 1,
          retryCount: 4,
          coalescedPresence: 0,
          maxQueueDepth: 30,
        },
        events: [
          { type: 'page_view', source: { type: 'web', url: 'https://app.example.com/' } },
          { type: 'click', source: { type: 'web', url: 'https://blocked.example/' } },
          { type: 'submit', source: { type: 'web', url: 'https://app.example.com/signup' } },
        ],
      }, { headers: {}, socket: {} });

      const behaviors = await RawBehaviors.find({ projectId }).fetchAsync();
      const reports = await CaptureDeliveryReports.find({ projectId }).fetchAsync();

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.accepted, 2);
      assert.strictEqual(result.ignored, 1);
      assert.strictEqual(behaviors.length, 2);
      assert.strictEqual(reports.length, 1);
      assert.strictEqual(reports[0].endpoint, 'capture');
      assert.strictEqual(reports[0].batchId, 'tm_batch_capture');
      assert.strictEqual(reports[0].accepted, 2);
      assert.strictEqual(reports[0].ignored, 1);
      assert.strictEqual(reports[0].droppedOldest, 2);
      assert.strictEqual(reports[0].droppedStorage, 1);
      assert.strictEqual(await SemanticEvents.find({ projectId }).countAsync(), 0);
    });

    it('accepts batched presence payloads and records delivery stats', async function () {
      const projectId = `project-presence-batch-${Date.now()}`;
      const projectKey = `tm_proj_presence_batch_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-presence-batch',
        name: 'Presence Batch Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestPresencePayload({
        projectKey,
        sessionId: 'tm_sess_presence_batch',
        deviceId: 'tm_dev_presence_batch',
        deliveryStats: {
          batchId: 'tm_batch_presence',
          reason: 'visibilitychange',
          queued: 2,
          sent: 2,
          droppedOldest: 0,
          droppedStorage: 0,
          retryCount: 1,
          coalescedPresence: 3,
          maxQueueDepth: 8,
        },
        events: [
          {
            presenceId: 'tm_pres_batch_a',
            source: { type: 'web', url: 'https://app.example.com/docs' },
            path: '/docs',
            state: 'start',
            occurredAt: '2026-05-08T01:00:00.000Z',
          },
          {
            presenceId: 'tm_pres_batch_b',
            source: { type: 'web', url: 'https://app.example.com/pricing' },
            path: '/pricing',
            state: 'heartbeat',
            occurredAt: '2026-05-08T01:00:05.000Z',
          },
        ],
      }, { headers: {}, socket: {} });

      const sessions = await PresenceSessions.find({ projectId }, { sort: { presenceId: 1 } }).fetchAsync();
      const reports = await CaptureDeliveryReports.find({ projectId }).fetchAsync();

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.accepted, 2);
      assert.strictEqual(result.ignored, 0);
      assert.strictEqual(sessions.length, 2);
      assert.deepStrictEqual(sessions.map((session) => session.path), ['/docs', '/pricing']);
      assert.deepStrictEqual(sessions.map((session) => session.activeDurationMs), [0, 0]);
      assert.strictEqual(reports.length, 1);
      assert.strictEqual(reports[0].endpoint, 'presence');
      assert.strictEqual(reports[0].batchId, 'tm_batch_presence');
      assert.strictEqual(reports[0].coalescedPresence, 3);
      assert.strictEqual(await RawBehaviors.find({ projectId }).countAsync(), 0);
    });

    it('stores sanitized attribution on presence sessions', async function () {
      const projectId = `project-presence-attribution-${Date.now()}`;
      const projectKey = `tm_proj_presence_attr_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-presence-attribution',
        name: 'Presence Attribution Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestPresencePayload({
        projectKey,
        presenceId: 'tm_pres_attr',
        sessionId: 'tm_sess_attr',
        source: { type: 'web', url: 'https://app.example.com/pricing' },
        path: '/pricing',
        state: 'start',
        attribution: {
          source: 'google',
          medium: 'cpc',
          campaign: 'launch-week',
          referrerDomain: 'google.com',
          referrerType: 'search',
          landingPath: '/pricing',
          gclidPresent: true,
          fullUrl: 'https://app.example.com/pricing?gclid=secret-click',
        },
      }, { headers: {}, socket: {} });
      const session = await PresenceSessions.findOneAsync({ projectId, presenceId: 'tm_pres_attr' });

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.deepStrictEqual(session.attribution, {
        source: 'google',
        medium: 'cpc',
        campaign: 'launch-week',
        referrerDomain: 'google.com',
        referrerType: 'search',
        landingPath: '/pricing',
        gclidPresent: true,
      });
      assert.deepStrictEqual(publicPresenceSession(session).attribution, session.attribution);
      assert.ok(!JSON.stringify(session.attribution).includes('secret-click'));
    });

    it('upserts presence sessions without creating raw or semantic events', async function () {
      const projectId = `project-presence-${Date.now()}`;
      const projectKey = `tm_proj_presence_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-presence',
        name: 'Presence Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const start = await ingestPresencePayload({
        projectKey,
        presenceId: 'tm_pres_test',
        sessionId: 'tm_sess_presence',
        anonymousId: 'tm_anon_presence',
        userId: 'user-presence',
        deviceId: 'tm_dev_presence',
        deviceFingerprint: 'tm_fp_presence',
        platform: 'web',
        source: { type: 'web', url: 'https://app.example.com/pricing' },
        path: '/pricing',
        title: 'Pricing',
        state: 'start',
        heartbeatIntervalMs: 5000,
        activeDurationMs: 0,
        lastActiveAt: '2026-05-08T01:00:00.000Z',
        activeState: 'active',
        idleTimeoutMs: 60000,
        occurredAt: '2026-05-08T01:00:00.000Z',
      }, { headers: {}, socket: {} });
      const heartbeat = await ingestPresencePayload({
        projectKey,
        presenceId: 'tm_pres_test',
        sessionId: 'tm_sess_presence',
        anonymousId: 'tm_anon_presence',
        userId: 'user-presence',
        deviceId: 'tm_dev_presence',
        platform: 'web',
        source: { type: 'web', url: 'https://app.example.com/pricing' },
        path: '/pricing',
        title: 'Pricing',
        state: 'heartbeat',
        activeDurationMs: 5000,
        lastActiveAt: '2026-05-08T01:00:00.000Z',
        activeState: 'active',
        idleTimeoutMs: 60000,
        occurredAt: '2026-05-08T01:00:05.000Z',
      }, { headers: {}, socket: {} });
      await ingestPresencePayload({
        projectKey,
        presenceId: 'tm_pres_test',
        sessionId: 'tm_sess_presence',
        anonymousId: 'tm_anon_presence',
        userId: 'user-presence',
        deviceId: 'tm_dev_presence',
        platform: 'web',
        source: { type: 'web', url: 'https://app.example.com/pricing' },
        path: '/pricing',
        title: 'Pricing',
        state: 'end',
        activeDurationMs: 7000,
        lastActiveAt: '2026-05-08T01:00:00.000Z',
        activeState: 'inactive',
        idleTimeoutMs: 60000,
        occurredAt: '2026-05-08T01:00:10.000Z',
      }, { headers: {}, socket: {} });

      const session = await PresenceSessions.findOneAsync({ projectId, presenceId: 'tm_pres_test' });

      assert.deepStrictEqual(start, { ok: true, ignored: false });
      assert.deepStrictEqual(heartbeat, { ok: true, ignored: false });
      assert.strictEqual(await PresenceSessions.find({ projectId }).countAsync(), 1);
      assert.strictEqual(await RawBehaviors.find({ projectId }).countAsync(), 0);
      assert.strictEqual(await SemanticEvents.find({ projectId }).countAsync(), 0);
      assert.strictEqual(session.state, 'end');
      assert.strictEqual(session.path, '/pricing');
      assert.strictEqual(session.sourceKey, 'app.example.com');
      assert.strictEqual(session.heartbeatCount, 1);
      assert.strictEqual(session.durationMs, 10000);
      assert.strictEqual(session.activeDurationMs, 7000);
      assert.strictEqual(session.activeState, 'inactive');
      assert.strictEqual(session.idleTimeoutMs, 60000);
      assert.deepStrictEqual(session.lastActiveAt, new Date('2026-05-08T01:00:00.000Z'));
      assert.strictEqual(summarizePresenceSessions([session], new Date('2026-05-08T01:00:12.000Z')).onlineSessions, 0);
    });

    it('ignores presence from blocked sources', async function () {
      const projectId = `project-blocked-presence-${Date.now()}`;
      const projectKey = `tm_proj_blocked_presence_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-blocked-presence',
        name: 'Blocked Presence Project',
        projectKey,
        blockedSources: [{ sourceType: 'web', sourceKey: 'evil.example', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestPresencePayload({
        projectKey,
        presenceId: 'tm_pres_blocked',
        source: { type: 'web', url: 'https://evil.example/pricing' },
        state: 'start',
      }, { headers: {}, socket: {} });

      assert.deepStrictEqual(result, { ok: true, ignored: true });
      assert.strictEqual(await PresenceSessions.find({ projectId }).countAsync(), 0);
    });

    it('stores source fields for accepted capture requests', async function () {
      const projectId = `project-source-capture-${Date.now()}`;
      const projectKey = `tm_proj_source_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-source-capture',
        name: 'Source Capture Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload(
        {
          projectKey,
          type: 'page_view',
          source: { type: 'web', url: 'https://app.example.com/docs' },
        },
        { headers: {}, socket: {} },
      );
      const behavior = await RawBehaviors.findOneAsync({ projectId });

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.strictEqual(behavior.sourceType, 'web');
      assert.strictEqual(behavior.sourceKey, 'app.example.com');
      assert.strictEqual(behavior.sourceLabel, 'app.example.com');
      assert.deepStrictEqual(behavior.sourceDetails, {
        origin: 'https://app.example.com',
        path: '/docs',
        referrer: '',
      });
    });

    it('stores only sanitized attribution fields on raw and semantic events', async function () {
      const projectId = `project-attribution-capture-${Date.now()}`;
      const projectKey = `tm_proj_attribution_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-attribution-capture',
        name: 'Attribution Capture Project',
        projectKey,
        blockedSources: [],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload(
        {
          projectKey,
          type: 'page_view',
          path: '/pricing',
          source: { type: 'web', url: 'https://app.example.com/pricing' },
          attribution: {
            source: 'github',
            medium: 'social',
            campaign: 'launch-week',
            content: 'hero',
            referrerDomain: 'news.ycombinator.com',
            referrerType: 'social',
            landingPath: '/pricing',
            gclidPresent: true,
            utmTerm: 'private search words',
            fullUrl: 'https://app.example.com/pricing?email=person@example.com',
            email: 'person@example.com',
          },
        },
        { headers: {}, socket: {} },
      );
      const behavior = await RawBehaviors.findOneAsync({ projectId });
      const semanticEvent = buildSemanticEvent(behavior);

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.deepStrictEqual(behavior.attribution, {
        source: 'github',
        medium: 'social',
        campaign: 'launch-week',
        content: 'hero',
        referrerDomain: 'news.ycombinator.com',
        referrerType: 'social',
        landingPath: '/pricing',
        gclidPresent: true,
      });
      assert.deepStrictEqual(semanticEvent.attribution, behavior.attribution);
      assert.deepStrictEqual(publicRawBehavior(behavior).attribution, behavior.attribution);
      assert.deepStrictEqual(publicSemanticEvent(semanticEvent).attribution, behavior.attribution);
      assert.ok(!JSON.stringify(behavior.attribution).includes('person@example.com'));
      assert.ok(!JSON.stringify(behavior.attribution).includes('private search words'));
    });

    it('preserves numeric and boolean manual capture fields from SDK payloads', async function () {
      const projectId = `project-primitive-capture-${Date.now()}`;
      const projectKey = `tm_proj_primitive_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-primitive-capture',
        name: 'Primitive Capture Project',
        projectKey,
        blockedSources: [],
        ['mcp' + 'Tokens']: [],
        createdAt: new Date(),
      });

      const eventName = 'purchase_completed';
      const result = await ingestCapturePayload({
        projectKey,
        type: 'custom',
        eventName,
        platform: 'android',
        path: 'CheckoutActivity',
        source: {
          type: 'android',
          packageName: 'com.example.android',
        },
        properties: {
          plan: 'pro',
          amount: 29,
          trial: false,
        },
        context: {
          retry: true,
          source: 'pricing',
        },
      }, { headers: {} });
      const behavior = await RawBehaviors.findOneAsync({ projectId });

      assert.deepStrictEqual(result, { ok: true, ignored: false });
      assert.strictEqual(behavior.properties.plan, 'pro');
      assert.strictEqual(behavior.properties.amount, 29);
      assert.strictEqual(behavior.properties.trial, false);
      assert.strictEqual(behavior.context.retry, true);
      assert.strictEqual(behavior.context.source, 'pricing');
    });

    it('accepts batched native capture payloads with per-event sources', async function () {
      const projectId = `project-batch-capture-${Date.now()}`;
      const projectKey = `tm_proj_batch_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-batch-capture',
        name: 'Batch Capture Project',
        projectKey,
        blockedSources: [{ sourceType: 'android', sourceKey: 'com.blocked.app', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload({
        projectKey,
        sessionId: 'tm_sess_batch',
        anonymousId: 'tm_anon_batch',
        events: [
          {
            type: 'page_view',
            platform: 'ios',
            path: 'CheckoutView',
            source: {
              type: 'ios',
              bundleId: 'com.example.ios',
              label: 'Example iOS',
              details: { framework: 'swift' },
            },
          },
          {
            type: 'click',
            platform: 'android',
            path: 'CheckoutActivity',
            targetHash: 'tm_target_android',
            source: {
              type: 'android',
              packageName: 'com.example.android',
              label: 'Example Android',
            },
          },
          {
            type: 'click',
            platform: 'android',
            path: 'BlockedActivity',
            source: {
              type: 'android',
              packageName: 'com.blocked.app',
            },
          },
        ],
      }, { headers: {} });

      const behaviors = await RawBehaviors.find({ projectId }, { sort: { platform: 1 } }).fetchAsync();
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.accepted, 2);
      assert.strictEqual(result.ignored, 1);
      assert.strictEqual(behaviors.length, 2);
      assert.deepStrictEqual(behaviors.map((behavior) => behavior.platform).sort(), ['android', 'ios']);
      assert.ok(behaviors.some((behavior) => (
        behavior.platform === 'ios'
        && behavior.sourceType === 'ios'
        && behavior.sourceKey === 'com.example.ios'
        && behavior.sourceDetails.framework === 'swift'
      )));
      assert.ok(behaviors.some((behavior) => (
        behavior.platform === 'android'
        && behavior.sourceType === 'android'
        && behavior.sourceKey === 'com.example.android'
        && behavior.sessionId === 'tm_sess_batch'
        && behavior.anonymousId === 'tm_anon_batch'
      )));
    });

    it('accepts MCP server and agent skill capture sources', async function () {
      const projectId = `project-mcp-source-capture-${Date.now()}`;
      const projectKey = `tm_proj_mcp_source_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-mcp-source-capture',
        name: 'MCP Source Capture Project',
        projectKey,
        blockedSources: [{ sourceType: 'agent_skill', sourceKey: 'blocked-skill', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload({
        projectKey,
        sessionId: 'tm_sess_mcp',
        anonymousId: 'tm_anon_mcp',
        events: [
          {
            type: 'tool_call',
            eventName: 'mcp_tool_call',
            platform: 'server',
            path: 'mcp://tool/sync_docs',
            target: { type: 'mcp_tool', name: 'sync_docs', sourceKey: 'docs-mcp' },
            targetHash: 'tm_target_tool_sync_docs',
            source: {
              type: 'mcp_server',
              key: 'docs-mcp',
              label: 'Docs MCP',
              details: { language: 'javascript', runtime: 'node', sdkVersion: '0.1.0' },
            },
            properties: {
              toolName: 'sync_docs',
              status: 'success',
              durationMs: 12,
              resultSizeBucket: 'small',
            },
          },
          {
            type: 'skill_lifecycle',
            eventName: 'agent_skill_lifecycle',
            platform: 'server',
            source: {
              type: 'agent_skill',
              key: 'docs-indexer',
              label: 'Docs Indexer Skill',
              details: { version: '1.2.0' },
            },
            properties: { phase: 'completed', success: true },
          },
          {
            type: 'skill_lifecycle',
            eventName: 'agent_skill_lifecycle',
            platform: 'server',
            source: {
              type: 'agent_skill',
              key: 'blocked-skill',
            },
          },
        ],
      }, { headers: {} });

      const behaviors = await RawBehaviors.find({ projectId }, { sort: { sourceType: 1 } }).fetchAsync();

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.accepted, 2);
      assert.strictEqual(result.ignored, 1);
      assert.strictEqual(behaviors.length, 2);
      assert.ok(behaviors.some((behavior) => (
        behavior.sourceType === 'mcp_server'
        && behavior.sourceKey === 'docs-mcp'
        && behavior.platform === 'server'
        && behavior.type === 'tool_call'
        && behavior.eventName === 'mcp_tool_call'
        && behavior.properties.durationMs === 12
        && behavior.target.name === 'sync_docs'
      )));
      assert.ok(behaviors.some((behavior) => (
        behavior.sourceType === 'agent_skill'
        && behavior.sourceKey === 'docs-indexer'
        && behavior.type === 'skill_lifecycle'
        && behavior.properties.success === true
      )));
    });

    it('accepts server app capture sources and applies source blocking', async function () {
      const projectId = `project-server-source-capture-${Date.now()}`;
      const projectKey = `tm_proj_server_source_${Date.now()}`;
      await Projects.insertAsync({
        _id: projectId,
        developerId: 'developer-server-source-capture',
        name: 'Server Source Capture Project',
        projectKey,
        blockedSources: [{ sourceType: 'server_app', sourceKey: 'blocked-api', blockedAt: new Date() }],
        mcpTokens: [],
        createdAt: new Date(),
      });

      const result = await ingestCapturePayload({
        projectKey,
        sessionId: 'tm_sess_server',
        anonymousId: 'tm_anon_server',
        events: [
          {
            type: 'custom',
            eventName: 'invoice_paid',
            platform: 'server',
            source: {
              type: 'server_app',
              key: 'billing-api',
              label: 'Billing API',
              details: {
                language: 'javascript',
                runtime: 'node',
                sdkVersion: '0.1.0',
                framework: 'express',
                requestBody: 'do not store',
                headers: { authorization: 'do not store' },
                'headers.authorization': 'do not store',
              },
            },
            properties: {
              amount: 2900,
              success: true,
              'request.body': 'do not store',
              'response.body': 'do not store',
            },
            context: {
              source: 'stripe_webhook',
              'headers.authorization': 'do not store',
              'cookies.session': 'do not store',
            },
          },
          {
            type: 'custom',
            eventName: 'invoice_paid',
            platform: 'server',
            source: {
              type: 'server_app',
              key: 'blocked-api',
            },
          },
        ],
      }, { headers: {} });

      const behaviors = await RawBehaviors.find({ projectId }).fetchAsync();

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.accepted, 1);
      assert.strictEqual(result.ignored, 1);
      assert.strictEqual(behaviors.length, 1);
      assert.strictEqual(behaviors[0].sourceType, 'server_app');
      assert.strictEqual(behaviors[0].sourceKey, 'billing-api');
      assert.strictEqual(behaviors[0].platform, 'server');
      assert.strictEqual(behaviors[0].eventName, 'invoice_paid');
      assert.strictEqual(behaviors[0].properties.amount, 2900);
      assert.strictEqual(behaviors[0].properties.success, true);
      assert.strictEqual(behaviors[0].properties['request.body'], undefined);
      assert.strictEqual(behaviors[0].context.source, 'stripe_webhook');
      assert.strictEqual(behaviors[0].context['headers.authorization'], undefined);
      assert.strictEqual(behaviors[0].sourceDetails.framework, 'express');
      assert.strictEqual(behaviors[0].sourceDetails.requestBody, undefined);
      assert.strictEqual(behaviors[0].sourceDetails.headers, undefined);
      assert.strictEqual(JSON.stringify(behaviors[0]).includes('do not store'), false);
    });

    it('requires a Meteor Accounts session for the dashboard', async function () {
      const dashboardMethod = Meteor.server.method_handlers['tracemind.dashboard'];

      await assert.rejects(
        () => dashboardMethod.apply({}, []),
        /Login is required/,
      );
    });

    it('queries semantic events by time, event name, and user id', async function () {
      const projectId = `project-query-${Date.now()}`;
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_started',
        userId: 'user-a',
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'custom',
        eventName: 'checkout_finished',
        userId: 'user-b',
        occurredAt: new Date('2026-05-02T10:00:00.000Z'),
        createdAt: new Date(),
      });

      const events = await SemanticEvents.find(
        buildEventQuery(projectId, {
          eventName: 'checkout_started',
          userId: 'user-a',
          startAt: '2026-05-01T00:00:00.000Z',
          endAt: '2026-05-01T23:59:59.999Z',
        }),
      ).fetchAsync();

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].eventName, 'checkout_started');
      assert.strictEqual(events[0].userId, 'user-a');
    });

    it('queries raw and semantic events by traffic attribution fields', async function () {
      const projectId = `project-attribution-query-${Date.now()}`;
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'page_view',
        eventName: 'page_view',
        attribution: {
          source: 'github',
          medium: 'social',
          campaign: 'launch-week',
          landingPath: '/pricing',
        },
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'page_view',
        eventName: 'page_view',
        attribution: {
          source: 'direct',
          medium: 'direct',
          landingPath: '/',
        },
        occurredAt: new Date('2026-05-01T11:00:00.000Z'),
        createdAt: new Date(),
      });
      await RawBehaviors.insertAsync({
        projectId,
        type: 'page_view',
        attribution: {
          source: 'github',
          medium: 'social',
          campaign: 'launch-week',
          landingPath: '/pricing',
        },
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });
      await RawBehaviors.insertAsync({
        projectId,
        type: 'page_view',
        attribution: {
          source: 'direct',
          medium: 'direct',
          landingPath: '/',
        },
        occurredAt: new Date('2026-05-01T11:00:00.000Z'),
        createdAt: new Date(),
      });

      const semanticEvents = await SemanticEvents.find(
        buildEventQuery(projectId, {
          attributionSource: 'github',
          attributionMedium: 'social',
          attributionCampaign: 'launch-week',
          landingPath: '/pricing',
        }),
      ).fetchAsync();
      const rawBehaviors = await RawBehaviors.find(
        buildRawBehaviorQuery(projectId, {
          attributionSource: 'github',
          attributionMedium: 'social',
          attributionCampaign: 'launch-week',
          landingPath: '/pricing',
        }),
      ).fetchAsync();

      assert.strictEqual(semanticEvents.length, 1);
      assert.strictEqual(semanticEvents[0].attribution.source, 'github');
      assert.strictEqual(rawBehaviors.length, 1);
      assert.strictEqual(rawBehaviors[0].attribution.source, 'github');
    });

    it('filters MCP semantic event queries by traffic attribution', async function () {
      const { callMcpTool } = await import('../server/capture_routes');
      const projectId = `project-mcp-attribution-query-${Date.now()}`;
      const project = { _id: projectId, name: 'MCP Attribution Project' };
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'page_view',
        eventName: 'page_view',
        path: '/pricing',
        meaning: 'GitHub visit',
        attribution: {
          source: 'github',
          medium: 'social',
          campaign: 'launch-week',
          landingPath: '/pricing',
        },
        occurredAt: new Date('2026-05-01T10:00:00.000Z'),
        createdAt: new Date(),
      });
      await SemanticEvents.insertAsync({
        projectId,
        eventType: 'page_view',
        eventName: 'page_view',
        path: '/',
        meaning: 'Direct visit',
        attribution: {
          source: 'direct',
          medium: 'direct',
          landingPath: '/',
        },
        occurredAt: new Date('2026-05-01T11:00:00.000Z'),
        createdAt: new Date(),
      });

      const result = await callMcpTool(project, 'tracemind.query_events', {
        attributionSource: 'github',
        attributionCampaign: 'launch-week',
      });

      assert.strictEqual(result.structuredContent.events.length, 1);
      assert.strictEqual(result.structuredContent.events[0].attribution.source, 'github');
      assert.strictEqual(result.structuredContent.events[0].attribution.campaign, 'launch-week');
    });
  }
});
