# Auto Capture Design

## 目标

让 Web 产品只用一行脚本就能启用 TraceMind 行为采集，并且同时支持自动采集、手动埋点、用户识别、设备信息和未来服务端埋点。

## 一行接入

```html
<script src="https://tracemind.example.com/capture.js" data-tracemind-token="PROJECT_KEY" async></script>
```

本地开发时，控制台会显示当前 `localhost` 对应的一行代码。

## 自动采集信号

- `page_view`: 页面首次打开。
- `click`: 文档级点击事件。
- `input`: 表单字段变化。
- `submit`: 表单提交。
- `route_change`: `history.pushState` 和浏览器前进/后退。
- `custom`: 通过 `window.TraceMind.capture(type, data)` 手动上报。

## 用户识别

最简单的方式是在页面上提供一个全局方法，然后在 script 上写方法名：

```html
<script>
  window.TraceMindUserId = function () {
    return "user-123";
  };
</script>

<script
  src="https://tracemind.example.com/capture.js"
  data-tracemind-token="PROJECT_KEY"
  data-tracemind-user-id-provider="TraceMindUserId"
  async>
</script>
```

React、Vue、Svelte、jQuery、原生 JS 都可以用这个方式，只要这个方法能返回当前登录用户 ID。TraceMind 不执行字符串代码，只会按名字读取 `window` 上的函数或变量。

如果是后端模板渲染，也可以直接写静态用户 ID：

```html
<script
  src="https://tracemind.example.com/capture.js"
  data-tracemind-token="PROJECT_KEY"
  data-tracemind-user-id="user-123"
  async>
</script>
```

登录后业务系统可以调用：

```js
window.TraceMind.identify("user-123", {
  plan: "pro",
  role: "owner"
});
```

TraceMind 会把 `userId` 保存到浏览器本地，并随之后的事件自动上报。DAU 和常见产品分析指标使用 `userId || anonymousId` 去重。

## 手动埋点

自动采集无法表达的业务语义使用 `custom` + `eventName`：

```js
window.TraceMind.capture("custom", {
  eventName: "checkout_started",
  properties: {
    plan: "pro",
    amount: 29
  },
  context: {
    source: "pricing_page"
  }
});
```

`properties` 放事件属性，`context` 放上报上下文。服务端埋点可以向同一个 `/api/capture` 写入相同字段，并设置 `platform: "server"`。

## Ingestion API

`POST /api/capture`

```json
{
  "projectKey": "tm_proj_xxx",
  "sessionId": "tm_sess_xxx",
  "anonymousId": "tm_anon_xxx",
  "userId": "user-123",
  "deviceId": "tm_dev_xxx",
  "deviceFingerprint": "tm_fp_xxx",
  "platform": "web",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0",
    "language": "zh-CN",
    "timezone": "Asia/Shanghai"
  },
  "type": "custom",
  "eventName": "checkout_started",
  "path": "/pricing",
  "title": "Pricing",
  "targetText": "Start trial",
  "targetTag": "BUTTON",
  "properties": {
    "plan": "pro"
  },
  "context": {
    "source": "manual"
  },
  "occurredAt": "2026-05-06T10:00:00.000Z"
}
```

服务端会补充：

- `ip`: 从 `x-forwarded-for`、`cf-connecting-ip`、`x-real-ip` 或 socket 地址读取。
- `geo`: 从 Cloudflare、Vercel、CloudFront、App Engine 等代理/CDN 请求头读取国家、地区、城市。
- `semanticStatus: "pending"`: 等待语义抽取任务处理。

## 跨平台字段

- `platform`: 当前约定为 `web`、`ios`、`android`、`server`，但不强制封闭，方便未来 SDK 扩展。
- `deviceInfo`: 平台差异字段放这里，例如 iOS/Android 的 OS version、app version、model、network。
- `properties` 和 `context`: 所有业务扩展字段都放这里，避免为每个业务事件改表。

## MVP 决策

- 项目 key 是公开采集 key，只允许写入行为数据。
- 脚本优先使用 `navigator.sendBeacon`，失败时回退到 `fetch(..., keepalive: true)`。
- 暂不做 session replay、DOM snapshot、脱敏规则或批量压缩。
