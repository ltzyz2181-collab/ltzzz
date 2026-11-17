#!/usr/bin/env python3
"""Gmail IMAP 正文按需读取的单元测试（不需要真实邮箱）。

覆盖工单 §一.3/§一.4 的正文读取边界：
- 只对命中项目规则的邮件读正文；无关私人邮件不读；
- 只用 BODY.PEEK，绝无 STORE/EXPUNGE/COPY/MOVE；
- 只返回派生字段（哈希、字节数、Task ID、decision_id、裁决词），正文原文不离开函数；
- 写盘前 assert_privacy 拦截正文、多行文本和过长字符串；
- 单封读取失败按 fetch_failed 隔离，不猜内容。
"""
import email
import hashlib
import importlib.util
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODULE_PATH = os.path.join(ROOT, 'scripts', 'collect-gmail-imap.py')

spec = importlib.util.spec_from_file_location('collect_gmail_imap', MODULE_PATH)
cg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cg)


class FakeConn:
    def __init__(self, payload=b'', status='OK'):
        self.payload = payload
        self.status = status
        self.calls = []

    def fetch(self, seq, query):
        self.calls.append((seq, query))
        if self.status != 'OK':
            return self.status, [None]
        return 'OK', [(b'1 (BODY[TEXT] {%d}' % len(self.payload), self.payload)]


class RedactTest(unittest.TestCase):
    def test_symbol_before_amount(self):
        self.assertIn('<amount>', cg.redact('部分退款 ¥9.90 已到账'))
        self.assertIn('<amount>', cg.redact('Payment $12.34 done'))
        self.assertNotIn('9.90', cg.redact('部分退款 ¥9.90 已到账'))

    def test_token(self):
        out = cg.redact('key sk-ant-abcdefghijklmnopqrstuvwxyz0123')
        self.assertIn('<token>', out)
        self.assertNotIn('sk-ant-abcdefghijklmnopqrstuvwxyz0123', out)

    def test_plain_subject_untouched(self):
        self.assertEqual(cg.redact('【LTZZZ】周报 2026-11-17'), '【LTZZZ】周报 2026-11-17')

    def test_short_cap(self):
        self.assertLessEqual(len(cg.redact('x' * 200)), 60)


class BodySelectionTest(unittest.TestCase):
    def test_project_sender_with_project_wording(self):
        self.assertTrue(cg.should_read_body('ltzyz2181@gmail.com', 'gmail.com', '请裁决 Phase2 方案'))

    def test_unknown_sender_never_read(self):
        self.assertFalse(cg.should_read_body('stranger@example.com', 'example.com', '请裁决 Phase2 方案'))

    def test_project_domain_with_decision_id(self):
        self.assertTrue(cg.should_read_body('notifications@github.com', 'github.com', 'Re: GPT-RULING-20261116-18'))

    def test_project_domain_without_project_wording(self):
        self.assertFalse(cg.should_read_body('notifications@github.com', 'github.com', '你有一封新周报'))

    def test_body_disabled_switch(self):
        old = cg.BODY_ENABLED
        try:
            cg.BODY_ENABLED = False
            self.assertFalse(cg.should_read_body('ltzyz2181@gmail.com', 'gmail.com', '请裁决'))
        finally:
            cg.BODY_ENABLED = old


class BodySummaryTest(unittest.TestCase):
    RAW = (
        b'Decision GPT-RULING-20261116-18 for LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02. '
        b'Verdict: approve_in_scope. Contact 13800138000.'
    )

    def test_only_derived_fields_returned(self):
        summary = cg.summarize_body(self.RAW)
        for forbidden in ('body', 'text', 'raw', 'html', 'snippet'):
            self.assertNotIn(forbidden, summary)
        self.assertEqual(summary['body_status'], 'ok')
        self.assertEqual(summary['body_method'], 'BODY.PEEK[TEXT]')
        self.assertEqual(summary['body_bytes'], len(self.RAW))
        self.assertIn('GPT-RULING-20261116-18', summary['body_decision_ids'])
        self.assertIn('LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02', summary['body_task_ids'])
        self.assertIn('approve_in_scope', summary['body_verdicts'])
        self.assertEqual(summary['body_sha256'], hashlib.sha256(
            cg.decode_body(self.RAW).encode('utf-8', 'surrogateescape')).hexdigest())

    def test_truncation_flag(self):
        old = cg.MAX_BODY_BYTES
        try:
            cg.MAX_BODY_BYTES = 10
            summary = cg.summarize_body(self.RAW)
            self.assertTrue(summary['body_truncated'])
            self.assertEqual(summary['body_bytes'], len(self.RAW))
        finally:
            cg.MAX_BODY_BYTES = old

    def test_fetch_uses_peek_only(self):
        conn = FakeConn(self.RAW)
        summary = cg.fetch_body_summary(conn, 7)
        self.assertEqual(conn.calls, [('7', '(BODY.PEEK[TEXT])')])
        self.assertEqual(summary['body_status'], 'ok')

    def test_fetch_failure_isolated(self):
        conn = FakeConn(status='NO')
        summary = cg.fetch_body_summary(conn, 8)
        self.assertEqual(summary, {'body_status': 'fetch_failed'})

    def test_empty_body_not_counted_as_ok(self):
        conn = FakeConn(b'')
        self.assertEqual(cg.fetch_body_summary(conn, 9), {'body_status': 'empty'})

    def test_html_and_quoted_printable_normalized(self):
        text = cg.decode_body(b'<p>Hello</p> =\r\nWorld')
        self.assertNotIn('<p>', text)
        self.assertIn('Hello', text)
        self.assertIn('World', text)


class PrivacyGuardTest(unittest.TestCase):
    def test_rejects_raw_body_key(self):
        with self.assertRaises(AssertionError):
            cg.assert_privacy({'messages': [{'body': 'secret'}]})

    def test_rejects_long_string(self):
        with self.assertRaises(AssertionError):
            cg.assert_privacy({'note': 'x' * 400})

    def test_rejects_multiline(self):
        with self.assertRaises(AssertionError):
            cg.assert_privacy({'note': 'line1\nline2'})

    def test_accepts_derived_payload(self):
        cg.assert_privacy({
            'schema': 'ltzzz.mail-fullbox.v1',
            'messages': [{
                'ref': 'abc',
                'subject_short': 'Re: 项目',
                'body_sha256': 'f' * 64,
                'body_task_ids': ['LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02'],
            }],
        })


class HeaderTest(unittest.TestCase):
    def test_thread_root_prefers_first_reference(self):
        msg = email.message_from_string('References: root@x child@x\nMessage-ID: child@x\n\n')
        self.assertEqual(cg.thread_root(msg), cg.sha256('root@x')[:16])

    def test_thread_root_falls_back_to_message_id(self):
        msg = email.message_from_string('Message-ID: only@x\n\n')
        self.assertEqual(cg.thread_root(msg), cg.sha256('only@x')[:16])

    def test_thread_root_none_without_ids(self):
        msg = email.message_from_string('Subject: hi\n\n')
        self.assertIsNone(cg.thread_root(msg))

    def test_seq_of(self):
        self.assertEqual(cg.seq_of(b'42 (BODY[HEADER.FIELDS (FROM)] {10}'), 42)
        self.assertIsNone(cg.seq_of(b''))

    def test_sender_address(self):
        self.assertEqual(cg.sender_address('Alice <Alice@Example.COM>'), 'alice@example.com')
        self.assertEqual(cg.sender_address('bob@example.com'), 'bob@example.com')


class StatusTest(unittest.TestCase):
    def test_closed(self):
        self.assertEqual(cg.status_of('Phase1 已验收通过'), 'closed')

    def test_open(self):
        self.assertEqual(cg.status_of('等待 GPT 裁决'), 'open')

    def test_unknown(self):
        self.assertEqual(cg.status_of('随便一封邮件'), 'unknown')


class SourceDisciplineTest(unittest.TestCase):
    """纵深防御：源文件层面禁止任何写邮箱或非 PEEK 读取路径。"""

    @classmethod
    def setUpClass(cls):
        with open(MODULE_PATH, encoding='utf-8') as fh:
            cls.source = fh.read()

    def test_only_peek_body_fetches(self):
        self.assertIsNone(re.search(r'BODY\[(?!PEEK)', self.source),
                          '正文读取只允许 BODY.PEEK[')

    def test_no_mutating_imap_commands(self):
        for pattern in (r'\.store\(', r'\.expunge\(', r'\.copy\(', r'\.move\(',
                        r'uid\(\s*[\'"]STORE', r'uid\(\s*[\'"]EXPUNGE', r'uid\(\s*[\'"]COPY'):
            self.assertIsNone(re.search(pattern, self.source, re.I), '禁止出现 ' + pattern)

    def test_select_is_readonly(self):
        self.assertIn("select('INBOX', readonly=True)", self.source)

    def test_password_never_serialized(self):
        for line in self.source.splitlines():
            if 'PASSWORD' not in line:
                continue
            self.assertNotIn('json.dump', line, '密码不得进入产物')
            self.assertNotIn('write(', line, '密码不得被写出')
            self.assertNotIn('print(', line, '密码不得被打印')


if __name__ == '__main__':
    unittest.main(verbosity=2)
