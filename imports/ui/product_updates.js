export const productUpdateStorageKey = "tracemind.dismissedProductUpdateId";
export const productUpdatesPath = "/product-updates";
const defaultProductUpdateLocale = "en";
const supportedProductUpdateLocales = ["en", "zh"];

export const PRODUCT_UPDATES = [
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
