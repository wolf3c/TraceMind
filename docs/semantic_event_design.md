# Semantic Event Design

## 目标

把 Web、iOS、Android 和服务端上报的原始行为统一抽取为稳定的语义事件，让 LLM/MCP 能直接按业务含义、时间、用户、设备、路径等维度查询分析。

## 当前链路

1. `/api/capture` 写入 `tracemind_raw_behaviors`，状态为 `semanticStatus: "pending"`。
2. `startSemanticExtractionJob()` 每 30 秒处理 pending 原始行为。
3. `buildSemanticEvent()` 对每条原始行为生成一条语义事件。
4. 原始行为标记为 `processed`，并保存 `semanticEventId`，方便从语义事件回溯原始日志。

## 语义事件字段

```json
{
  "projectId": "project-id",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "userId": "user-123",
  "deviceId": "tm_dev_xxx",
  "deviceFingerprint": "tm_fp_xxx",
  "platform": "web",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0",
    "language": "zh-CN",
    "platform": "MacIntel",
    "timezone": "Asia/Shanghai"
  },
  "ip": "203.0.113.10",
  "geo": {
    "country": "US",
    "region": "CA",
    "city": "San Francisco",
    "source": "headers"
  },
  "rawBehaviorId": "raw-id",
  "eventType": "custom",
  "eventName": "checkout_started",
  "title": "checkout_started",
  "meaning": "用户在 /pricing 触发了 checkout_started 行为。",
  "path": "/pricing",
  "targetText": "Start trial",
  "targetTag": "BUTTON",
  "target": {
    "tag": "BUTTON",
    "text": "Start trial",
    "id": "start-trial",
    "role": "button",
    "path": "main:nth-of-type(1)>section:nth-of-type(2)>button#start-trial"
  },
  "targetHash": "tm_fp_xxx",
  "properties": {
    "plan": "pro",
    "amount": 29
  },
  "context": {
    "source": "manual"
  },
  "occurredAt": "2026-05-06T10:00:00.000Z"
}
```

## 身份与指标口径

- `userId` 是业务系统识别出的登录用户 ID，用于 DAU、留存、转化和用户路径分析。
- `anonymousId` 是 TraceMind 为未登录访客生成的匿名 ID；当 `userId` 缺失时，用它作为临时用户口径。
- `sessionId` 表示一次访问会话，适合分析单次访问路径。
- `deviceId` 是本地持久设备 ID，和 `sessionId` 一起用于跨 session 识别同一设备。
- `deviceFingerprint` 是基于稳定设备信息计算的轻量指纹，只作为辅助去重字段，不替代登录用户 ID。
- DAU 口径使用 `userId || anonymousId` 按自然日去重。

## 设备、IP 与地理信息

- Web 自动采集会发送 `deviceInfo`，包括 UA、语言、平台、时区、屏幕、viewport、硬件并发、内存和 referrer。
- 设备指纹只使用较稳定字段，避免 viewport/referrer 变化导致同一设备被频繁重算。
- 服务端通过请求头采集 IP，包括 `x-forwarded-for`、`cf-connecting-ip`、`x-real-ip` 和 socket 地址。
- 地理信息使用无感请求头来源，例如 Cloudflare、Vercel、CloudFront、App Engine 注入的国家、地区、城市字段；后续可接入 IP geo 数据库，但不需要改变事件表结构。

## 自定义字段

- `eventName` 表达具体业务事件名，例如 `checkout_started`、`plan_selected`、`invite_sent`。
- `properties` 保存事件自身属性，例如金额、套餐、按钮位置、实验分组。
- `context` 保存上报上下文，例如 `source: "server"`、trace id、feature flag、入口渠道。
- Web 手动埋点和服务端埋点都使用同一字段，后续扩展不用修改表结构。

## 元素定位

- `targetText` 和 `targetTag` 只适合做人类阅读摘要，不能作为唯一定位依据。
- `target` 保存元素摘要，包括 tag、id、class、name、type、role、aria-label、placeholder、testId 和短 DOM path。
- `targetHash` 基于 `target` 计算，用于区分同一个页面上的相同文案按钮、多个输入框或重复列表项操作。
- 对于长期稳定的关键漏斗，优先推荐开发者手动上报明确 `eventName`，自动 `targetHash` 主要用于自动采集和问题复核。

## 事件含义说明表

| eventType | 名称 | 含义 | 常见字段 | 平台 |
| --- | --- | --- | --- | --- |
| `page_view` | 页面浏览 | 用户打开或刷新页面，用于分析访问量、落地页、路径入口和页面级留存。 | `title`, `path`, `referrer` | Web, iOS, Android, Server |
| `click` | 元素点击 | 用户点击界面元素，用于分析功能入口、按钮转化和交互兴趣。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` | Web, iOS, Android |
| `input` | 输入变化 | 用户修改输入控件，用于分析表单填写、设置修改和关键流程参与度。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` | Web, iOS, Android |
| `submit` | 表单提交 | 用户提交表单或确认动作，用于分析注册、支付、创建、搜索等转化节点。 | `target`, `targetHash`, `targetText`, `targetTag`, `path` | Web, iOS, Android |
| `route_change` | 页面跳转 | 用户在应用内发生路由变化，用于分析路径流转、漏斗顺序和页面间跳转。 | `path`, `referrer` | Web, iOS, Android |
| `api_call` | 接口调用 | 客户端或服务端记录接口调用，用于分析接口失败、关键后端流程和服务端埋点。 | `method`, `status`, `path` | Web, iOS, Android, Server |
| `custom` | 自定义事件 | 开发者手动上报的业务事件，用于表达自动采集无法稳定推断的业务语义。 | `eventName`, `properties`, `context` | Web, iOS, Android, Server |

这张表同时暴露给 MCP 的 `tracemind.event_definitions`，用于帮助 LLM 判断应该查询哪个事件。

## 跨平台扩展原则

- 表结构保持平台无关：`platform` 区分 `web`、`ios`、`android`、`server`，平台差异写入 `deviceInfo`、`properties` 和 `context`。
- 自动采集字段和手动埋点字段共用同一事件模型，避免未来增加移动端 SDK 时迁移 Mongo 集合。
- 移动端可复用 `sessionId`、`anonymousId`、`userId`、`deviceId`、`deviceFingerprint`、`eventType`、`eventName`、`properties`、`context`。
- 服务端埋点可使用 `platform: "server"`，通常上报 `userId`、`eventName`、`properties`、`context.traceId` 和 `occurredAt`。

## MVP 决策

- v1.0 不调用 LLM，语义抽取先使用确定性规则，便于本地开发和测试。
- Raw Behavior 和 Semantic Event 一对一生成，保证可追溯。
- 汇总在读取时通过 `summarizeSemanticEvents()` 计算，包括事件分布、路径分布、去重用户、去重设备和 DAU。
