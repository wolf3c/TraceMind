export const productUpdateStorageKey = "tracemind.dismissedProductUpdateId";
export const productUpdatesPath = "/product-updates";
const defaultProductUpdateLocale = "en";
const supportedProductUpdateLocales = ["en", "zh"];

export const PRODUCT_UPDATES = [
  {
    id: "2026-06-05-installable-pwa",
    categoryLabel: {
      en: "New feature notice",
      zh: "新功能提醒",
    },
    moduleTitle: {
      en: "Installable TraceMind app",
      zh: "可安装的 TraceMind 应用",
    },
    summary: {
      en: "TraceMind can now be installed from the browser, so users can open the console like an app.",
      zh: "现在可以把 TraceMind 从浏览器安装到设备上，像打开 App 一样进入控制台。",
    },
    publishedAt: "2026-06-05",
    details: [
      {
        en: "The Web console now ships a PWA manifest, app icons, and standalone window mode for desktop and mobile browser installs.",
        zh: "Web 控制台新增 PWA manifest、应用图标和独立窗口模式，支持桌面和移动端浏览器安装。",
      },
      {
        en: "The install entry opens the browser install prompt where supported; iOS and iPadOS show short Add to Home Screen guidance through the share menu.",
        zh: "安装入口会在支持浏览器提示安装；iOS/iPadOS 会显示通过分享菜单添加到主屏幕的简短指引。",
      },
      {
        en: "Privacy-safe: the PWA does not cache project data, MCP responses, capture APIs, or login-state content. Console data still loads through online requests.",
        zh: "隐私安全：PWA 不缓存项目数据、MCP 响应、采集接口或登录态内容，控制台数据仍按在线请求加载。",
      },
    ],
  },
  {
    id: "2026-06-02-web-capture-script-updates",
    categoryLabel: {
      en: "New feature notice",
      zh: "新功能提醒",
    },
    moduleTitle: {
      en: "Web capture script updates",
      zh: "Web 采集脚本更新",
    },
    summary: {
      en: "TraceMind now flags projects still running old Web capture scripts and gives coding agents update instructions, keeping behavior evidence reliable.",
      zh: "TraceMind 现在会提醒仍在运行旧 Web 采集脚本的项目，并给 coding agent 更新指令，让用户行为证据保持可靠。",
    },
    publishedAt: "2026-06-02",
    details: [
      {
        en: "Web setup keeps using a stable capture.js address. The production script is distributed by Cloudflare Pages, while capture, presence, and feedback data still go to the Galaxy API.",
        zh: "Web 接入继续使用稳定的 capture.js 地址，生产脚本由 Cloudflare Pages 分发，采集、在线和反馈数据仍写入 Galaxy API。",
      },
      {
        en: "Project health and MCP use sourceDetails.scriptReleaseId to find old Web Auto Capture scripts that are still running and reporting, without guessing from caches that have no recent reports.",
        zh: "项目健康和 MCP 会通过 sourceDetails.scriptReleaseId 发现仍在运行并上报的旧 Web Auto Capture 脚本，同时避免把没有近期上报的缓存猜成问题。",
      },
      {
        en: "When a warning appears, developers can copy the update instruction to a coding agent so it fetches the latest captureScriptUrl, checks fixed hash scripts or caches, and verifies the update with one real behavior.",
        zh: "看到提醒后，可以复制升级指令给 coding agent，让它获取最新 captureScriptUrl、检查固定 hash 脚本或缓存，并用一次真实行为验证完成。",
      },
    ],
  },
  {
    id: "2026-05-25-production-error-capture",
    categoryLabel: {
      en: "New feature notice",
      zh: "新功能提醒",
    },
    moduleTitle: {
      en: "Production error capture",
      zh: "线上报错采集",
    },
    summary: {
      en: "TraceMind can now capture production errors across runtimes and connect them with behavior paths, helping teams find issues faster and improve the experience.",
      zh: "TraceMind 现在可以自动/手动收集各终端线上报错，并关联行为路径，帮助团队更快定位问题、优化体验。",
    },
    publishedAt: "2026-05-25",
    details: [
      {
        en: "Errors from each runtime are recorded as unified app_error summaries for behavior paths, sources, sessions, users, and health trend analysis.",
        zh: "各终端报错会作为统一的 app_error 摘要进入行为路径、来源、session、用户和健康趋势分析。",
      },
      {
        en: "Automatic capture and manual reporting are both supported, so teams can inspect online errors together with the behavior that happened before and after them.",
        zh: "支持自动捕获或手动上报两种接入方式，让线上错误能和发生前后的用户行为一起排查。",
      },
      {
        en: "Privacy-safe: TraceMind keeps error type, message fingerprint, handled/fatal, path/screen, component, release, and related error metadata, without collecting request bodies, response bodies, raw prompts, secrets, screenshots, or recordings.",
        zh: "隐私安全：只保留错误类型、消息指纹、handled/fatal、path/screen、component、release 等错误信息，不采集请求体、响应体、raw prompt、secret、截图或录屏。",
      },
    ],
  },
  {
    id: "2026-05-22-hourly-health",
    categoryLabel: {
      en: "New feature notice",
      zh: "新功能提醒",
    },
    moduleTitle: {
      en: "Hourly health trends",
      zh: "小时级健康趋势",
    },
    summary: {
      en: "Promotion and operations changes can now be reviewed by hour.",
      zh: "推广或运营动作后，可以按小时观察活跃用户、事件量和趋势变化。",
    },
    publishedAt: "2026-05-22",
    details: [
      {
        en: "Project health now includes hourly trend signals for active users and event volume.",
        zh: "项目健康新增活跃用户和事件量的小时级趋势信号。",
      },
      {
        en: "Use it after launches, campaigns, social posts, or community operations to see when behavior starts changing.",
        zh: "适合在上线、投放、社媒发布或社群运营后观察行为从哪个小时开始变化。",
      },
      {
        en: "The hourly view helps distinguish a short-lived spike from a sustained improvement or decline.",
        zh: "小时视图可以区分短暂波动和持续改善或下滑。",
      },
    ],
  },
  {
    id: "2026-05-21-sdk-governance",
    categoryLabel: {
      en: "New feature notice",
      zh: "新功能提醒",
    },
    moduleTitle: {
      en: "SDK setup governance",
      zh: "SDK 接入治理",
    },
    summary: {
      en: "Agent setup guidance now keeps install, verification, and upgrade steps aligned by platform.",
      zh: "Agent 接入说明现在按平台保持安装、验证和升级步骤一致。",
    },
    publishedAt: "2026-05-21",
    details: [
      {
        en: "Setup guidance covers Web, iOS, Android, React Native, Hybrid, Mini Program, Browser Extension, Server, MCP, and Agent Skill surfaces.",
        zh: "接入说明覆盖 Web、iOS、Android、React Native、Hybrid、小程序、浏览器扩展、Server、MCP 和 Agent Skill。",
      },
      {
        en: "SDK upgrades use content hashes and a local manifest as the source of truth instead of relying on display version text.",
        zh: "SDK 升级以内容 hash 和本地 manifest 作为准确信息，不依赖展示版本文本。",
      },
      {
        en: "Public project keys and private MCP tokens stay separated in setup instructions.",
        zh: "接入说明继续区分公开 project key 和私有 MCP token。",
      },
    ],
  },
  {
    id: "2026-05-20-agent-health-entry",
    categoryLabel: {
      en: "New feature notice",
      zh: "新功能提醒",
    },
    moduleTitle: {
      en: "Agent health entry",
      zh: "Agent 健康入口",
    },
    summary: {
      en: "Agents read daily health first, then drill into behavior evidence when needed.",
      zh: "Agent 会先读取每日健康，再按需下钻行为证据。",
    },
    publishedAt: "2026-05-20",
    details: [
      {
        en: "Daily health is now the default starting point for product behavior questions.",
        zh: "每日健康现在是产品行为问题的默认入口。",
      },
      {
        en: "Agents can move from attention reasons into semantic events, paths, sessions, and raw evidence.",
        zh: "Agent 可以从需关注原因继续下钻到语义事件、路径、会话和原始证据。",
      },
      {
        en: "This reduces blank-query guesswork when activity drops, usage shifts, or capture delivery looks unhealthy.",
        zh: "当活跃下降、使用变化或采集上报异常时，这会减少从空白问题开始猜查询路径。",
      },
    ],
  },
];

export function normalizeProductUpdateLocale(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  const base = raw.split("-")[0];
  return supportedProductUpdateLocales.includes(base) ? base : defaultProductUpdateLocale;
}

export function localizedProductUpdateText(value, locale = defaultProductUpdateLocale) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object" || Array.isArray(value)) return String(value);

  const normalizedLocale = normalizeProductUpdateLocale(locale);
  const fallbackText = Object.values(value).find((text) => typeof text === "string" && text.trim());
  return String(value[normalizedLocale] || value[defaultProductUpdateLocale] || fallbackText || "");
}

export function localizedProductUpdateDetails(details = [], locale = defaultProductUpdateLocale) {
  return details.map((detail) => localizedProductUpdateText(detail, locale));
}

export function sortProductUpdatesByDate(updates = PRODUCT_UPDATES) {
  return [...updates].sort((left, right) => {
    const publishedCompare = String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""));
    if (publishedCompare !== 0) return publishedCompare;
    return String(right.id || "").localeCompare(String(left.id || ""));
  });
}

export function latestProductUpdate(updates = PRODUCT_UPDATES) {
  return sortProductUpdatesByDate(updates)[0] || null;
}

export function productUpdateDetailPath(update) {
  if (!update?.id) return productUpdatesPath;
  return `${productUpdatesPath}#${encodeURIComponent(update.id)}`;
}

export function shouldShowProductUpdate(update, dismissedId = "") {
  return Boolean(update?.id && update.id !== dismissedId);
}

export function productUpdateNotificationState(updates = PRODUCT_UPDATES, dismissedId = "", canShowReminder = true) {
  const update = latestProductUpdate(updates);

  return {
    update,
    hasUnreadUpdate: Boolean(canShowReminder && shouldShowProductUpdate(update, dismissedId)),
  };
}

export function readDismissedProductUpdateId(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(productUpdateStorageKey) || "";
  } catch {
    return "";
  }
}

export function writeDismissedProductUpdateId(storage = globalThis.localStorage, updateId = "") {
  if (!storage || !updateId) return false;

  try {
    storage.setItem(productUpdateStorageKey, updateId);
    return true;
  } catch {
    return false;
  }
}
