"""
LLM router — provider-agnostic call_llm with automatic fallback.

Extracted from the original engine.py (AgentX skeleton), then adapted for
the hackathon's actual provider mix (2026-08-07). Groq is primary, not
Gemini: the free-tier Gemini key in use here hits its daily quota almost
immediately under multi-agent load, and every failed Gemini call still costs
~3-10s before falling through — measured directly against a running graph.
Groq answers in under a second when it has quota. Gemini stays in the chain
as a fallback. Anthropic/OpenAI are optional legacy fallbacks — they only
enter the chain if a key happens to be set — since neither is free.

Fallback order: Groq -> Gemini -> Ollama (local `ollama serve` first if
reachable, else Ollama Cloud if OLLAMA_API_KEY is set) -> Anthropic -> OpenAI.
"""
import asyncio
import os
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=True)

GEMINI_MODEL = "gemini-flash-latest"
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
OLLAMA_LOCAL_MODEL = os.environ.get("OLLAMA_LOCAL_MODEL", "qwen2.5:7b")
OLLAMA_CLOUD_MODEL = os.environ.get("OLLAMA_CLOUD_MODEL", "gpt-oss:20b-cloud")
ANTHROPIC_MODEL = "claude-opus-4-8"
OPENAI_MODEL = "gpt-4o-mini"



# Abandon a provider that is merely SLOW, not just one that errors. Measured
# from this machine: warm Groq answers in ~0.15s, but Gemini took ~180s per
# call — long enough that falling back to it was worse than the failure it was
# meant to cover. A bounded wait keeps the fallback chain useful.
PROVIDER_TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "25"))
# A provider chain can contain several individually-bounded clients. Without a
# whole-call deadline those bounds add up (Groq -> Ollama -> Gemini), so one
# agent can still sit inside fallback for minutes and prevent node.finished.
# The async graph always enters call_llm through call_llm_async below.
LLM_CALL_TIMEOUT_S = float(os.environ.get("LLM_CALL_TIMEOUT_S", "50"))


def _force_ipv4() -> None:
    """Restrict outbound socket resolution to IPv4.

    MEASURED on this network: IPv6 connects time out (21s each), IPv4 connects
    in 0.05s. generativelanguage.googleapis.com publishes ~8 AAAA records, so
    a client works through them serially before falling back — ~169s on the
    first call, then 0.2s once a connection is pooled. api.groq.com has a
    single AAAA record, which is the only reason Groq appeared healthy.

    This is a network-environment workaround, not a protocol opinion: it is
    scoped to address resolution and changes no request logic. Set
    ALLOW_IPV6=1 to disable it on a network with working IPv6.
    """
    if os.environ.get("ALLOW_IPV6"):
        return
    import socket

    if getattr(socket, "_ipv4_forced", False):
        return
    _original_getaddrinfo = socket.getaddrinfo

    def _ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        results = _original_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
        # Fall back to the unrestricted lookup for hosts with no A record,
        # so an IPv6-only destination still resolves instead of hard-failing.
        return results or _original_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = _ipv4_only
    socket._ipv4_forced = True


_force_ipv4()


def _parse_json_response(text):
    """Parse the first JSON value in text, tolerating trailing junk or
    markdown fences that some providers occasionally emit even in JSON mode.
    """
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0]
    return json.JSONDecoder().raw_decode(text.strip())[0]


def _call_gemini(system, messages, json_mode):
    from google import genai
    from google.genai import types

    client = _cached("gemini", lambda: genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=PROVIDER_TIMEOUT_S * 1000),  # milliseconds
    ))

    contents = [
        types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part(text=m["content"])])
        for m in messages
    ]

    config = types.GenerateContentConfig(system_instruction=system)
    if json_mode:
        config.response_mime_type = "application/json"

    response = client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=config)
    text = response.text
    return _parse_json_response(text) if json_mode else text


def groq_keys() -> list[str]:
    """All configured Groq keys, in rotation order: GROQ_API_KEY, then
    GROQ_API_KEY_2, _3, ... Blank entries are skipped so a placeholder line in
    .env is harmless.

    NOTE: Groq enforces rate limits per ORGANISATION, not per key — the 429
    body names the org, not the key. Extra keys minted inside one account
    therefore share a single quota and buy nothing; these must come from
    separate Groq accounts to add real headroom.
    """
    keys = []
    primary = os.environ.get("GROQ_API_KEY", "").strip()
    if primary:
        keys.append(primary)
    i = 2
    while True:
        key = os.environ.get(f"GROQ_API_KEY_{i}", "").strip()
        if not key:
            break
        keys.append(key)
        i += 1
    return keys


# Keys observed to be rate-limited this process, so a run doesn't waste a
# round-trip re-testing a key that just 429'd.
_exhausted_groq_keys: set[str] = set()


def _call_groq(system, messages, json_mode):
    from groq import Groq

    kwargs = {}
    effective_system = system
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
        # Groq hard-rejects json_object mode unless the literal word "json"
        # appears somewhere in the messages (400: "'messages' must contain the
        # word 'json'"). Our prompts usually satisfy this by accident; make it
        # deliberate so a reworded prompt can't 400 the whole run.
        if "json" not in effective_system.lower():
            effective_system += "\n\nRespond with valid JSON only."

    keys = groq_keys()
    if not keys:
        raise RuntimeError("no Groq API key configured")

    # Prefer keys not already known to be exhausted, but keep them as a last
    # resort — a daily window can roll over mid-session.
    ordered = [k for k in keys if k not in _exhausted_groq_keys] + \
              [k for k in keys if k in _exhausted_groq_keys]

    last_error = None
    for index, key in enumerate(ordered):
        # max_retries=0 is deliberate and load-bearing.
        #
        # The SDK defaults to 2 internal retries that honour the 429
        # `retry-after` header — so a single rate-limited key SLEEPS inside
        # client.create() before we ever see the error and rotate. MEASURED:
        # one planner call took 103s while the other 19 calls in the same run
        # averaged 0.75s, because it sat in that backoff.
        #
        # Rotating to a different key is our retry strategy, and it is strictly
        # better than waiting: a fresh key answers in ~0.3s, whereas honouring
        # retry-after burns a minute of a live demo doing nothing.
        client = _cached(
            f"groq:{key[-8:]}",
            lambda k=key: Groq(api_key=k, timeout=PROVIDER_TIMEOUT_S, max_retries=0),
        )
        try:
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "system", "content": effective_system}] + messages,
                **kwargs,
            )
            _exhausted_groq_keys.discard(key)
            text = response.choices[0].message.content
            return _parse_json_response(text) if json_mode else text
        except Exception as e:
            last_error = e
            text = str(e).lower()
            key_specific = (
                "rate_limit" in text or "429" in text          # quota exhausted
                or "401" in text or "invalid api key" in text  # wrong/dead key
                or "403" in text                               # key lacks access
            )
            if key_specific:
                # Any of these are faults of THIS key, so another key may well
                # succeed. Notably a pasted-in-error key (e.g. an xAI `xai-`
                # key in a Groq slot) 401s — that must not abort the chain and
                # strand the valid keys behind it.
                _exhausted_groq_keys.add(key)
                continue
            raise  # malformed request etc. — every key would fail identically

    raise RuntimeError(f"all {len(keys)} Groq key(s) unusable; last error: {last_error}")


def _call_ollama(system, messages, json_mode):
    """Prefers a genuinely local `ollama serve` on localhost:11434 — tried
    first regardless of OLLAMA_API_KEY, since a local model has no quota and
    no network dependency. Falls back to Ollama Cloud only if the local
    server isn't reachable and a cloud key is set.
    """
    import ollama

    kwargs = {}
    if json_mode:
        kwargs["format"] = "json"

    try:
        local_client = ollama.Client(timeout=PROVIDER_TIMEOUT_S)  # defaults to http://localhost:11434
        response = local_client.chat(
            model=OLLAMA_LOCAL_MODEL,
            messages=[{"role": "system", "content": system}] + messages,
            keep_alive="30m",
            **kwargs,
        )
        text = response["message"]["content"]
        return _parse_json_response(text) if json_mode else text
    except Exception as local_error:
        api_key = os.environ.get("OLLAMA_API_KEY")
        if not api_key:
            raise
        cloud_client = ollama.Client(
            host="https://ollama.com", headers={"Authorization": f"Bearer {api_key}"},
            timeout=PROVIDER_TIMEOUT_S,
        )
        response = cloud_client.chat(model=OLLAMA_CLOUD_MODEL, messages=[{"role": "system", "content": system}] + messages, **kwargs)
        text = response["message"]["content"]
        return _parse_json_response(text) if json_mode else text


def warm_local_ollama() -> None:
    """Load the configured local model before it is needed as a fallback.

    The ordinary warm-up follows provider priority and therefore stops after a
    successful Groq response. That left Ollama cold precisely until Groq quota
    ran out; loading a 7B model then consumed the entire request deadline.
    One generated token loads the model and keep_alive retains it for the demo.
    """
    if os.environ.get("OLLAMA_DISABLE"):
        return
    import ollama

    client = ollama.Client(timeout=max(PROVIDER_TIMEOUT_S, 90))
    client.generate(
        model=OLLAMA_LOCAL_MODEL,
        prompt="ready",
        options={"num_predict": 1},
        keep_alive="30m",
    )


def _call_anthropic(system, messages, json_mode):
    import anthropic

    client = anthropic.Anthropic(
        api_key=os.environ["ANTHROPIC_API_KEY"], timeout=PROVIDER_TIMEOUT_S, max_retries=0,
    )

    effective_system = system
    if json_mode:
        effective_system += "\n\nRespond with valid JSON only. No prose, no markdown fences."

    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=4096,
        system=effective_system,
        messages=messages,
    )
    text = next(b.text for b in response.content if b.type == "text")
    return _parse_json_response(text) if json_mode else text


def _call_openai(system, messages, json_mode):
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ["OPENAI_API_KEY"], timeout=PROVIDER_TIMEOUT_S, max_retries=0,
    )

    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "system", "content": system}] + messages,
        **kwargs,
    )
    text = response.choices[0].message.content
    return _parse_json_response(text) if json_mode else text





# Instrumentation: how many LLM round-trips a run actually costs. Read by the
# latency tests to prove the call-count reductions, and cheap enough to leave on.
CALL_COUNT = {"total": 0}

# Provider clients are cached per process. Constructing one per call meant a
# fresh TLS handshake every time — measured at ~5.5s of fixed overhead per
# request against Groq from this machine, dwarfing actual inference time.
_clients: dict[str, object] = {}


def _cached(key: str, factory):
    if key not in _clients:
        _clients[key] = factory()
    return _clients[key]


def reset_call_count() -> None:
    CALL_COUNT["total"] = 0


def call_llm(system, messages, json_mode=False):
    """Call the LLM with automatic provider fallback.

    system: system prompt string
    messages: list of {"role": "user"|"assistant", "content": str}
    json_mode: if True, ask for and parse a JSON response

    Returns a str (or dict if json_mode=True). Raises RuntimeError if every
    configured provider fails.
    """
    CALL_COUNT["total"] += 1

    providers = []
    if os.environ.get("GROQ_API_KEY"):
        providers.append(("groq", _call_groq))
    # Local Ollama outranks Gemini deliberately. Measured per-call latency from
    # this machine: local Ollama ~13-60s, Gemini ~180s. When Groq rate-limits
    # mid-demo, the local model is the faster recovery, and it needs no quota.
    if not os.environ.get("OLLAMA_DISABLE"):
        providers.append(("ollama", _call_ollama))
    if os.environ.get("GEMINI_API_KEY"):
        providers.append(("gemini", _call_gemini))
    if os.environ.get("ANTHROPIC_API_KEY"):
        providers.append(("anthropic", _call_anthropic))
    if os.environ.get("OPENAI_API_KEY"):
        providers.append(("openai", _call_openai))

    if not providers:
        raise RuntimeError(
            "No LLM provider available (GEMINI_API_KEY / GROQ_API_KEY / "
            "ANTHROPIC_API_KEY / OPENAI_API_KEY all unset, and OLLAMA_DISABLE is set)."
        )

    errors = []
    for name, fn in providers:
        try:
            return fn(system, messages, json_mode)
        except Exception as e:
            errors.append(f"{name}: {e}")

    raise RuntimeError("All LLM providers failed:\n" + "\n".join(errors))


async def call_llm_async(system, messages, json_mode=False):
    """Run one complete provider chain without allowing it to strand a graph.

    asyncio cannot forcibly stop a synchronous SDK call already running in a
    worker thread, but the provider-level HTTP timeouts above ensure that
    worker exits shortly afterward. The graph itself is released immediately,
    records the step as degraded/error, and continues to run.finished.
    """
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(call_llm, system, messages, json_mode),
            timeout=LLM_CALL_TIMEOUT_S,
        )
    except TimeoutError as error:
        raise TimeoutError(
            f"LLM call exceeded the {LLM_CALL_TIMEOUT_S:g}s execution deadline"
        ) from error
