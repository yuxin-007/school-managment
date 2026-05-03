import re


QUESTION_MARK_RUN_RE = re.compile(r"\?{2,}")
PRIVATE_USE_RE = re.compile(r"[\uE000-\uF8FF]")
TRAILING_NUMERIC_SUFFIX_RE = re.compile(r"(-\d{8,})$")


FIELD_REPLACEMENTS = {
    "reason": "历史数据存在编码异常，请重新填写",
    "approval_notes": "历史数据存在编码异常，请重新填写",
    "approval_comments": "历史数据存在编码异常，请重新填写",
    "comments": "历史数据存在编码异常，请重新填写",
    "remark": "历史数据存在编码异常，请重新填写",
    "detail": "历史数据存在编码异常，请重新填写",
    "target_name": "历史记录名称存在编码异常",
    "content": "历史数据存在编码异常，请重新填写",
    "title": "历史标题存在编码异常",
}


def has_placeholder_corruption(value: str | None) -> bool:
    if not isinstance(value, str):
        return False
    return bool(QUESTION_MARK_RUN_RE.search(value) or PRIVATE_USE_RE.search(value))


def clean_corrupted_text(value: str | None, field_name: str) -> str | None:
    if not isinstance(value, str) or not has_placeholder_corruption(value):
        return value

    replacement = FIELD_REPLACEMENTS.get(field_name, FIELD_REPLACEMENTS["reason"])
    cleaned = QUESTION_MARK_RUN_RE.sub(replacement, value)
    if PRIVATE_USE_RE.search(cleaned):
        suffix_match = TRAILING_NUMERIC_SUFFIX_RE.search(cleaned)
        suffix = suffix_match.group(1) if suffix_match else ""
        return f"{replacement}{suffix}"
    return cleaned
