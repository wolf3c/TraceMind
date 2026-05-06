<script>
  import { Accounts } from "meteor/accounts-base";
  import { Meteor } from "meteor/meteor";
  import { Tracker } from "meteor/tracker";
  import { onMount, onDestroy } from "svelte";

  let email = "";
  let code = "";
  let projectName = "";
  let userId = null;
  let dashboard = null;
  let status = "";
  let loading = false;
  let computation;

  $: primaryProject = dashboard?.projects?.[0];
  $: summary = dashboard?.summary;
  $: latestDau = summary?.dailyActiveUsers?.[summary.dailyActiveUsers.length - 1]?.count || 0;
  $: captureSnippet = primaryProject
    ? `<script src="${location.origin}/capture.js" data-tracemind-token="${primaryProject.projectKey}" async><\/script>`
    : "";
  $: mcpUrl = primaryProject ? `${location.origin}/mcp?projectKey=${primaryProject.projectKey}` : "";

  function callMethod(name, ...args) {
    return new Promise((resolve, reject) => {
      Meteor.call(name, ...args, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  function errorMessage(error) {
    const messages = {
      "invalid-email": "请输入有效的邮箱地址。",
      "invalid-code": "验证码无效或已过期。",
      "not-authorized": "请先登录。",
      "not-found": "没有找到对应项目。",
    };
    const reason = error.reason || error.message || "";

    if (reason.includes("Expired token")) return "验证码已过期，请重新获取。";
    if (reason.includes("token mismatch") || reason.includes("Email or token mismatch")) return "验证码不正确，请检查邮件后重试。";

    return messages[error.error] || reason;
  }

  function requestLoginToken(options) {
    return new Promise((resolve, reject) => {
      Accounts.requestLoginTokenForUser(options, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  function passwordlessLogin(selector, token) {
    return new Promise((resolve, reject) => {
      Meteor.passwordlessLoginWithToken(selector, token, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async function requestCode() {
    loading = true;
    status = "";
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await requestLoginToken({
        selector: { email: normalizedEmail },
        userData: { email: normalizedEmail },
      });
      status = "验证码已发送，请检查邮箱。也可以点击邮件中的登录链接直接进入。";
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function verifyCode() {
    loading = true;
    status = "";
    try {
      await passwordlessLogin({ email: email.trim().toLowerCase() }, code.trim());
      await loadDashboard();
      status = "已登录。";
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  async function loadDashboard() {
    if (!Meteor.userId()) return;
    dashboard = await callMethod("tracemind.dashboard");
  }

  async function createProject() {
    const name = projectName.trim();
    if (!name) return;

    loading = true;
    status = "";
    try {
      await callMethod("tracemind.project.create", name);
      projectName = "";
      await loadDashboard();
      status = "项目已创建。";
    } catch (error) {
      status = errorMessage(error);
    } finally {
      loading = false;
    }
  }

  function logout() {
    Meteor.logout(() => {
      userId = null;
      dashboard = null;
    });
  }

  onMount(() => {
    computation = Tracker.autorun(() => {
      userId = Meteor.userId();
      if (userId && window.TraceMind) {
        window.TraceMind.identify(userId);
      }
      if (!userId) {
        dashboard = null;
        return;
      }
      if (!dashboard) {
        loadDashboard().catch((error) => {
          status = errorMessage(error);
        });
      }
    });
  });

  onDestroy(() => {
    computation?.stop?.();
  });
</script>

<main class="shell">
  <section class="hero">
    <nav class="nav">
      <div class="brand">
        <span class="brand-mark">T</span>
        <span>TraceMind</span>
      </div>
      {#if dashboard}
        <button class="ghost" on:click={logout}>退出登录</button>
      {/if}
    </nav>

    <div class="hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">AI 原生行为智能平台</p>
        <h1>不用手写复杂埋点，也能理解用户真实行为。</h1>
        <p class="lede">
          TraceMind 通过一行脚本自动采集 Web 产品中的原始行为，并将其抽取为可读的语义事件，
          让 Codex、Claude Code、Cursor 等 AI Coding Agent 直接通过远程 MCP 查询产品数据。
        </p>
        <div class="hero-actions">
          <a href="#console" class="button">开始接入</a>
          <a href="#how" class="button secondary">查看流程</a>
        </div>
      </div>

      <div class="signal-panel" aria-label="TraceMind 数据流">
        <div class="signal-row">
          <span>原始行为</span>
          <strong>click, page_view, submit</strong>
        </div>
        <div class="signal-row">
          <span>语义理解</span>
          <strong>查看价格页、提交注册表单</strong>
        </div>
        <div class="signal-row">
          <span>AI Agent 访问</span>
          <strong>通过 Codex、Claude Code、Cursor 提问</strong>
        </div>
      </div>
    </div>
  </section>

  <section id="how" class="workflow">
    <div>
      <p class="section-label">MVP 接入流程</p>
      <h2>一行代码，创建产品行为理解层。</h2>
    </div>
    <div class="one-line-example">
      <div>
        <span>接入示例</span>
        <strong>把这行代码放到你的 Web 产品页面中</strong>
      </div>
      <code>&lt;script src="{location.origin}/capture.js" data-tracemind-token="tm_proj_xxx" async&gt;&lt;/script&gt;</code>
    </div>
    <div class="steps">
      <article>
        <span>01</span>
        <h3>邮箱登录</h3>
        <p>使用邮箱验证码登录，获取项目 key 和接入代码。</p>
      </article>
      <article>
        <span>02</span>
        <h3>自动采集</h3>
        <p>复制一行全局脚本，即可记录页面访问、点击、输入、表单和路由变化。</p>
      </article>
      <article>
        <span>03</span>
        <h3>语义事件</h3>
        <p>服务端定时将 Raw Behavior 抽取为稳定、可读的行为事件。</p>
      </article>
      <article>
        <span>04</span>
        <h3>远程 MCP</h3>
        <p>把 MCP 地址添加到 AI Coding Agent，通过对话查看产品数据。</p>
      </article>
    </div>
  </section>

  <section id="console" class="console">
    <div class="console-header">
      <p class="section-label">开发者控制台</p>
      <h2>登录后复制项目 key，即可开始采集。</h2>
    </div>

    {#if !dashboard}
      <div class="auth-panel">
        <label>
          邮箱
          <input bind:value={email} type="email" placeholder="you@example.com" autocomplete="email" />
        </label>
        <div class="auth-actions">
          <button on:click={requestCode} disabled={loading}>发送验证码</button>
        </div>
        <label>
          验证码
          <input bind:value={code} inputmode="numeric" placeholder="123456" />
        </label>
        <button on:click={verifyCode} disabled={loading}>登录</button>
      </div>
    {:else}
      <div class="dashboard-grid">
        <aside class="account-panel">
          <span>当前账号</span>
          <strong>{dashboard.developer.email}</strong>
          <p>{dashboard.projects.length} 个项目，{dashboard.rawCount} 条原始行为，{dashboard.semanticCount} 条语义事件。</p>
          <div class="metrics" aria-label="行为分析摘要">
            <div>
              <span>用户数</span>
              <strong>{summary?.uniqueUsers || 0}</strong>
            </div>
            <div>
              <span>DAU</span>
              <strong>{latestDau}</strong>
            </div>
            <div>
              <span>设备数</span>
              <strong>{summary?.uniqueDevices || 0}</strong>
            </div>
          </div>
          <label>
            新建项目
            <input bind:value={projectName} placeholder="生产环境 Web App" />
          </label>
          <button on:click={createProject} disabled={loading || !projectName.trim()}>创建项目</button>
        </aside>

        <div class="setup-panel">
          {#if primaryProject}
            <div class="project-title">
              <span>项目</span>
              <strong>{primaryProject.name}</strong>
            </div>
            <label>
              项目 key
              <input readonly value={primaryProject.projectKey} />
            </label>
            <label>
              一行 Auto Capture 代码
              <textarea readonly rows="3">{captureSnippet}</textarea>
            </label>
            <label>
              远程 MCP 地址
              <input readonly value={mcpUrl} />
            </label>
          {/if}
        </div>
      </div>

      <div class="events">
        <div class="events-header">
          <h3>最近的语义事件</h3>
          <button class="ghost" on:click={loadDashboard}>刷新</button>
        </div>
        {#if dashboard.recentEvents.length}
          <ul>
            {#each dashboard.recentEvents as event (event._id)}
              <li>
                <strong>{event.title}</strong>
                <span>{event.meaning}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">暂时没有语义事件。把脚本添加到 Web 产品后，产生行为并刷新即可查看。</p>
        {/if}
      </div>
    {/if}

    {#if status}
      <p class="status">{status}</p>
    {/if}
  </section>
</main>
