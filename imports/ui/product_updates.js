export const productUpdateStorageKey = "tracemind.dismissedProductUpdateId";
export const productUpdatesPath = "/product-updates";

export const PRODUCT_UPDATES = [
  {
    id: "2026-05-22-hourly-health",
    categoryLabel: "New feature notice",
    moduleTitle: "Hourly health trends",
    summary: "Promotion and operations changes can now be reviewed by hour.",
    publishedAt: "2026-05-22",
    details: [
      "Project health now includes hourly trend signals for active users and event volume.",
      "Use it after launches, campaigns, social posts, or community operations to see when behavior starts changing.",
      "The hourly view helps distinguish a short-lived spike from a sustained improvement or decline.",
    ],
  },
  {
    id: "2026-05-21-sdk-governance",
    categoryLabel: "New feature notice",
    moduleTitle: "SDK setup governance",
    summary: "Agent setup guidance now keeps install, verification, and upgrade steps aligned by platform.",
    publishedAt: "2026-05-21",
    details: [
      "Setup guidance covers Web, iOS, Android, React Native, Hybrid, Mini Program, Browser Extension, Server, MCP, and Agent Skill surfaces.",
      "SDK upgrades use content hashes and a local manifest as the source of truth instead of relying on display version text.",
      "Public project keys and private MCP tokens stay separated in setup instructions.",
    ],
  },
  {
    id: "2026-05-20-agent-health-entry",
    categoryLabel: "New feature notice",
    moduleTitle: "Agent health entry",
    summary: "Agents read daily health first, then drill into behavior evidence when needed.",
    publishedAt: "2026-05-20",
    details: [
      "Daily health is now the default starting point for product behavior questions.",
      "Agents can move from attention reasons into semantic events, paths, sessions, and raw evidence.",
      "This reduces blank-query guesswork when activity drops, usage shifts, or capture delivery looks unhealthy.",
    ],
  },
];

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
