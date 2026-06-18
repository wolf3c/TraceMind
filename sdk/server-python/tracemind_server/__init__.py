import hashlib
import json
import math
import re
import time
import traceback
import urllib.request
import uuid


SDK_VERSION = "0.1.0"
SDK_CONTENT_HASH = "sha256:54defeedc23289b61120a975fa583e4ed68cec7808943624cef10f670beda283"
DEFAULT_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/capture"
DEFAULT_FEEDBACK_ENDPOINT = "https://tracemind.sandbox.galaxycloud.app/api/user-feedback"
FORBIDDEN_FIELD_PATTERN = re.compile(
    r"(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|email|phone|input|enteredtext)",
    re.IGNORECASE,
)
FEEDBACK_FORBIDDEN_FIELD_PATTERN = re.compile(
    r"(rawprompt|rawusercontent|rawrequestbody|requestbody|rawresponsebody|responsebody|headers|cookies|authorization|token|secret|password|sourcecode|sourcediff|codediff|toolarguments|toolresult|resourcecontent)",
    re.IGNORECASE,
)
FULL_QUERY_URL_PATTERN = re.compile(r"https?://[^\s?#]+[^\s]*\?[^\s\"'<>)]*", re.IGNORECASE)
ATTRIBUTION_VALUE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$")
ATTRIBUTION_DOMAIN_PATTERN = re.compile(r"^[a-z0-9.-]+$")
ATTRIBUTION_REFERRER_TYPES = {"direct", "internal", "external", "search", "social"}
APP_ERROR_CONTEXT_KEYS = {"source", "screen", "release", "component", "status", "occurredAt"}


def _safe_string(value, max_length=200, fallback=""):
    return str(value or fallback).strip()[:max_length]


def _strip_query_path(value, fallback="/"):
    text = _safe_string(value, 500, fallback)
    if not text:
        return fallback
    if re.match(r"^[a-z][a-z0-9+.-]*://", text, re.IGNORECASE):
        try:
            from urllib.parse import urlparse

            parsed = urlparse(text)
            return _safe_string((parsed.path or "/") + (("#" + parsed.fragment) if parsed.fragment else ""), 500, fallback)
        except Exception:
            return fallback
    return _safe_string(text.split("?", 1)[0] or fallback, 500, fallback)


def _clean_error_field(value, max_length=160):
    text = _safe_string(value, max_length)
    if not text:
        return ""
    if re.search(r"@|https?:|[?&=]|%40|bearer\s+|api[_-]?key|access[_-]?token|secret|password", text, re.IGNORECASE):
        return ""
    return text


def _sanitize_error_message_for_hash(value):
    text = _safe_string(value, 500)
    text = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[email]", text, flags=re.IGNORECASE)
    text = re.sub(r"https?://\S+\?\S+", "[url]", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\b(bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|access[_-]?token\s*[:=]\s*\S+|secret\S*)\b",
        "[secret]",
        text,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", text).strip()[:240]


def _sanitize_error_message_preview(value):
    text = _safe_string(value, 500)
    text = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[email]", text, flags=re.IGNORECASE)
    text = re.sub(r"https?://\S+", "[url]", text, flags=re.IGNORECASE)
    text = re.sub(r"(^|\s)/[^\s?]+\?\S+", r"\1[url]", text)
    text = re.sub(
        r"\b(sk-[A-Za-z0-9_-]+|pk_[A-Za-z0-9_-]+|bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|access[_-]?token\s*[:=]\s*\S+|token\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|password\s*[:=]\s*\S+)\b",
        "[redacted]",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\b\d{12,19}\b", "[number]", text)
    text = re.sub(r"\s+", " ", text).strip()[:160]
    if not text:
        return ""
    if re.search(r"@|https?:|%40|bearer\s+|api[_-]?key|access[_-]?token|sk-|pk_|secret|password", text, re.IGNORECASE):
        return ""
    if re.search(r"\b(raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body|authorization\s*:|set-cookie\s*:)", text, re.IGNORECASE):
        return ""
    return text


def _message_fingerprint(error_type, message):
    digest = hashlib.sha256(f"{error_type}:{_sanitize_error_message_for_hash(message)}".encode("utf-8")).hexdigest()
    return "tm_error_" + digest[:24]


def _diagnostic_fingerprint(prefix, value):
    digest = hashlib.sha256(_sanitize_error_message_for_hash(value).encode("utf-8")).hexdigest()
    return prefix + digest[:24]


def _stack_text(error):
    if not error or not getattr(error, "__traceback__", None):
        return ""
    return "".join(traceback.format_exception(type(error), error, error.__traceback__))


def _first_stack_frame(stack):
    lines = [re.sub(r"\s+", " ", line).strip() for line in str(stack or "").splitlines()]
    lines = [line for line in lines if line]
    for line in lines:
        if re.search(r"(^File\s+| at |@|:\d+:\d+)", line) and not re.match(r"^[a-z]*error\b", line, re.IGNORECASE):
            return line
    return lines[1] if len(lines) > 1 else (lines[0] if lines else "")


def _safe_diagnostic_field(merged, key, max_length=120):
    snake_key = re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower()
    nested_properties = merged.get("properties") if isinstance(merged.get("properties"), dict) else {}
    return _clean_error_field(
        merged.get(key) or merged.get(snake_key) or nested_properties.get(key) or nested_properties.get(snake_key),
        max_length,
    )


def _error_cause(error, merged):
    return merged.get("cause") or getattr(error, "__cause__", None) or getattr(error, "__context__", None)


def _cause_type(cause, explicit_type=None):
    if explicit_type:
        return explicit_type
    if not cause:
        return ""
    if isinstance(cause, BaseException):
        return cause.__class__.__name__
    return "Error" if isinstance(cause, str) else cause.__class__.__name__


def _cause_message(cause, explicit_message=None):
    if explicit_message:
        return explicit_message
    if not cause:
        return ""
    return str(cause)


def _sanitize_app_error_context(fields):
    return {key: value for key, value in sanitize_fields(fields).items() if key in APP_ERROR_CONTEXT_KEYS}


def _error_attr(value, name):
    if isinstance(value, dict):
        return value.get(name)
    return getattr(value, name, None)


def _app_error_payload(error_or_info=None, options=None, default_source="server"):
    options = options or {}
    info = error_or_info if isinstance(error_or_info, dict) else {}
    error = error_or_info if isinstance(error_or_info, BaseException) else info.get("error")
    merged = {**info, **options}
    explicit_type = merged.get("errorType") or merged.get("error_type")
    if explicit_type:
        raw_error_type = explicit_type
    elif error:
        raw_error_type = error.__class__.__name__
    elif isinstance(error_or_info, str):
        raw_error_type = "Error"
    else:
        raw_error_type = ""
    error_type = _clean_error_field(raw_error_type, 80) or "Error"
    message = merged.get("message") or _error_attr(error, "message") or str(error_or_info or error_type)
    properties = {
        "errorKind": _clean_error_field(merged.get("errorKind") or merged.get("error_kind"), 40) or "runtime",
        "errorType": error_type,
        "messageFingerprint": _clean_error_field(merged.get("messageFingerprint") or merged.get("message_fingerprint"), 120)
        or _message_fingerprint(error_type, message),
        "fatal": merged.get("fatal") is True,
        "handled": False if merged.get("handled") is False else True,
        "source": _clean_error_field(merged.get("source"), 40) or default_source,
        "status": "error",
    }
    nested_properties = merged.get("properties") if isinstance(merged.get("properties"), dict) else {}
    release = _clean_error_field(merged.get("release") or nested_properties.get("release"), 80)
    component = _clean_error_field(merged.get("component") or nested_properties.get("component"), 120)
    if release:
        properties["release"] = release
    if component:
        properties["component"] = component
    message_preview = _sanitize_error_message_preview(merged.get("messagePreview") or merged.get("message_preview") or nested_properties.get("messagePreview") or message)
    if message_preview:
        properties["messagePreview"] = message_preview
    stack = merged.get("stack") or merged.get("stackTrace") or merged.get("stack_trace") or _stack_text(error)
    if stack:
        properties["stackFingerprint"] = _diagnostic_fingerprint("tm_stack_", stack)
        top_frame = _first_stack_frame(stack)
        if top_frame:
            properties["topFrameFingerprint"] = _diagnostic_fingerprint("tm_frame_", top_frame)
    cause = _error_cause(error, merged)
    cause_type = _clean_error_field(_cause_type(cause, merged.get("causeType") or merged.get("cause_type") or nested_properties.get("causeType")), 80)
    if cause_type:
        properties["causeType"] = cause_type
    cause_message = _cause_message(cause, merged.get("causeMessage") or merged.get("cause_message") or nested_properties.get("causeMessage"))
    if cause_type or cause_message:
        properties["causeFingerprint"] = _diagnostic_fingerprint("tm_cause_", f"{cause_type}:{cause_message}")
    for key in ["operation", "feature", "routeName", "correlationId", "requestId"]:
        value = _safe_diagnostic_field(merged, key)
        if value:
            properties[key] = value
    http_status = merged.get("httpStatus") or merged.get("http_status") or merged.get("statusCode") or merged.get("status_code") or nested_properties.get("httpStatus") or nested_properties.get("statusCode")
    if isinstance(http_status, bool):
        http_status = None
    elif isinstance(http_status, int):
        pass
    elif isinstance(http_status, float) and http_status.is_integer():
        http_status = int(http_status)
    elif isinstance(http_status, str) and re.fullmatch(r"\d+", http_status.strip()):
        http_status = int(http_status.strip())
    else:
        http_status = None
    if http_status and 100 <= http_status <= 599:
        properties["httpStatus"] = http_status
    raw_path = merged.get("path") or merged.get("screen")
    path = _strip_query_path(raw_path) if raw_path else ""
    payload = {
        "event_name": "app_error",
        "properties": properties,
        "context": _sanitize_app_error_context(merged.get("context")),
        "source_details": merged.get("source_details"),
        "user_id": merged.get("user_id"),
        "anonymous_id": merged.get("anonymous_id"),
        "session_id": merged.get("session_id"),
        "attribution": merged.get("attribution"),
    }
    if path:
        payload["path"] = path
    return payload


def _clean_attribution_value(value):
    text = re.sub(r"\s+", "-", _safe_string(value, 120))
    if not text or "@" in text or re.search(r"https?:|[?&=]|%40", text, re.IGNORECASE):
        return None
    return text if ATTRIBUTION_VALUE_PATTERN.match(text) else None


def _clean_attribution_domain(value):
    domain = _safe_string(value, 200).strip(".").lower()
    if not domain or "@" in domain or re.search(r"[/?#&=]", domain):
        return None
    return domain if ATTRIBUTION_DOMAIN_PATTERN.match(domain) else None


def _clean_attribution_path(value):
    path = _safe_string(value, 500).split("?", 1)[0]
    if not path or not path.startswith("/") or "@" in path or re.search(r"^https?:", path, re.IGNORECASE):
        return None
    return path


def _clean_referrer_type(value):
    referrer_type = _safe_string(value, 40).lower()
    return referrer_type if referrer_type in ATTRIBUTION_REFERRER_TYPES else None


def sanitize_attribution(attribution):
    if not isinstance(attribution, dict):
        return {}
    candidates = {
        "source": _clean_attribution_value(attribution.get("source")),
        "medium": _clean_attribution_value(attribution.get("medium")),
        "campaign": _clean_attribution_value(attribution.get("campaign")),
        "content": _clean_attribution_value(attribution.get("content")),
        "referrerDomain": _clean_attribution_domain(attribution.get("referrerDomain")),
        "referrerType": _clean_referrer_type(attribution.get("referrerType")),
        "landingPath": _clean_attribution_path(attribution.get("landingPath")),
        "gclidPresent": True if attribution.get("gclidPresent") is True else None,
        "fbclidPresent": True if attribution.get("fbclidPresent") is True else None,
        "msclkidPresent": True if attribution.get("msclkidPresent") is True else None,
    }
    return {key: value for key, value in candidates.items() if value is not None}


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
        if isinstance(value, str) and FULL_QUERY_URL_PATTERN.search(value):
            continue
        sanitized[key] = value
    return sanitized


def sanitize_feedback_fields(fields):
    if not isinstance(fields, dict):
        return {}
    sanitized = {}
    for key, value in fields.items():
        if FEEDBACK_FORBIDDEN_FIELD_PATTERN.search(_normalize_field_key(key)):
            continue
        if not _is_primitive_value(value):
            continue
        if isinstance(value, str) and (
            FULL_QUERY_URL_PATTERN.search(value)
            or re.search(
                r"\b(bearer\s+\S+|api[_-]?key|access[_-]?token|secret[_-]?token|raw\s+prompt|raw\s+user\s+content|source\s+diff|request\s+body|response\s+body)\b",
                value,
                re.IGNORECASE,
            )
        ):
            continue
        sanitized[key] = value
    return sanitized


def _sanitize_feedback_contact(contact):
    if not isinstance(contact, dict) or contact.get("consent") is not True:
        return {"consent": False}
    sanitized = {"consent": True}
    for key, max_length in (("name", 120), ("email", 160), ("phone", 80), ("preferredChannel", 40)):
        value = _safe_string(contact.get(key), max_length)
        if value:
            sanitized[key] = value
    return sanitized


def _sanitize_feedback_message(message):
    if not isinstance(message, dict):
        message = {"body": message}
    kind = _safe_string(message.get("kind"), 20, "other").lower()
    if kind not in {"issue", "idea", "question", "other"}:
        kind = "other"
    return {
        "formatVersion": 1,
        "kind": kind,
        "title": _safe_string(message.get("title"), 160),
        "body": _safe_string(message.get("body") or message.get("text"), 4000),
        "contact": _sanitize_feedback_contact(message.get("contact")),
        "fields": sanitize_feedback_fields(message.get("fields")),
        "attachments": [],
    }


def _stable_hash(value):
    encoded = json.dumps(value or {}, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "tm_target_" + hashlib.sha256(encoded).hexdigest()[:24]


def _feedback_endpoint_for(endpoint):
    value = _safe_string(endpoint, 1000, DEFAULT_ENDPOINT)
    path_value = re.split(r"[?#]", value, maxsplit=1)[0]
    if not path_value.endswith("/api/capture"):
        return DEFAULT_FEEDBACK_ENDPOINT
    return path_value[: -len("/api/capture")] + "/api/user-feedback"


class TraceMindServerClient:
    def __init__(
        self,
        project_key,
        source_key="server-app",
        endpoint=DEFAULT_ENDPOINT,
        feedback_endpoint=None,
        transport=None,
        feedback_transport=None,
        queue_limit=1000,
        now=None,
    ):
        if not project_key:
            raise ValueError("TraceMindServer requires project_key.")
        self.project_key = project_key
        self.source_key = _safe_string(source_key, 200, "server-app")
        self.endpoint = endpoint
        self.feedback_endpoint = feedback_endpoint or _feedback_endpoint_for(endpoint)
        self.transport = transport or self._default_transport
        self.feedback_transport = feedback_transport or self._default_feedback_transport
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

    def _default_feedback_transport(self, body):
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            self.feedback_endpoint,
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
                "sdkContentHash": SDK_CONTENT_HASH,
            },
        }

    def _enqueue(self, event):
        try:
            self.queue.append({"platform": "server", "occurredAt": self.now(), **event})
            while len(self.queue) > self.queue_limit:
                self.queue.pop(0)
        except Exception:
            pass

    def capture(self, event_type, event_name=None, user_id=None, anonymous_id=None, session_id=None, path="/", properties=None, context=None, target=None, source_details=None, attribution=None):
        name = _safe_string(event_name or event_type, 120)
        event_target = target or {"type": "server_event", "name": name, "sourceKey": self.source_key}
        event = {
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
        }
        safe_attribution = sanitize_attribution(attribution)
        if safe_attribution:
            event["attribution"] = safe_attribution
        self._enqueue(event)

    def capture_error(self, error_or_info=None, **kwargs):
        payload = _app_error_payload(error_or_info, kwargs, "server")
        return self.capture("app_error", **payload)

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

    def submit_feedback(self, message=None, user_id=None, anonymous_id=None, session_id=None, device_id=None, path="/", source_details=None):
        body = {
            "projectKey": self.project_key,
            "sessionId": _safe_string(session_id or self.session_id, 120),
            "anonymousId": _safe_string(anonymous_id or self.anonymous_id, 120),
            "userId": _safe_string(user_id, 160),
            "deviceId": _safe_string(device_id or self.device_id, 120),
            "platform": "server",
            "source": self._source(source_details),
            "path": _safe_string(path, 500, "/"),
            "message": _sanitize_feedback_message(message),
            "occurredAt": self.now(),
        }
        return self.feedback_transport(body)


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
    def capture_error(cls, error_or_info=None, **kwargs):
        if cls._client is None:
            raise RuntimeError("TraceMindServer.start must be called before capture_error.")
        return cls._client.capture_error(error_or_info, **kwargs)

    @classmethod
    def flush(cls):
        if cls._client is None:
            return {"ok": True, "accepted": 0}
        return cls._client.flush()

    @classmethod
    def submit_feedback(cls, **kwargs):
        if cls._client is None:
            raise RuntimeError("TraceMindServer.start must be called before submit_feedback.")
        return cls._client.submit_feedback(**kwargs)
