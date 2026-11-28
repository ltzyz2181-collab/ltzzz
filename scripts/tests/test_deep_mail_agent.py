import importlib.util
import pathlib
import unittest
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

_spec = importlib.util.spec_from_file_location(
    "deep_mail_agent",
    pathlib.Path(__file__).resolve().parents[1] / "deep-mail-agent.py",
)
agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agent)


class DeepMailAgentTests(unittest.TestCase):
    def test_decode_rfc2047_subject(self):
        raw = "=?UTF-8?B?5qih5ouf55uY5bey5LiK57q/INTEST?="
        self.assertIn("TEST", agent.decode_header_value(raw))

    def test_message_text_prefers_plain_part(self):
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText("plain body here", "plain", "utf-8"))
        msg.attach(MIMEText("<b>html</b>", "html", "utf-8"))
        text = agent.message_text(msg.as_bytes())
        self.assertEqual(text, "plain body here")

    def test_message_text_truncates(self):
        msg = MIMEText("x" * 5000, "plain", "utf-8")
        self.assertEqual(len(agent.message_text(msg.as_bytes(), limit=100)), 100)

    def test_extract_json_from_prose(self):
        reply = '好的，结果如下：\n{"read_uids":["3","9"]}\n以上。'
        self.assertEqual(agent.extract_json(reply), {"read_uids": ["3", "9"]})

    def test_extract_json_rejects_plain_text(self):
        with self.assertRaises(ValueError):
            agent.extract_json("no object here")

    def test_scrub_hides_secret(self):
        self.assertNotIn("s3cr3t", agent.scrub("token=s3cr3t", "s3cr3t"))

    def test_select_prompt_lists_headers(self):
        headers = [{"uid": "7", "date": "Fri, 27 Nov 2026", "from": "a@b.c", "subject": "裁决请求"}]
        prompt = agent.build_select_prompt(headers, 2)
        self.assertIn("7\tFri, 27 Nov 2026\ta@b.c\t裁决请求", prompt)
        self.assertIn("read_uids", prompt)


    def test_imap_send_id_issues_id_command(self):
        class FakeConn:
            def __init__(self):
                self.sent = []

            def _simple_command(self, cmd, args):
                self.sent.append((cmd, args))
                return "OK", [b"ID completed"]

        conn = FakeConn()
        self.assertTrue(agent.imap_send_id(conn, "qwe2181@126.com"))
        self.assertEqual(conn.sent[0][0], "ID")
        self.assertIn("qwe2181@126.com", conn.sent[0][1])
        self.assertIn("ID", agent.imaplib.Commands)

    def test_imap_send_id_failure_is_not_fatal(self):
        class BadConn:
            def _simple_command(self, *args, **kwargs):
                raise RuntimeError("server said no")

        self.assertFalse(agent.imap_send_id(BadConn(), "x@y.z"))


if __name__ == "__main__":
    unittest.main()