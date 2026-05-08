import hashlib
import json
import math
import re
import time
import urllib.request
import uuid


SDK_VERSION = "0.1.0"
DEFAULT_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/capture"
FORBIDDEN_FIELD_PATTERN = re.compile(
    r"(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|input|enteredtext)",
    re.IGNORECASE,
)


def _safe_string(value, max_length=200, fallback=""):
    return str(value or fallback).strip()[:max_length]


def _normalize_field_key(key):
    return re.sub(r"[^a-z0-9]+", "", str(key or "").lower())


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


class TraceMindServerClient:
    def __init__(
        self,
        project_key,
        source_key="server-app",
        endpoint=DEFAULT_ENDPOINT,
        transport=None,
        queue_limit=1000,
        now=None,
    ):
        if not project_key:
            raise ValueError("TraceMindServer requires project_key.")
        self.project_key = project_key
        self.source_key = _safe_string(source_key, 200, "server-app")
        self.endpoint = endpoint
        self.transport = transport or self._default_transport
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

    def _source(self, details=None):
        safe_details = sanitize_fields(details)
        return {
            "type": "server_app",
            "key": self.source_key,
            "label": self.source_key,
            "details": {
                **safe_details,
                "language": "python",
                "runtime": "python",
                "sdkVersion": SDK_VERSION,
            },
        }

    def _enqueue(self, event):
        try:
            self.queue.append({"platform": "server", "occurredAt": self.now(), **event})
            while len(self.queue) > self.queue_limit:
                self.queue.pop(0)
        except Exception:
            pass

    def capture(self, event_type, event_name=None, user_id=None, anonymous_id=None, session_id=None, path="/", properties=None, context=None, target=None, source_details=None):
        name = _safe_string(event_name or event_type, 120)
        event_target = target or {"type": "server_event", "name": name, "sourceKey": self.source_key}
        self._enqueue({
            "userId": _safe_string(user_id, 160),
            "anonymousId": _safe_string(anonymous_id or self.anonymous_id, 120),
            "sessionId": _safe_string(session_id or self.session_id, 120),
            "deviceId": self.device_id,
            "type": event_type,
            "eventName": name,
            "path": _safe_string(path, 500, "/"),
            "source": self._source(source_details),
            "target": event_target,
            "targetHash": _stable_hash(event_target),
            "properties": sanitize_fields(properties),
            "context": sanitize_fields(context),
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


def create_tracemind_server_client(**kwargs):
    return TraceMindServerClient(**kwargs)


class TraceMindServer:
    _client = None

    @classmethod
    def start(cls, project_key=None, source_key="server-app", **kwargs):
        cls._client = TraceMindServerClient(project_key=project_key, source_key=source_key, **kwargs)
        return cls._client

    @classmethod
    def capture(cls, event_type, **kwargs):
        if cls._client is None:
            raise RuntimeError("TraceMindServer.start must be called before capture.")
        return cls._client.capture(event_type, **kwargs)

    @classmethod
    def flush(cls):
        if cls._client is None:
            return {"ok": True, "accepted": 0}
        return cls._client.flush()
