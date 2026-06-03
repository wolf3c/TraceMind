<script>
  import { t } from "./i18n/i18n";

  let {
    shouldShowIntro,
    userId,
    showIntro,
    selectedLocale = $bindable(),
    locales,
    localeLabels,
    setupDocsUrl,
    toggleIntro,
    changeLocale,
    logout,
  } = $props();
</script>

  <section class:hero-collapsed={!shouldShowIntro} class="hero">
    <nav class="nav">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="15" fill="#FFFDF8"/>
          <path d="M17 43V21h7.5L32 35l7.5-14H47v22" fill="none" stroke="#0F2F2A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M19 47c8-6 18-6 27 0" fill="none" stroke="#18A77A" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="47" cy="47" r="3.6" fill="#F2B84B"/>
        </svg>
        <span>TraceMind</span>
        {#if userId}
          <button class="intro-toggle" type="button" aria-expanded={showIntro} onclick={toggleIntro}>
            {showIntro ? $t("Hide introduction") : $t("Introduction")}
          </button>
        {/if}
      </div>
      <div class="nav-actions">
        <a class="github-link" href="https://github.com/wolf3c/TraceMind" target="_blank" rel="noreferrer" aria-label="GitHub">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.28-.01-1.22-.01-2.24-3.02.55-3.8-.74-4.04-1.41-.13-.34-.72-1.41-1.23-1.69-.42-.23-1.02-.78-.01-.8.94-.01 1.62.87 1.84 1.23 1.08 1.82 2.81 1.3 3.5.99.1-.78.42-1.3.76-1.6-2.67-.3-5.46-1.34-5.46-5.93 0-1.3.47-2.38 1.23-3.22-.12-.3-.54-1.53.12-3.18 0 0 1-.32 3.3 1.23.96-.27 1.98-.41 3-.41s2.04.14 3 .41c2.3-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.23 1.92 1.23 3.22 0 4.61-2.8 5.62-5.47 5.93.43.37.81 1.09.81 2.21 0 1.6-.01 2.9-.01 3.3 0 .32.22.69.82.58A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
        <label class="language-label" for="locale-select">
          <span class="sr-only">{$t("Language")}</span>
          <select id="locale-select" bind:value={selectedLocale} onchange={changeLocale}>
            {#each locales as localeCode (localeCode)}
              <option value={localeCode}>{$t(localeLabels[localeCode] || localeCode)}</option>
            {/each}
          </select>
        </label>
        {#if !userId}
          <a class="button nav-login-link" href="#login">{$t("Log in")}</a>
        {/if}
        {#if userId}
          <button class="ghost" type="button" onclick={logout}>{$t("Log out")}</button>
        {/if}
      </div>
    </nav>

    {#if shouldShowIntro}
    <div class="hero-grid">
      <div class="hero-copy">
        <h1>
          <span>{$t("Let Coding Agents understand")}</span>
          <span>{$t("daily product behavior")}</span>
        </h1>
        <p class="lede">{$t("TraceMind turns real user behavior into daily health, AI-readable evidence, and MCP tools so your Coding Agent can see what changed, what users did, and what to improve next.")}</p>
        <div class="hero-actions">
          <a href={userId ? "#console" : "#login"} class="button">{$t("Let Agent set it up")}</a>
          <a href={setupDocsUrl} class="button secondary" target="_blank" rel="noreferrer">{$t("View setup docs")}</a>
        </div>
        <p class="hero-proof">{$t("Prompt-based setup · AI-readable evidence · independent MCP token authorization")}</p>
      </div>

      <div class="product-board" aria-label={$t("TraceMind product mechanism")}>
        <div class="command-card">
          <div class="board-header">
            <div>
              <h2>{$t("Ask your Coding Agent for today's product health")}</h2>
              <p>{$t("The Agent reads the daily health report first, then drills into summaries, semantic events, and raw evidence only when needed.")}</p>
            </div>
            <div class="project-key">tm_proj_xxx</div>
          </div>
          <div class="command-bubble">“{$t("Check whether product behavior is healthy today and explain what changed.")}”</div>
          <div class="agent-steps">
            <span>{$t("Read project health")}</span>
            <span>{$t("Find attention item")}</span>
            <span>{$t("Drill into evidence")}</span>
            <span>{$t("Suggest next step")}</span>
          </div>
        </div>
        <div class="analysis-grid">
          <article class="analysis-card">
            <span>{$t("Health first")}</span>
            <strong>{$t("Start from the daily report, not a blank query")}</strong>
            <ul>
              <li>{$t("See attention reasons and changes versus the previous day.")}</li>
              <li>{$t("Separate product usage drops from delivery or capture health issues.")}</li>
              <li>{$t("Move from headline metrics into reviewable behavior evidence.")}</li>
            </ul>
          </article>
          <article class="analysis-card">
            <span>{$t("Agent drilldown")}</span>
            <strong>{$t("Answer feature usage and anomaly questions with evidence")}</strong>
            <ul>
              <li>{$t("Analyze usage by path, semantic event, device, user, or session.")}</li>
              <li>{$t("Explain drops with the exact window and behavior trail.")}</li>
              <li>{$t("Use raw behavior only when semantic evidence is not enough.")}</li>
            </ul>
          </article>
        </div>
        <div class="evidence-stream">
          <div class="stream-line"><span>{$t("Project health")}</span><strong>{$t("Active sessions down 53% vs previous day")}</strong></div>
          <div class="stream-line"><span>{$t("Agent question")}</span><strong>{$t("Which users reached pricing but did not submit? Why?")}</strong></div>
          <div class="stream-line"><span>{$t("Evidence drilldown")}</span><strong>/pricing -> signup -> submit failed</strong></div>
        </div>
        <div class="loop-preview">
          <div class="mini-cycle" aria-hidden="true"></div>
          <div>
            <h3>{$t("Feedback stays a secondary, confirmed action")}</h3>
            <p>{$t("The main flow is read-only analysis. submit_feedback is used only after the Agent finds an issue and the developer confirms it should be reported.")}</p>
          </div>
        </div>
      </div>
    </div>
    {/if}
  </section>

  {#if shouldShowIntro}
  <section id="how" class="workflow">
    <div>
      <p class="section-label">{$t("AI-driven Vibe Analytics")}</p>
      <h2>{$t("Auto Capture plus AI-readable behavior evidence, without rebuilding your analytics stack")}</h2>
    </div>
    <div class="agent-setup-example">
      <span>{$t("Setup command")}</span>
      <strong>{$t("Tell your Coding Agent: connect TraceMind to the current project and verify behavior capture.")}</strong>
      <code>tm_proj_xxx</code>
    </div>
    <div class="feature-grid">
      <article>
        <span class="tm-badge tm-badge-signal">{$t("Auto Capture")}</span>
        <h3>{$t("Auto capture")}</h3>
        <p>{$t("TraceMind automatically records Web pages, iOS/Android interactions, macOS windows, route changes, and active time after setup.")}</p>
      </article>
      <article>
        <span class="tm-badge tm-badge-amber">{$t("AI-driven")}</span>
        <h3>{$t("AI-readable evidence")}</h3>
        <p>{$t("TraceMind keeps raw behavior, extracts semantic events, and exposes reviewable MCP evidence so agents can analyze product usage directly.")}</p>
      </article>
    </div>
    <p class="supported-platforms">{$t("Supported platforms: Web · iOS · macOS · Android · React Native · Hybrid (Electron / Tauri / Capacitor / Cordova) · Mini Program (WeChat / Alipay / Douyin / DingTalk) · Browser Extension (Chrome / Edge / Firefox) · Server · MCP · Agent Skill")}</p>
  </section>

  <section class="workflow product-iteration">
    <div>
      <p class="section-label">{$t("AI + MCP analysis")}</p>
      <h2>{$t("Let Coding Agents answer product health questions directly")}</h2>
      <p class="section-intro">{$t("TraceMind is not just another report. It gives daily health, real behavior evidence, and MCP query tools to AI so it can explain changes and produce an actionable next step.")}</p>
    </div>
    <div class="solution-grid">
      <article class="solution-card">
        <div class="solution-icon">1</div>
        <h3>{$t("Start with today's health")}</h3>
        <p>{$t("AI reads attention reasons, trend changes, active usage, event volume, and delivery health before choosing a drilldown path.")}</p>
      </article>
      <article class="solution-card">
        <div class="solution-icon">2</div>
        <h3>{$t("Analyze feature usage")}</h3>
        <p>{$t("AI combines pages, events, sources, devices, cohorts, and time windows to explain which workflows users actually touched.")}</p>
      </article>
      <article class="solution-card">
        <div class="solution-icon">3</div>
        <h3>{$t("Investigate drops and anomalies")}</h3>
        <p>{$t("Coding Agents can move from a falling metric to the exact path, event, session, or capture issue that explains it.")}</p>
      </article>
    </div>
  </section>

  <section class="workflow cycle-section">
    <div>
      <h2>{$t("Two AI-driven loops make your product stronger over time")}</h2>
      <p class="section-intro">{$t("One loop helps you improve product experience faster. The other lets evidence-backed feedback improve TraceMind analysis, SDKs, and Agent guidance.")}</p>
    </div>
    <div class="cycle-duo">
      <article class="cycle-card">
        <h3>{$t("Your product growth loop")}</h3>
        <p>{$t("TraceMind gives real usage evidence to AI and automates the work of reading reports, joining data, and guessing causes.")}</p>
        <div class="cycle-diagram">
          <div class="cycle-ring" aria-hidden="true"></div>
          <div class="cycle-core">{$t("AI driven")}</div>
          <div class="cycle-node node-1"><span>1</span>{$t("Real user behavior")}</div>
          <div class="cycle-node node-2"><span>2</span>{$t("TraceMind automatically organizes evidence")}</div>
          <div class="cycle-node node-3"><span>3</span>{$t("Agent automatically analyzes and suggests")}</div>
          <div class="cycle-node node-4"><span>4</span>{$t("Experience improves after product changes")}</div>
          <div class="cycle-arrow a">→</div>
          <div class="cycle-arrow b">→</div>
          <div class="cycle-arrow c">→</div>
          <div class="cycle-arrow d">→</div>
        </div>
      </article>
      <article class="cycle-card dark">
        <h3>{$t("TraceMind intelligence loop")}</h3>
        <p>{$t("Your evidence-backed feedback flows back, and TraceMind keeps improving analysis models, SDKs, and Agent guidance.")}</p>
        <div class="cycle-diagram">
          <div class="cycle-ring" aria-hidden="true"></div>
          <div class="cycle-core">{$t("AI optimization")}</div>
          <div class="cycle-node node-1"><span>1</span>{$t("Your issue feedback")}</div>
          <div class="cycle-node node-2"><span>2</span>{$t("MCP feedback with evidence")}</div>
          <div class="cycle-node node-3"><span>3</span>{$t("Improve TraceMind analysis / SDK / guidance")}</div>
          <div class="cycle-node node-4"><span>4</span>{$t("Next analysis is faster and more accurate")}</div>
          <div class="cycle-arrow a">→</div>
          <div class="cycle-arrow b">→</div>
          <div class="cycle-arrow c">→</div>
          <div class="cycle-arrow d">→</div>
        </div>
      </article>
    </div>
  </section>

  <section class="workflow proof-section">
    <div>
      <h2>{$t("Daily health becomes agent-readable product evidence")}</h2>
    </div>
    <div class="proof-grid">
      <div class="evidence-panel">
        <div class="signal-row">
          <span>{$t("Health signal")}</span>
          <strong>{$t("Active sessions dropped versus the previous day")}</strong>
        </div>
        <div class="signal-row">
          <span>{$t("Agent drilldown")}</span>
          <strong>/pricing -> signup -> submit failed</strong>
        </div>
        <div class="signal-row">
          <span>{$t("Behavior evidence")}</span>
          <strong>click, input, submit, route_change, online segment</strong>
        </div>
        <div class="signal-row">
          <span>{$t("Next step")}</span>
          <strong>{$t("Review the signup failure path, then confirm whether to submit structured feedback.")}</strong>
        </div>
      </div>
      <div class="impact-panel">
        <h3>{$t("Why is this faster than traditional analytics?")}</h3>
        <div class="impact-list">
          <div class="impact-item">{$t("The Agent starts from a computed daily health report instead of inventing a query plan from scratch.")}</div>
          <div class="impact-item">{$t("AI can ask directly about behavior context and return reviewable analysis and improvement suggestions.")}</div>
          <div class="impact-item">{$t("Attention reasons, trends, delivery health, and behavior evidence stay in one MCP workflow.")}</div>
          <div class="impact-item">{$t("Feedback submission remains opt-in, so the default analysis path stays read-only.")}</div>
        </div>
      </div>
    </div>
    <div class="value-grid">
      <article class="value-card">
        <h3>{$t("Less guesswork")}</h3>
        <p>{$t("Feedback includes behavior paths and time windows, so your team does not need to reconstruct the scene first.")}</p>
      </article>
      <article class="value-card">
        <h3>{$t("Faster iteration")}</h3>
        <p>{$t("Agents can turn observations, evidence, and improvement direction into structured feedback so the TraceMind team can prioritize faster.")}</p>
      </article>
      <article class="value-card">
        <h3>{$t("Compounding quality")}</h3>
        <p>{$t("One optimization does more than solve one issue. It also improves future analysis ability and setup experience.")}</p>
      </article>
    </div>
    <div class="cta-band">
      <div>
        <h2>{$t("AI understands behavior, feedback enters a loop, and the product keeps improving")}</h2>
        <p>{$t("MCP analysis tools are read-only by default. Feedback submission requires developer confirmation. TraceMind does not collect input content, prompts, tokens, source diffs, or full URLs.")}</p>
      </div>
      <div class="mini-console" aria-label={$t("TraceMind console summary")}>
        <div class="console-line"><span>{$t("public key")}</span><strong>tm_proj_xxx</strong></div>
        <div class="console-line"><span>{$t("MCP write path")}</span><strong>submit_feedback</strong></div>
        <div class="console-line"><span>{$t("evidence state")}</span><strong>{$t("reviewable")}</strong></div>
        <div class="console-line"><span>{$t("privacy")}</span><strong>{$t("filtered")}</strong></div>
      </div>
    </div>
  </section>
  {:else}
    <span id="how" class="intro-anchor" aria-hidden="true"></span>
  {/if}
