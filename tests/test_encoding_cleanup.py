from pathlib import Path
import unittest


class SourceEncodingCleanupTests(unittest.TestCase):
    def test_known_mojibake_tokens_are_absent_from_source_files(self):
        targets = {
            "app/models.py": [
                "骞寸骇",
                "鎿嶄綔璇︽儏",
                "绯荤粺绾у埆",
                "鑳屾櫙璁剧疆",
            ],
        }

        for relative_path, bad_tokens in targets.items():
            content = Path(relative_path).read_text(encoding="utf-8")
            for token in bad_tokens:
                self.assertNotIn(token, content, f"{relative_path} still contains mojibake token: {token}")

    def test_question_mark_placeholders_are_cleaned(self):
        from app.utils.encoding_cleanup import clean_corrupted_text

        self.assertEqual(
            clean_corrupted_text("??????", field_name="reason"),
            "历史数据存在编码异常，请重新填写",
        )
        self.assertEqual(
            clean_corrupted_text("你提交的 2026-03-04 上班补签 申请已驳回。原因：??????", field_name="content"),
            "你提交的 2026-03-04 上班补签 申请已驳回。原因：历史数据存在编码异常，请重新填写",
        )
        self.assertEqual(
            clean_corrupted_text("??????-20260416204057", field_name="target_name"),
            "历史记录名称存在编码异常-20260416204057",
        )
        self.assertEqual(clean_corrupted_text("正常中文", field_name="reason"), "正常中文")
        self.assertEqual(
            clean_corrupted_text("鑷姩鍥炲綊娴嬭瘯璇峰亣-20260418173924", field_name="reason"),
            "历史数据存在编码异常，请重新填写-20260418173924",
        )


    def test_react_layout_uses_readable_school_brand_mark(self):
        content = Path("frontend/src/layouts/AppLayout.tsx").read_text(encoding="utf-8")

        self.assertIn("app-brand-mark\">{'校'}</div>", content)


if __name__ == "__main__":
    unittest.main()
