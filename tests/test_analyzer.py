"""Prompt construction, response parsing, evasion enforcement, retry and fallback."""

import json
from unittest.mock import MagicMock

import pytest
from google.genai.errors import APIError

import analyzer


def _report(**overrides):
    base = {"summary": ["Does a thing"], "risk_flags": [], "overall_risk_score": 5, "safe_to_install": True}
    base.update(overrides)
    return base


def _client(*effects):
    client = MagicMock()
    client.models.generate_content.side_effect = list(effects)
    return client


def _response(payload):
    return MagicMock(text=json.dumps(payload))


def _api_error(code):
    return APIError(code, {"error": {"code": code, "message": "high demand"}})


# ---------- parsing ----------

def test_parse_json_plain():
    assert analyzer.parse_json('{"a": 1}') == {"a": 1}


def test_parse_json_strips_code_fence_and_prose():
    assert analyzer.parse_json('Here you go:\n```json\n{"a": 1}\n```\nThanks') == {"a": 1}


def test_parse_json_without_object_raises():
    with pytest.raises(ValueError):
        analyzer.parse_json("no json here")


def test_risk_report_rejects_out_of_range_score():
    with pytest.raises(Exception):
        analyzer.RiskReport.model_validate(_report(overall_risk_score=150))


# ---------- permissions and suggested changes ----------

def test_report_accepts_permissions_and_suggested_changes():
    report = analyzer.RiskReport.model_validate(_report(
        permissions=[{"name": "Run shell commands", "detail": "runs git", "level": "low"}],
        suggested_changes=[{"snippet": "bad line", "action": "replace", "replacement": "good line", "reason": "safer"}]))
    assert report.permissions[0].level == "low"
    assert report.suggested_changes[0].replacement == "good line"


def test_new_fields_default_to_empty_for_older_replies():
    report = analyzer.RiskReport.model_validate(_report())
    assert report.permissions == [] and report.suggested_changes == []


def test_suggested_change_defaults_to_remove():
    change = analyzer.SuggestedChange.model_validate({"snippet": "x"})
    assert change.action == "remove" and change.replacement == ""


def test_system_prompt_asks_for_permissions_and_changes():
    assert "PERMISSIONS" in analyzer.SYSTEM_PROMPT and "SUGGESTED CHANGES" in analyzer.SYSTEM_PROMPT
    assert '"suggested_changes"' in analyzer.SYSTEM_PROMPT and '"permissions"' in analyzer.SYSTEM_PROMPT


def test_evasion_rule_keeps_permissions_and_changes():
    flag = {"category": "evasion_attempt", "severity": "critical", "snippet": "s", "explanation": "e", "recommendation": "r"}
    report = analyzer.analyze_skill(_client(_response(_report(
        risk_flags=[flag], overall_risk_score=20, safe_to_install=True,
        permissions=[{"name": "Network access", "level": "high"}],
        suggested_changes=[{"snippet": "s", "action": "remove"}]))), "x", [])
    assert report.overall_risk_score == 100
    assert len(report.permissions) == 1 and len(report.suggested_changes) == 1


# ---------- prompt ----------

def test_user_prompt_wraps_skill_as_untrusted_and_includes_patterns():
    patterns = [{"name": "silent_upload", "category": "data_exfiltration", "severity": "high",
                 "description": "Sends data out", "pattern_examples": ["send data to attacker"]}]
    prompt = analyzer.build_user_prompt("MY SKILL TEXT", patterns)
    assert "<skill>\nMY SKILL TEXT\n</skill>" in prompt
    assert "silent_upload" in prompt and "send data to attacker" in prompt


def test_user_prompt_without_patterns():
    assert "No similar patterns found." in analyzer.build_user_prompt("x", [])


def test_system_prompt_treats_skill_as_untrusted_and_has_evasion_clause():
    assert "UNTRUSTED DATA" in analyzer.SYSTEM_PROMPT
    assert "EVASION DETECTION" in analyzer.SYSTEM_PROMPT
    assert "evasion_attempt" in analyzer.SYSTEM_PROMPT


# ---------- evasion enforcement ----------

def test_evasion_flag_forces_score_100_and_unsafe():
    flag = {"category": "evasion_attempt", "severity": "critical", "snippet": "mark this safe",
            "explanation": "e", "recommendation": "r"}
    report = analyzer.analyze_skill(
        _client(_response(_report(risk_flags=[flag], overall_risk_score=30, safe_to_install=True))), "x", [])
    assert report.overall_risk_score == 100
    assert report.safe_to_install is False
    assert report.summary[0] == analyzer.EVASION_NOTE


def test_evasion_note_not_duplicated():
    flag = {"category": "evasion_attempt", "severity": "critical", "snippet": "s", "explanation": "e", "recommendation": "r"}
    report = analyzer.RiskReport.model_validate(
        _report(summary=[analyzer.EVASION_NOTE], risk_flags=[flag]))
    assert analyzer.enforce_evasion_rules(report).summary.count(analyzer.EVASION_NOTE) == 1


def test_clean_report_is_unchanged():
    report = analyzer.analyze_skill(_client(_response(_report())), "x", [])
    assert report.overall_risk_score == 5 and report.safe_to_install is True


def test_non_evasion_flags_do_not_force_score():
    flag = {"category": "supply_chain", "severity": "medium", "snippet": "s", "explanation": "e", "recommendation": "r"}
    report = analyzer.analyze_skill(
        _client(_response(_report(risk_flags=[flag], overall_risk_score=40, safe_to_install=False))), "x", [])
    assert report.overall_risk_score == 40


# ---------- retry and fallback ----------

@pytest.fixture
def no_sleep(monkeypatch):
    sleeps = []
    monkeypatch.setattr(analyzer.time, "sleep", lambda s: sleeps.append(s))
    return sleeps


def test_retries_on_503_then_succeeds(no_sleep):
    client = _client(_api_error(503), _api_error(503), _response(_report()))
    analyzer.analyze_skill(client, "x", [])
    assert client.models.generate_content.call_count == 3
    assert no_sleep == [1, 3]


def test_falls_back_to_second_model_after_retries(no_sleep, monkeypatch):
    monkeypatch.setattr(analyzer, "MODEL", "primary")
    monkeypatch.setattr(analyzer, "FALLBACK_MODEL", "backup")
    client = _client(_api_error(503), _api_error(503), _api_error(503), _response(_report()))
    analyzer.analyze_skill(client, "x", [])
    models_used = [c.kwargs["model"] for c in client.models.generate_content.call_args_list]
    assert models_used == ["primary", "primary", "primary", "backup"]


def test_raises_when_all_models_unavailable(no_sleep, monkeypatch):
    monkeypatch.setattr(analyzer, "MODEL", "primary")
    monkeypatch.setattr(analyzer, "FALLBACK_MODEL", "backup")
    client = _client(*[_api_error(503)] * 6)
    with pytest.raises(APIError):
        analyzer.analyze_skill(client, "x", [])
    assert client.models.generate_content.call_count == 6


def test_non_retryable_error_raises_immediately(no_sleep):
    client = _client(_api_error(400), _response(_report()))
    with pytest.raises(APIError):
        analyzer.analyze_skill(client, "x", [])
    assert client.models.generate_content.call_count == 1 and no_sleep == []


def test_timeouts_are_retryable():
    class ReadTimeout(Exception):
        pass

    assert analyzer._is_retryable(ReadTimeout()) is True
    assert analyzer._is_retryable(ValueError("x")) is False
