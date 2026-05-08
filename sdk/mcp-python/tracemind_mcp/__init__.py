import functools
import hashlib
import inspect
import json
import math
import re
import time
import urllib.parse
import urllib.request
import uuid


SDK_VERSION = "0.1.0"
DEFAULT_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/capture"
FORBIDDEN_FIELD_PATTERN = re.compile(
    r"(rawprompt|rawusercontent|rawargs|rawarguments|toolarguments|rawresult|toolresult|resourcecontent|token|secret|password|email|phone|input|enteredtext)",
    re.IGNORECASE,
)


def _safe_string(value, max_length=200, fallback=""):
    return str(value or fallback).strip()[:max_length]


def _normalize_field_key(key):
    return re.sub(r"[_\-\s]+", "", str(key or "").lower())


def _is_primitive_value(value):
    if isinstance(value, bool):
        return True
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    return isinstance(value, str)


def sanitize_fields(fields):
    if not isinstance(fields, dict):
        return {}
    sanitized = {}
    for key, value in fields.items():
        if FORBIDDEN_FIELD_PATTERN.search(_normalize_field_key(key)):
            continue
        if not _is_primitive_value(value):
            continue
        if isinstance(value, str) and re.match(r"^https?://\S+\?\S+", value):
            continue
        sanitized[key] = value
    return sanitized


def _stable_hash(value):
    encoded = json.dumps(value or {}, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "tm_target_" + hashlib.sha256(encoded).hexdigest()[:24]


def _result_size_bucket(result):
    try:
        size = len(json.dumps(result))
    except Exception:
        size = 0
    if size > 100000:
        return "large"
    if size > 10000:
        return "medium"
    return "small"


def _uri_scheme(uri):
    parsed = urllib.parse.urlparse(str(uri or ""))
    return parsed.scheme.lower() if parsed.scheme else "unknown"


class TraceMindMCPClient:
    def __init__(
        self,
        project_key,
        source_key="mcp-server",
        endpoint=DEFAULT_ENDPOINT,
        transport=None,
        identity_resolver=None,
        queue_limit=1000,
        now=None,
    ):
        if not project_key:
            raise ValueError("TraceMindMCP requires project_key.")
        self.project_key = project_key
        self.source_key = _safe_string(source_key, 200, "mcp-server")
        self.endpoint = endpoint
        self.transport = transport or self._default_transport
        self.identity_resolver = identity_resolver
        self.queue_limit = max(1, int(queue_limit or 1000))
        self.now = now or (lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        self.session_id = "tm_sess_" + uuid.uuid4().hex[:24]
        self.anonymous_id = "tm_anon_" + uuid.uuid4().hex[:24]
        self.device_id = "tm_dev_" + uuid.uuid4().hex[:24]
        self.queue = []

    def _default_transport(self, body):
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=data,
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            return {"ok": 200 <= response.status < 300}

    def _source(self, source_type="mcp_server", source_key=None, details=None):
        key = _safe_string(source_key or self.source_key, 200, self.source_key)
        return {
            "type": source_type,
            "key": key,
            "label": key,
            "details": {
                "language": "python",
                "runtime": "python",
                "sdkVersion": SDK_VERSION,
                **(details or {}),
            },
        }

    def _identity(self, request):
        request = request if isinstance(request, dict) else {}
        resolved = self.identity_resolver(request) if callable(self.identity_resolver) else {}
        resolved = resolved if isinstance(resolved, dict) else {}
        return {
            "userId": _safe_string(resolved.get("userId") or request.get("userId"), 160),
            "anonymousId": _safe_string(resolved.get("anonymousId") or request.get("anonymousId") or self.anonymous_id, 120),
            "sessionId": _safe_string(resolved.get("sessionId") or request.get("sessionId") or self.session_id, 120),
            "deviceId": _safe_string(resolved.get("deviceId") or request.get("deviceId") or self.device_id, 120),
        }

    def _enqueue(self, event):
        try:
            self.queue.append({"platform": "server", "occurredAt": self.now(), **event})
            while len(self.queue) > self.queue_limit:
                self.queue.pop(0)
        except Exception:
            pass

    def _record_tool(self, tool_name, request, started_at, status, result=None, error=None):
        target = {"type": "mcp_tool", "name": _safe_string(tool_name, 160), "sourceKey": self.source_key}
        self._enqueue({
            **self._identity(request),
            "type": "tool_call",
            "eventName": "mcp_tool_call",
            "path": f"mcp://tool/{target['name']}",
            "source": self._source("mcp_server"),
            "target": target,
            "targetHash": _stable_hash(target),
            "properties": sanitize_fields({
                "toolName": target["name"],
                "status": status,
                "durationMs": max(0, int((time.time() - started_at) * 1000)),
                "resultSizeBucket": _result_size_bucket(result) if status == "success" else None,
                "errorType": type(error).__name__ if error else None,
            }),
        })

    def _record_resource(self, resource_name, uri, request, started_at, status, result=None, error=None):
        scheme = _uri_scheme(uri)
        target = {
            "type": "mcp_resource",
            "name": _safe_string(resource_name, 160),
            "uriScheme": scheme,
            "uriTemplateHash": _stable_hash({"resourceName": resource_name, "scheme": scheme}),
        }
        self._enqueue({
            **self._identity(request),
            "type": "resource_read",
            "eventName": "mcp_resource_read",
            "path": f"mcp://resource/{target['name']}",
            "source": self._source("mcp_server"),
            "target": target,
            "targetHash": _stable_hash(target),
            "properties": sanitize_fields({
                "resourceName": target["name"],
                "uriScheme": scheme,
                "uriTemplateHash": target["uriTemplateHash"],
                "status": status,
                "durationMs": max(0, int((time.time() - started_at) * 1000)),
                "resultSizeBucket": _result_size_bucket(result) if status == "success" else None,
                "errorType": type(error).__name__ if error else None,
            }),
        })

    def _record_prompt(self, prompt_name, request, started_at, status, result=None, error=None):
        target = {"type": "mcp_prompt", "name": _safe_string(prompt_name, 160), "sourceKey": self.source_key}
        self._enqueue({
            **self._identity(request),
            "type": "prompt_request",
            "eventName": "mcp_prompt_request",
            "path": f"mcp://prompt/{target['name']}",
            "source": self._source("mcp_server"),
            "target": target,
            "targetHash": _stable_hash(target),
            "properties": sanitize_fields({
                "promptName": target["name"],
                "status": status,
                "durationMs": max(0, int((time.time() - started_at) * 1000)),
                "resultSizeBucket": _result_size_bucket(result) if status == "success" else None,
                "errorType": type(error).__name__ if error else None,
            }),
        })

    def _wrap(self, recorder, handler):
        async def record_awaitable(awaitable, request, started_at):
            try:
                result = await awaitable
                recorder(request, started_at, "success", result, None)
                return result
            except Exception as error:
                recorder(request, started_at, "error", None, error)
                raise

        if inspect.iscoroutinefunction(handler):
            @functools.wraps(handler)
            async def async_wrapped(request, *args, **kwargs):
                started_at = time.time()
                return await record_awaitable(handler(request, *args, **kwargs), request, started_at)

            return async_wrapped

        @functools.wraps(handler)
        def wrapped(request, *args, **kwargs):
            started_at = time.time()
            try:
                result = handler(request, *args, **kwargs)
            except Exception as error:
                recorder(request, started_at, "error", None, error)
                raise
            if inspect.isawaitable(result):
                return record_awaitable(result, request, started_at)
            recorder(request, started_at, "success", result, None)
            return result

        return wrapped

    def wrap_tool(self, tool_name, handler):
        return self._wrap(
            lambda request, started_at, status, result, error: self._record_tool(tool_name, request, started_at, status, result, error),
            handler,
        )

    def wrap_resource(self, resource_name, uri, handler):
        return self._wrap(
            lambda request, started_at, status, result, error: self._record_resource(resource_name, uri, request, started_at, status, result, error),
            handler,
        )

    def wrap_prompt(self, prompt_name, handler):
        return self._wrap(
            lambda request, started_at, status, result, error: self._record_prompt(prompt_name, request, started_at, status, result, error),
            handler,
        )

    def instrument_server(self, server):
        if server is None:
            return
        self._patch_registration(server, "tool", lambda name, _uri, handler: self.wrap_tool(name, handler))
        self._patch_registration(server, "resource", lambda name, uri, handler: self.wrap_resource(name, uri, handler))
        self._patch_registration(server, "prompt", lambda name, _uri, handler: self.wrap_prompt(name, handler))

    def _patch_registration(self, server, method_name, wrap_handler):
        original = getattr(server, method_name, None)
        if not callable(original):
            return

        def resolve_name(args, kwargs, handler):
            return args[0] if args else kwargs.get("name") or getattr(handler, "__name__", method_name)

        def resolve_uri(args, kwargs):
            return args[1] if len(args) > 1 else kwargs.get("uri") or kwargs.get("template") or ""

        def patched(*args, **kwargs):
            handler_index = next((index for index, value in enumerate(args) if callable(value)), None)
            if handler_index is not None:
                mutable_args = list(args)
                handler = mutable_args[handler_index]
                mutable_args[handler_index] = wrap_handler(resolve_name(args, kwargs, handler), resolve_uri(args, kwargs), handler)
                return original(*mutable_args, **kwargs)

            registration = original(*args, **kwargs)
            if not callable(registration):
                return registration

            def register(handler):
                wrapped = wrap_handler(resolve_name(args, kwargs, handler), resolve_uri(args, kwargs), handler)
                return registration(wrapped)

            return register

        setattr(server, method_name, patched)

    def capture(self, event_type, event_name=None, user_id=None, anonymous_id=None, session_id=None, path="/", properties=None, context=None, target=None):
        event_target = target or ({"type": "custom", "name": event_name, "sourceKey": self.source_key} if event_name else None)
        event = {
            "userId": _safe_string(user_id, 160),
            "anonymousId": _safe_string(anonymous_id or self.anonymous_id, 120),
            "sessionId": _safe_string(session_id or self.session_id, 120),
            "deviceId": self.device_id,
            "type": event_type,
            "eventName": _safe_string(event_name or event_type, 120),
            "path": _safe_string(path, 500, "/"),
            "source": self._source("mcp_server"),
            "properties": sanitize_fields(properties),
            "context": sanitize_fields(context),
        }
        if event_target:
            event["target"] = event_target
            event["targetHash"] = _stable_hash(event_target)
        self._enqueue(event)

    def capture_skill_lifecycle(self, skill_name, version="", phase="", success=None, duration_ms=None, user_id=None, anonymous_id=None, session_id=None):
        name = _safe_string(skill_name, 160, "agent-skill")
        target = {"type": "agent_skill", "name": name, "version": _safe_string(version, 80)}
        self._enqueue({
            "userId": _safe_string(user_id, 160),
            "anonymousId": _safe_string(anonymous_id or self.anonymous_id, 120),
            "sessionId": _safe_string(session_id or self.session_id, 120),
            "deviceId": self.device_id,
            "type": "skill_lifecycle",
            "eventName": "agent_skill_lifecycle",
            "path": f"agent-skill://{name}",
            "source": self._source("agent_skill", name, {"version": target["version"]}),
            "target": target,
            "targetHash": _stable_hash(target),
            "properties": sanitize_fields({
                "skillName": name,
                "version": target["version"],
                "phase": phase,
                "success": success,
                "durationMs": duration_ms,
            }),
        })

    def flush(self):
        if not self.queue:
            return {"ok": True, "accepted": 0}
        events = list(self.queue)
        self.queue = []
        body = {
            "projectKey": self.project_key,
            "sessionId": self.session_id,
            "anonymousId": self.anonymous_id,
            "deviceId": self.device_id,
            "events": events,
        }
        try:
            return self.transport(body)
        except Exception:
            self.queue = events + self.queue
            self.queue = self.queue[:self.queue_limit]
            raise


def create_tracemind_mcp_client(**kwargs):
    return TraceMindMCPClient(**kwargs)


class TraceMindMCP:
    _client = None

    @classmethod
    def start(cls, server=None, project_key=None, source_key="mcp-server", **kwargs):
        cls._client = TraceMindMCPClient(project_key=project_key, source_key=source_key, **kwargs)
        cls._client.instrument_server(server)
        return cls._client

    @classmethod
    def capture(cls, event_type, **kwargs):
        if cls._client is None:
            raise RuntimeError("TraceMindMCP.start must be called before capture.")
        return cls._client.capture(event_type, **kwargs)

    @classmethod
    def capture_skill_lifecycle(cls, **kwargs):
        if cls._client is None:
            raise RuntimeError("TraceMindMCP.start must be called before capture_skill_lifecycle.")
        return cls._client.capture_skill_lifecycle(**kwargs)

    @classmethod
    def flush(cls):
        if cls._client is None:
            return {"ok": True, "accepted": 0}
        return cls._client.flush()
