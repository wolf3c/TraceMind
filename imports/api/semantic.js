import { EVENT_TYPES } from './tracemind';

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 120);
}

function describeTarget(behavior) {
  const text = cleanText(behavior.targetText);
  if (text) return `"${text}"`;

  const tag = cleanText(behavior.targetTag).toLowerCase();
  return tag ? `${tag} 元素` : '页面元素';
}

export function buildSemanticEvent(behavior) {
  const eventType = behavior.type || 'custom';
  const eventName = cleanText(behavior.eventName, eventType);
  const path = cleanText(behavior.path, '/');
  const base = {
    projectId: behavior.projectId,
    sessionId: behavior.sessionId,
    anonymousId: behavior.anonymousId,
    userId: behavior.userId,
    deviceId: behavior.deviceId,
    deviceFingerprint: behavior.deviceFingerprint,
    platform: behavior.platform || 'web',
    deviceInfo: behavior.deviceInfo || {},
    ip: behavior.ip,
    geo: behavior.geo || {},
    sourceType: behavior.sourceType || 'unknown',
    sourceKey: behavior.sourceKey || 'unknown',
    sourceLabel: behavior.sourceLabel || behavior.sourceKey || 'unknown',
    sourceDetails: behavior.sourceDetails || {},
    rawBehaviorId: behavior._id,
    eventType,
    eventName,
    path,
    targetText: cleanText(behavior.targetText),
    targetTag: cleanText(behavior.targetTag),
    target: behavior.target || {},
    targetHash: behavior.targetHash,
    properties: behavior.properties || {},
    context: behavior.context || {},
    occurredAt: behavior.occurredAt || behavior.createdAt || new Date(),
    createdAt: new Date(),
  };

  if (eventType === 'page_view') {
    const title = cleanText(behavior.title, path);
    return {
      ...base,
      title: `浏览了 ${title}`,
      meaning: `用户打开了 ${path} 页面。`,
    };
  }

  if (eventType === 'click') {
    const target = describeTarget(behavior);
    return {
      ...base,
      title: `点击了 ${target}`,
      meaning: `用户在 ${path} 点击了 ${target}。`,
    };
  }

  if (eventType === 'input') {
    const target = describeTarget(behavior);
    return {
      ...base,
      title: `修改了 ${target}`,
      meaning: `用户在 ${path} 修改了 ${target}。`,
    };
  }

  if (eventType === 'submit') {
    const target = describeTarget(behavior);
    return {
      ...base,
      title: `提交了 ${target}`,
      meaning: `用户在 ${path} 提交了 ${target}。`,
    };
  }

  if (eventType === 'route_change') {
    return {
      ...base,
      title: `跳转到 ${path}`,
      meaning: `用户跳转到了 ${path}。`,
    };
  }

  if (eventType === 'api_call') {
    const method = cleanText(behavior.method, 'HTTP');
    const status = cleanText(behavior.status);
    return {
      ...base,
      title: `${method} ${path}`,
      meaning: `产品调用了 ${path}${status ? `，返回 ${status}` : ''}。`,
    };
  }

  if (eventType === 'tool_call') {
    const toolName = cleanText(behavior.properties?.toolName || behavior.target?.name || eventName, 'MCP tool');
    const status = cleanText(behavior.properties?.status);
    return {
      ...base,
      title: `MCP 工具 ${toolName}`,
      meaning: `MCP server 完成了 ${toolName} 工具调用${status ? `，状态 ${status}` : ''}。`,
    };
  }

  if (eventType === 'resource_read') {
    const resourceName = cleanText(behavior.properties?.resourceName || behavior.target?.name || eventName, 'MCP resource');
    const status = cleanText(behavior.properties?.status);
    return {
      ...base,
      title: `MCP 资源 ${resourceName}`,
      meaning: `MCP server 完成了 ${resourceName} 资源读取${status ? `，状态 ${status}` : ''}。`,
    };
  }

  if (eventType === 'prompt_request') {
    const promptName = cleanText(behavior.properties?.promptName || behavior.target?.name || eventName, 'MCP prompt');
    const status = cleanText(behavior.properties?.status);
    return {
      ...base,
      title: `MCP Prompt ${promptName}`,
      meaning: `MCP server 完成了 ${promptName} prompt 请求${status ? `，状态 ${status}` : ''}。`,
    };
  }

  if (eventType === 'skill_lifecycle') {
    const skillName = cleanText(behavior.properties?.skillName || behavior.target?.name || eventName, 'Agent Skill');
    const phase = cleanText(behavior.properties?.phase);
    return {
      ...base,
      title: `Skill ${skillName}`,
      meaning: `Agent Skill ${skillName}${phase ? ` 进入 ${phase} 阶段` : ' 发生生命周期事件'}。`,
    };
  }

  return {
    ...base,
    title: eventName || EVENT_TYPES[eventType] || EVENT_TYPES.custom,
    meaning: `用户在 ${path} 触发了 ${eventName || eventType} 行为。`,
  };
}

export function summarizeSemanticEvents(events) {
  const counts = {};
  const paths = {};
  const activeUsersByDay = {};
  const uniqueUsers = new Set();
  const uniqueDevices = new Set();

  events.forEach((event) => {
    counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    paths[event.path] = (paths[event.path] || 0) + 1;
    const actorId = event.userId || event.anonymousId;
    if (actorId) {
      uniqueUsers.add(actorId);
      const day = new Date(event.occurredAt || event.createdAt || Date.now()).toISOString().slice(0, 10);
      activeUsersByDay[day] = activeUsersByDay[day] || new Set();
      activeUsersByDay[day].add(actorId);
    }
    if (event.deviceId || event.deviceFingerprint) {
      uniqueDevices.add(event.deviceId || event.deviceFingerprint);
    }
  });

  const topEvents = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([eventType, count]) => ({ eventType, count }));

  const topPaths = Object.entries(paths)
    .sort((a, b) => b[1] - a[1])
    .map(([path, count]) => ({ path, count }));

  return {
    totalEvents: events.length,
    uniqueUsers: uniqueUsers.size,
    uniqueDevices: uniqueDevices.size,
    dailyActiveUsers: Object.entries(activeUsersByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => ({ date, count: users.size })),
    topEvents,
    topPaths,
  };
}
