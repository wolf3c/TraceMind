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
        <label class="language-label" for="locale-select">
          <span class="sr-only">{$t("Language")}</span>
          <select id="locale-select" bind:value={selectedLocale} onchange={changeLocale}>
            {#each locales as localeCode (localeCode)}
              <option value={localeCode}>{$t(localeLabels[localeCode] || localeCode)}</option>
            {/each}
          </select>
        </label>
        {#if userId}
          <button class="ghost" type="button" onclick={logout}>{$t("Log out")}</button>
        {/if}
      </div>
    </nav>

    {#if shouldShowIntro}
    <div class="hero-grid">
      <div class="hero-copy">
        <h1>
          <span>{$t("Let AI agents understand")}</span>
          <span>{$t("real user behavior")}</span>
        </h1>
        <p class="lede">{$t("TraceMind gives AI Coding Agents a product behavior analytics layer. Auto Capture turns real paths, clicks, forms, and active time into evidence that agents can analyze through MCP.")}</p>
        <div class="hero-actions">
          <a href="#console" class="button">{$t("Let Agent set it up")}</a>
          <a href={setupDocsUrl} class="button secondary" target="_blank" rel="noreferrer">{$t("View setup docs")}</a>
        </div>
        <p class="hero-proof">{$t("Prompt-based setup · AI-readable evidence · independent MCP token authorization")}</p>
      </div>

      <div class="product-board" aria-label={$t("TraceMind product mechanism")}>
        <div class="command-card">
          <div class="board-header">
            <div>
              <h2>{$t("Prompt your Coding Agent to set it up automatically")}</h2>
              <p>{$t("No need to find the entry point, copy code, or decide how to verify setup. The Agent adapts to your project and verifies the integration.")}</p>
            </div>
            <div class="project-key">tm_proj_xxx</div>
          </div>
          <div class="command-bubble">“{$t("Help me connect TraceMind to this project and verify behavior capture is working.")}”</div>
          <div class="agent-steps">
            <span>{$t("Read setup config")}</span>
            <span>{$t("Modify project entry")}</span>
            <span>{$t("Run local verification")}</span>
            <span>{$t("Query capture result")}</span>
          </div>
        </div>
        <div class="analysis-grid">
          <article class="analysis-card">
            <span>{$t("AI + MCP efficient analysis")}</span>
            <strong>{$t("AI automatically discovers, analyzes, and gives the next step")}</strong>
            <ul>
              <li>{$t("Automatically identify stuck points in signup, payment, and retention paths.")}</li>
              <li>{$t("Connect behavior evidence and reconstruct the problem context.")}</li>
              <li>{$t("Generate fix suggestions, missing instrumentation, or optimization direction.")}</li>
            </ul>
          </article>
          <article class="analysis-card">
            <span>{$t("AI user insight")}</span>
            <strong>{$t("Automatically preserve user paths and usage preferences")}</strong>
            <ul>
              <li>{$t("Summarize paths, device sources, and active windows automatically.")}</li>
              <li>{$t("Compare feature usage, cohort differences, and conversion performance efficiently.")}</li>
              <li>{$t("Reduce time spent reading reports, joining data, and guessing causes.")}</li>
            </ul>
          </article>
        </div>
        <div class="evidence-stream">
          <div class="stream-line"><span>{$t("User path")}</span><strong>/pricing -> signup -> submit failed</strong></div>
          <div class="stream-line"><span>{$t("Semantic event")}</span><strong>user_reached_pricing_without_signup</strong></div>
          <div class="stream-line"><span>{$t("Agent question")}</span><strong>{$t("Which users reached pricing but did not submit? Why?")}</strong></div>
        </div>
        <div class="loop-preview">
          <div class="mini-cycle" aria-hidden="true"></div>
          <div>
            <h3>{$t("Feedback loops keep analysis quality improving")}</h3>
            <p>{$t("AI first helps you improve your product. Evidence-backed feedback keeps improving TraceMind so the next analysis is faster and more accurate.")}</p>
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
  </section>

  <section class="workflow product-iteration">
    <div>
      <p class="section-label">{$t("AI + MCP analysis")}</p>
      <h2>{$t("Let AI automatically complete efficient product iteration")}</h2>
      <p class="section-intro">{$t("TraceMind is not just another report. It gives real behavior evidence to AI so it can automatically discover problems, analyze causes, and produce an actionable next step.")}</p>
    </div>
    <div class="solution-grid">
      <article class="solution-card">
        <div class="solution-icon">1</div>
        <h3>{$t("Automatically discover problems")}</h3>
        <p>{$t("AI identifies drop-off, stuck points, abnormal behavior, and low-conversion steps from real paths, reducing manual screening and guesswork.")}</p>
      </article>
      <article class="solution-card">
        <div class="solution-icon">2</div>
        <h3>{$t("Efficiently analyze causes")}</h3>
        <p>{$t("AI combines pages, events, sources, devices, cohorts, and time windows to quickly reconstruct the full context of a problem.")}</p>
      </article>
      <article class="solution-card">
        <div class="solution-icon">3</div>
        <h3>{$t("Automatically drive resolution")}</h3>
        <p>{$t("Coding Agents can generate fix suggestions, add missing instrumentation, optimize pages, or submit structured feedback based on evidence.")}</p>
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
      <h2>{$t("Feedback is no longer a chat log. It becomes executable product evidence")}</h2>
    </div>
    <div class="proof-grid">
      <div class="evidence-panel">
        <div class="signal-row">
          <span>{$t("User path")}</span>
          <strong>/pricing -> signup -> submit failed</strong>
        </div>
        <div class="signal-row">
          <span>{$t("Behavior evidence")}</span>
          <strong>click, input, submit, route_change, online segment</strong>
        </div>
        <div class="signal-row">
          <span>{$t("MCP feedback")}</span>
          <strong>{$t("Users reached pricing but did not complete signup, so the signup form failure path needs review.")}</strong>
        </div>
        <div class="signal-row">
          <span>{$t("Optimization result")}</span>
          <strong>{$t("Improve signup funnel recognition, add Agent guidance, and let the next answer locate the failed step directly.")}</strong>
        </div>
      </div>
      <div class="impact-panel">
        <h3>{$t("Why is this loop faster than traditional analytics?")}</h3>
        <div class="impact-list">
          <div class="impact-item">{$t("Feedback carries evidence, so you no longer rely on screenshots, subjective descriptions, or after-the-fact guessing.")}</div>
          <div class="impact-item">{$t("AI can ask directly about behavior context and return reviewable analysis and improvement suggestions.")}</div>
          <div class="impact-item">{$t("Every evidence-backed feedback item improves TraceMind SDKs, the semantic layer, MCP tools, and Agent guidance.")}</div>
          <div class="impact-item">{$t("The result shows up in issue-location speed, analysis quality, and setup experience.")}</div>
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
