import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { buildSemanticEvent, summarizeSemanticEvents } from '../imports/api/semantic';
import {
  Developers,
  Projects,
  RawBehaviors,
  SemanticEvents,
  buildEventQuery,
  buildRawBehaviorQuery,
  isSourceBlocked,
  mcpServerNameForProject,
  normalizeCaptureSource,
  normalizeEmail,
  summarizeBehaviorSources,
} from '../imports/api/tracemind';
import { buildAgentInstallPrompt } from '../imports/ui/agent_setup';
import { resolveConsoleState } from '../imports/ui/console_state';
import {
  resolveInitialProjectSummaryState,
  resolveSelectedProjectId,
  shouldApplyProjectSummaryResponse,
} from '../imports/ui/project_console_state';
import enMessages from '../imports/ui/i18n/locales/en';
import zhMessages from '../imports/ui/i18n/locales/zh';
import { normalizeLocaleValue, translateMessage } from '../imports/ui/i18n/i18n';

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
      assert.ok(!prompt.includes('tracemind-my-web-app'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/SKILL.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/AGENTS_SNIPPET.md'));
      assert.ok(prompt.includes('https://local.example/agents/tracemind/manifest.json'));
      assert.ok(prompt.includes('不要覆盖已有配置，只能合并或追加'));
      assert.ok(prompt.includes('请不要创建自定义 skill 目录'));
      assert.ok(prompt.includes('如果已经安装过 TraceMind Skill 或已经追加过 TraceMind rules'));
      assert.ok(prompt.includes('如果已有同名 MCP server `tracemind-abc123`'));
      assert.ok(prompt.includes('如果已有其他 `tracemind-*` TraceMind MCP server'));
      assert.ok(prompt.includes('如果已有旧的 `tracemind` MCP server'));
      assert.ok(prompt.includes('优先读取 MCP tools/list 的描述或调用 `tracemind.project_info`'));
      assert.ok(prompt.includes('不要把 MCP URL、mcpToken 或 Bearer token 写入 AGENTS.md'));
      assert.ok(prompt.includes('通过 `tracemind.capture_setup` 获取 Web Auto Capture 接入脚本'));
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
      assert.ok(!prompt.includes('tracemind-customer-portal'));
      assert.ok(prompt.includes('Do not create a custom skill directory'));
      assert.ok(prompt.includes('If TraceMind Skill or TraceMind rules already exist'));
      assert.ok(prompt.includes('If an MCP server named `tracemind-xyz789` already exists'));
      assert.ok(prompt.includes('If other `tracemind-*` TraceMind MCP servers exist'));
      assert.ok(prompt.includes('If an old `tracemind` MCP server exists'));
      assert.ok(prompt.includes('Prefer MCP tools/list descriptions or call `tracemind.project_info`'));
      assert.ok(prompt.includes('Do not write the MCP URL, mcpToken, or Bearer token into AGENTS.md'));
      assert.ok(prompt.includes('Call `tracemind.capture_setup` to retrieve the Web Auto Capture script'));
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

      assert.ok(skill.includes('version: 2026.05.08.4'));
      assert.ok(skill.includes('## Auto Capture Setup'));
      assert.ok(skill.includes('## Native SDK Setup Details'));
      assert.ok(skill.includes('## Instrumenting MCP Servers'));
      assert.ok(skill.includes('## Instrumenting Agent Skills'));
      assert.ok(skill.includes('static Skill file cannot auto-capture'));
      assert.ok(skill.includes('installCommands'));
      assert.ok(skill.includes('idempotencyChecks'));
      assert.ok(skill.includes('manualCaptureExamples'));
      assert.ok(skill.includes('identifySnippet'));
      assert.ok(skill.includes('tracemind.project_info'));
      assert.ok(snippet.includes('TraceMind Instrumentation Rules'));
      assert.ok(snippet.includes('Auto Capture before manual custom events'));
      assert.ok(snippet.includes('installCommands'));
      assert.ok(snippet.includes('manualCaptureWorkflow'));
      assert.ok(snippet.includes('supported primitives'));
      assert.ok(snippet.includes('mcp_node'));
      assert.ok(snippet.includes('agent_skill'));
      assert.ok(snippet.includes('tracemind.project_info'));
      assert.strictEqual(manifest.guidanceVersion, '2026.05.08.4');
      assert.strictEqual(manifest.resources.skill, '/agents/tracemind/SKILL.md');
      assert.strictEqual(manifest.mcp.serverNamePattern, 'tracemind-<project-code>');
      assert.strictEqual(manifest.mcp.serverName, undefined);
      assert.ok(manifest.mcp.tools.includes('tracemind.project_info'));
      assert.ok(manifest.mcp.tools.includes('tracemind.capture_setup'));
      assert.ok(manifest.platforms.includes('mcp_node'));
      assert.ok(manifest.platforms.includes('mcp_python'));
      assert.ok(manifest.platforms.includes('agent_skill'));
      assert.ok(manifest.updatePolicy.includes('tracemind.project_info'));
      [skill, snippet, JSON.stringify(manifest)].forEach((content) => {
        assert.ok(!content.includes('tm_mcp_'));
        assert.ok(!content.includes('tracemind.super-tree.com'));
      });
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
      assert.ok(toolNames.includes('tracemind.capture_setup'));
      assert.ok(toolNames.includes('tracemind.validate_event_payload'));
      assert.ok(toolNames.includes('tracemind.validate_instrumentation_diff'));

      const projectTools = mcpTools(project);
      assert.ok(projectTools.some((tool) => (
        tool.name === 'tracemind.summary'
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
      assert.strictEqual(guidance.structuredContent.guidanceVersion, '2026.05.08.4');
      assert.strictEqual(guidance.structuredContent.projectName, 'Agent Guidance Project');
      assert.strictEqual(guidance.structuredContent.mcpServerName, mcpServerNameForProject(project));
      assert.ok(guidance.structuredContent.workflow.includes('If multiple TraceMind MCP servers exist or the project is unclear, call tracemind.project_info first.'));
      assert.ok(guidance.structuredContent.workflow.includes('Call tracemind.capture_setup with platform web, ios, android, react_native, mcp_node, mcp_python, or agent_skill before installing Auto Capture or adding manual events.'));
      assert.ok(guidance.structuredContent.workflow.includes('Use capture_setup installCommands, filesToEdit, initLocation, idempotencyChecks, and initSnippet for platform setup.'));
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

      const missingEventNameValidation = await callMcpTool(project, 'tracemind.validate_event_payload', {
        eventType: 'custom',
        properties: {
          plan: 'pro',
        },
      });
      assert.strictEqual(missingEventNameValidation.structuredContent.ok, false);
      assert.ok(missingEventNameValidation.structuredContent.findings.some((finding) => finding.code === 'missing_custom_event_name'));

      const diffValidation = await callMcpTool(project, 'tracemind.validate_instrumentation_diff', {
        diff: "+ TraceMindMCP.capture('custom', { eventName: 'new_checkout_event', properties: { raw_prompt: userPrompt, raw_args: args, raw_result: result, resource_content: content, userEmail: user.email, access_token: token } })",
      });
      assert.strictEqual(diffValidation.structuredContent.ok, false);
      assert.ok(diffValidation.structuredContent.findings.some((finding) => finding.code === 'new_event_requires_review'));
      assert.ok(diffValidation.structuredContent.findings.filter((finding) => finding.code === 'forbidden_property').length >= 6);

      const mcpAutoDiffValidation = await callMcpTool(project, 'tracemind.validate_instrumentation_diff', {
        diff: "+ capture({ type: 'prompt_request', eventName: 'mcp_prompt_request', properties: { promptName: 'summarize', status: 'success', durationMs: 12 } })\n+ capture({ type: 'tool_call', eventName: 'mcp_tool_call', properties: { toolName: 'sync_docs', status: 'success' } })\n+ capture({ type: 'resource_read', eventName: 'mcp_resource_read', properties: { resourceName: 'docs', uriScheme: 'file' } })\n+ capture({ type: 'skill_lifecycle', eventName: 'agent_skill_lifecycle', properties: { skillName: 'docs-indexer', phase: 'completed' } })",
      });
      assert.strictEqual(mcpAutoDiffValidation.structuredContent.ok, true);
      assert.ok(!mcpAutoDiffValidation.structuredContent.findings.some((finding) => finding.path === 'eventName'));
      assert.ok(!mcpAutoDiffValidation.structuredContent.findings.some((finding) => finding.message.includes('promptName')));
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
      assert.ok(setup.structuredContent.filesToEdit.some((file) => file.includes('root layout')));
      assert.ok(setup.structuredContent.idempotencyChecks.some((check) => check.includes('data-tracemind-token')));
      assert.ok(setup.structuredContent.verificationCommands.some((command) => command.includes('query TraceMind')));
      assert.ok(setup.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
      assert.deepStrictEqual(setup.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
      assert.ok(setup.structuredContent.identifySnippet.includes('window.TraceMind.identify'));
      assert.ok(setup.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.search_event_names')));
      assert.ok(setup.structuredContent.manualCaptureWarnings.some((warning) => warning.includes('stable business outcomes')));
      assert.ok(setup.structuredContent.manualCaptureExamples.some((example) => example.includes('amount: 29')));
      assert.ok(setup.structuredContent.manualCaptureExample.includes('window.TraceMind.capture'));
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
      assert.strictEqual(setupTool.inputSchema.properties.platform.type, 'string');

      const ios = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'ios' });
      const android = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'android' });
      const reactNative = await callMcpTool(project, 'tracemind.capture_setup', { platform: 'react_native' });

      assert.strictEqual(ios.structuredContent.platform, 'ios');
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
      assert.ok(ios.structuredContent.manualCaptureExample.includes('TraceMind.capture'));

      assert.strictEqual(android.structuredContent.platform, 'android');
      assert.ok(android.structuredContent.install.includes('Gradle'));
      assert.ok(android.structuredContent.installCommands.some((step) => step.includes('Gradle')));
      assert.ok(android.structuredContent.filesToEdit.some((file) => file.includes('AndroidManifest.xml')));
      assert.ok(android.structuredContent.initLocation.includes('Application.onCreate()'));
      assert.ok(android.structuredContent.idempotencyChecks.some((check) => check.includes('Gradle')));
      assert.ok(android.structuredContent.initSnippet.includes('TraceMind.start(application, projectKey = "tm_proj_native")'));
      assert.ok(android.structuredContent.source.key.includes('package name'));
      assert.ok(android.structuredContent.sourceModel.includes('package name'));
      assert.ok(android.structuredContent.verificationCommands.includes('npm run test:sdk:android'));
      assert.ok(android.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(android.structuredContent.manualCaptureExamples.some((example) => example.includes('"amount" to 29')));
      assert.ok(android.structuredContent.manualCaptureExample.includes('TraceMind.capture'));

      assert.strictEqual(reactNative.structuredContent.platform, 'react_native');
      assert.ok(reactNative.structuredContent.install.includes('@tracemind/react-native'));
      assert.ok(reactNative.structuredContent.installCommands.some((step) => step.includes('@tracemind/react-native')));
      assert.ok(reactNative.structuredContent.filesToEdit.includes('package.json'));
      assert.ok(reactNative.structuredContent.initLocation.includes('bootstrap'));
      assert.ok(reactNative.structuredContent.idempotencyChecks.some((check) => check.includes('@tracemind/react-native')));
      assert.ok(reactNative.structuredContent.initSnippet.includes('TraceMind.start({ projectKey: "tm_proj_native" })'));
      assert.strictEqual(reactNative.structuredContent.eventPlatform, 'ios_or_android');
      assert.ok(reactNative.structuredContent.sourceModel.includes('Do not create a react_native platform value'));
      assert.ok(reactNative.structuredContent.verificationCommands.includes('npm test --prefix sdk/react-native'));
      assert.ok(reactNative.structuredContent.identifySnippet.includes('TraceMind.identify'));
      assert.ok(reactNative.structuredContent.manualCaptureExamples.some((example) => example.includes('amount: 29')));
      assert.ok(reactNative.structuredContent.manualCaptureExample.includes('TraceMind.capture'));

      [ios, android, reactNative].forEach((result) => {
        assert.strictEqual(result.structuredContent.tokenType, 'public_auto_capture_project_key');
        assert.ok(result.structuredContent.autoCapturedSignals.includes('input changed without input values'));
        assert.deepStrictEqual(result.structuredContent.supportedPropertyTypes, ['string', 'number', 'boolean']);
        assert.ok(result.structuredContent.manualCaptureWorkflow.some((step) => step.includes('tracemind.validate_event_payload')));
        assert.ok(result.structuredContent.privacyConstraints.some((constraint) => constraint.includes('Do not capture input values')));
        assert.ok(result.structuredContent.notes.some((note) => note.includes('Do not use the MCP token')));
        assert.ok(!JSON.stringify(result.structuredContent).includes('tm_mcp_'));
      });
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
      assert.ok(node.structuredContent.initSnippet.includes('TraceMindMCP.start(server'));
      assert.ok(node.structuredContent.initSnippet.includes('projectKey: "tm_proj_mcp_sdk"'));
      assert.ok(node.structuredContent.installCommands.some((step) => step.includes('@tracemind/mcp-node')));
      assert.ok(node.structuredContent.autoCapturedSignals.includes('MCP tool call completed'));
      assert.ok(node.structuredContent.privacyConstraints.some((constraint) => constraint.includes('tool arguments')));
      assert.ok(node.structuredContent.manualCaptureExample.includes('TraceMindMCP.capture'));
      assert.ok(node.structuredContent.sourceModel.includes('sourceType is mcp_server'));

      assert.strictEqual(python.structuredContent.platform, 'mcp_python');
      assert.strictEqual(python.structuredContent.eventPlatform, 'server');
      assert.ok(python.structuredContent.initSnippet.includes('TraceMindMCP.start(server'));
      assert.ok(python.structuredContent.initSnippet.includes('project_key="tm_proj_mcp_sdk"'));
      assert.ok(python.structuredContent.installCommands.some((step) => step.includes('tracemind-mcp')));
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
      'See how users actually use your product with one line of code.',
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
    assert.deepStrictEqual(event.properties, { plan: 'pro', amount: 29 });
    assert.deepStrictEqual(event.context, { source: 'manual' });
  });

  it('builds target-specific queries for repeated labels on the same page', function () {
    assert.deepStrictEqual(
      buildEventQuery('project-1', {
        path: '/settings',
        eventType: 'click',
        targetHash: 'tm_target_more_footer',
      }),
      {
        projectId: 'project-1',
        eventType: 'click',
        path: '/settings',
        targetHash: 'tm_target_more_footer',
      },
    );

    assert.deepStrictEqual(
      buildRawBehaviorQuery('project-1', {
        path: '/settings',
        eventType: 'click',
        targetHash: 'tm_target_more_footer',
      }),
      {
        projectId: 'project-1',
        type: 'click',
        path: '/settings',
        targetHash: 'tm_target_more_footer',
      },
    );
  });

  it('summarizes semantic event counts and paths', function () {
    const summary = summarizeSemanticEvents([
      { eventType: 'click', path: '/pricing', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T01:00:00.000Z') },
      { eventType: 'click', path: '/pricing', userId: 'user-1', deviceId: 'device-1', occurredAt: new Date('2026-05-06T02:00:00.000Z') },
      { eventType: 'page_view', path: '/', anonymousId: 'anon-1', deviceFingerprint: 'fp-1', occurredAt: new Date('2026-05-06T03:00:00.000Z') },
    ]);

    assert.deepStrictEqual(summary.topEvents[0], { eventType: 'click', count: 2 });
    assert.deepStrictEqual(summary.topPaths[0], { path: '/pricing', count: 2 });
    assert.strictEqual(summary.uniqueUsers, 2);
    assert.strictEqual(summary.uniqueDevices, 2);
    assert.deepStrictEqual(summary.dailyActiveUsers[0], { date: '2026-05-06', count: 2 });
  });

  it('normalizes capture sources with cross-platform source fields', function () {
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
      normalizeCaptureSource({ platform: 'ios', source: { key: 'com.example.app', label: 'Example iOS' } }),
      {
        sourceType: 'ios',
        sourceKey: 'com.example.app',
        sourceLabel: 'Example iOS',
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
          details: { language: 'javascript', runtime: 'node', sdkVersion: '0.1.0' },
        },
      }),
      {
        sourceType: 'mcp_server',
        sourceKey: 'docs-mcp',
        sourceLabel: 'Docs MCP',
        sourceDetails: { language: 'javascript', runtime: 'node', sdkVersion: '0.1.0' },
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

  if (Meteor.isServer) {
    let ingestCapturePayload;
    let resolveProjectByMcpToken;

    before(async function () {
      const captureRoutes = await import('../server/capture_routes');
      const methods = await import('../server/tracemind_methods');
      ingestCapturePayload = captureRoutes.ingestCapturePayload;
      resolveProjectByMcpToken = methods.resolveProjectByMcpToken;
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
      await Promise.all(Array.from({ length: 200 }, (_, index) => SemanticEvents.insertAsync({
        projectId: selectedProject._id,
        eventType: 'custom',
        eventName: `selected_window_event_${index}`,
        title: `Selected window event ${index}`,
        meaning: 'Selected project window event.',
        userId: 'selected-user',
        deviceId: 'selected-device',
        occurredAt: new Date(`2026-05-07T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
        createdAt: new Date(`2026-05-07T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
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

      const result = await projectSummaryMethod.apply({ userId }, [selectedProject._id]);

      assert.strictEqual(result.project._id, selectedProject._id);
      assert.strictEqual(result.rawCount, 1);
      assert.strictEqual(result.semanticCount, 201);
      assert.deepStrictEqual(result.summaryWindow, {
        semanticEventLimit: 200,
        rawBehaviorLimit: 500,
        semanticEventSampleSize: 200,
        rawBehaviorSampleSize: 1,
      });
      assert.strictEqual(result.summary.totalEvents, 200);
      assert.strictEqual(result.summary.uniqueUsers, 1);
      assert.strictEqual(result.summary.uniqueDevices, 1);
      assert.deepStrictEqual(result.sources.map((source) => source.sourceKey), ['selected.example']);
      assert.ok(result.recentEvents.some((event) => event.eventName === 'selected_event'));
      assert.strictEqual(result.recentEvents.some((event) => event.eventName === 'other_event'), false);
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
  }
});
