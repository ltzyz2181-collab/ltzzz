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
        self.assertEqual(summary, {'body_status': 'fetch_failed', 'body_error_class': 'imap_no'})

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


class BodyQueueTest(unittest.TestCase):
    """50 封正文上限的续批机制：未处理项必须保留，已完成项不得重复读。"""

    NOW = '2026-11-23T12:00:00Z'

    def candidate(self, ref, **overrides):
        record = {
            'ref': ref,
            'date': '2026-11-23T00:00:00Z',
            'from_domain': 'gmail.com',
            'subject_short': 'Re: 请裁决',
            'subject_sha256': 'a' * 64,
            'thread_id': 'thread-' + ref,
            'task_ids': ['LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01'],
            'body_candidate': True,
        }
        record.update(overrides)
        return record

    def test_merge_preserves_done_and_not_in_window(self):
        previous = [
            {'ref': 'done-1', 'status': 'done', 'first_seen': '2026-11-20T00:00:00Z', 'attempts': 1},
            {'ref': 'old-1', 'status': 'pending', 'first_seen': '2026-11-21T00:00:00Z', 'attempts': 0},
            {'ref': 'back-1', 'status': 'not_in_window', 'first_seen': '2026-11-22T00:00:00Z', 'attempts': 0},
        ]
        messages = [
            self.candidate('new-1'),
            self.candidate('done-1'),
            self.candidate('back-1'),
        ]
        merged = {entry['ref']: entry for entry in cg.merge_body_queue(previous, messages, self.NOW, 30)}
        self.assertEqual(merged['done-1']['status'], 'done')
        self.assertEqual(merged['old-1']['status'], 'not_in_window')
        self.assertEqual(merged['back-1']['status'], 'pending', '重新出现的项必须恢复待处理')
        self.assertEqual(merged['new-1']['status'], 'pending')

    def test_merge_expires_old_pending_without_faking_done(self):
        previous = [{'ref': 'old-2', 'status': 'pending', 'first_seen': '2026-09-01T00:00:00Z', 'attempts': 2}]
        merged = cg.merge_body_queue(previous, [], self.NOW, 30)
        self.assertEqual(merged[0]['status'], 'expired')
        self.assertNotEqual(merged[0]['status'], 'done')

    def test_select_is_fifo_and_capped_at_50(self):
        entries = [
            {'ref': 'ref-%02d' % i, 'status': 'pending', 'first_seen': '2026-11-22T00:%02d:00Z' % i, 'attempts': 0}
            for i in range(60)
        ]
        refs = {entry['ref'] for entry in entries}
        selected = cg.select_body_batch(entries, refs, 50)
        self.assertEqual(len(selected), 50)
        self.assertEqual(selected[0]['ref'], 'ref-00')
        self.assertEqual(selected[-1]['ref'], 'ref-49')
        deferred = [entry for entry in entries if entry['ref'] not in {s['ref'] for s in selected}]
        self.assertEqual(len(deferred), 10, '未选中的 10 封必须留在队列里')

    def test_retry_is_selected_before_same_batch_pending(self):
        """早期失败的项不能被同批 pending 永久挤后：retry 先选。"""
        entries = [
            {'ref': 'p-%02d' % i, 'status': 'pending', 'first_seen': '2026-11-24T01:56:22Z', 'attempts': 0}
            for i in range(10)
        ] + [
            {'ref': 'r-%02d' % i, 'status': 'retry', 'first_seen': '2026-11-24T01:56:22Z', 'attempts': 1}
            for i in range(3)
        ]
        refs = {entry['ref'] for entry in entries}
        selected = cg.select_body_batch(entries, refs, 3)
        self.assertEqual([entry['ref'] for entry in selected], ['r-00', 'r-01', 'r-02'])

    def test_select_skips_done_expired_and_absent(self):
        entries = [
            {'ref': 'a', 'status': 'done', 'first_seen': '2026-11-22T00:00:00Z'},
            {'ref': 'b', 'status': 'expired', 'first_seen': '2026-11-22T00:00:00Z'},
            {'ref': 'c', 'status': 'retry', 'first_seen': '2026-11-22T00:00:00Z'},
            {'ref': 'd', 'status': 'pending', 'first_seen': '2026-11-22T00:00:00Z'},
        ]
        selected = cg.select_body_batch(entries, {'a', 'b', 'c'}, 10)
        self.assertEqual([entry['ref'] for entry in selected], ['c'])

    def test_finalize_marks_done_and_retries_failures(self):
        entries = [
            {'ref': 'ok-1', 'status': 'pending', 'attempts': 0},
            {'ref': 'empty-1', 'status': 'pending', 'attempts': 0},
            {'ref': 'fail-1', 'status': 'pending', 'attempts': 0},
            {'ref': 'fail-2', 'status': 'pending', 'attempts': 4},
            {'ref': 'not-selected', 'status': 'pending', 'attempts': 0},
        ]
        outcomes = {
            'ok-1': {'body_status': 'ok'},
            'empty-1': {'body_status': 'empty'},
            'fail-1': {'body_status': 'fetch_failed'},
            'fail-2': {'body_status': 'fetch_failed'},
        }
        finalized, stats = cg.finalize_body_queue(entries, outcomes, self.NOW, 5)
        by_ref = {entry['ref']: entry for entry in finalized}
        self.assertEqual(by_ref['ok-1']['status'], 'done')
        self.assertEqual(by_ref['empty-1']['status'], 'done')
        self.assertEqual(by_ref['fail-1']['status'], 'retry')
        self.assertEqual(by_ref['fail-1']['attempts'], 1)
        self.assertEqual(by_ref['fail-2']['status'], 'failed')
        self.assertEqual(by_ref['not-selected']['status'], 'pending')
        self.assertEqual(stats, {'completed': 2, 'failed': 1, 'retry': 1})

    def test_queue_stats_explains_pending(self):
        entries = [
            {'ref': 'p', 'status': 'pending'},
            {'ref': 'r', 'status': 'retry'},
            {'ref': 'f', 'status': 'failed'},
            {'ref': 'd', 'status': 'done'},
            {'ref': 'e', 'status': 'expired'},
            {'ref': 'n', 'status': 'not_in_window'},
        ]
        stats = cg.queue_stats(entries)
        self.assertEqual(stats['pending_count'], 3)
        self.assertEqual(stats['retry_count'], 1)
        self.assertEqual(stats['failed_count'], 1)
        self.assertEqual(stats['not_in_window_count'], 1)
        self.assertEqual(stats['total_count'], 6)

    def test_load_queue_marks_corruption(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            missing = os.path.join(tmp, 'missing.json')
            self.assertEqual(cg.load_body_queue(missing)[1], 'created')
            bad = os.path.join(tmp, 'bad.json')
            with open(bad, 'w', encoding='utf-8') as fh:
                fh.write('not json')
            self.assertEqual(cg.load_body_queue(bad)[1], 'read_failed')
            good = os.path.join(tmp, 'good.json')
            with open(good, 'w', encoding='utf-8') as fh:
                fh.write('{"entries": [{"ref": "x", "status": "pending"}]}')
            entries, status, _ = cg.load_body_queue(good)
            self.assertEqual(status, 'ok')
            self.assertEqual(entries[0]['ref'], 'x')

    def test_merge_keeps_only_metadata_fields(self):
        merged = cg.merge_body_queue([], [self.candidate('m-1', body='SECRET')], self.NOW, 30)
        entry = merged[0]
        for forbidden in ('body', 'text', 'snippet', 'html'):
            self.assertNotIn(forbidden, entry)
        self.assertEqual(entry['thread_id'], 'thread-m-1')


class BrokenConn:
    def __init__(self, error):
        self.error = error
        self.closed = False

    def fetch(self, seq, query):
        raise self.error

    def close(self):
        self.closed = True


class ConnectionRecoveryTest(unittest.TestCase):
    """Gmail 连续 BODY.PEEK 后重置连接：重建会话并只重试当前这封一次。"""

    def test_reset_is_retried_once_after_reconnect(self):
        broken = BrokenConn(ConnectionResetError('reset by peer'))
        fresh = FakeConn(b'hello')
        calls = []

        def reconnect():
            calls.append(1)
            return fresh, None

        outcome, conn, used = cg.fetch_with_reconnect(broken, 7, reconnect)
        self.assertEqual(outcome['body_status'], 'ok')
        self.assertIs(conn, fresh)
        self.assertEqual(used, 1)
        self.assertTrue(broken.closed, '旧连接必须关闭，避免半开连接堆积')
        self.assertEqual(len(calls), 1)

    def test_reconnect_failure_is_recorded_not_swallowed(self):
        broken = BrokenConn(ConnectionResetError('reset'))
        outcome, conn, used = cg.fetch_with_reconnect(
            broken, 7, lambda: (None, 'TimeoutError'),
        )
        self.assertEqual(outcome['body_status'], 'fetch_failed')
        self.assertEqual(outcome['body_error_class'], 'reconnect_failed:TimeoutError')
        self.assertIs(conn, broken)
        self.assertEqual(used, 1)

    def test_non_connection_error_is_not_retried(self):
        broken = BrokenConn(ValueError('bad'))
        calls = []
        outcome, conn, used = cg.fetch_with_reconnect(
            broken, 7, lambda: (calls.append(1), (FakeConn(), None))[1],
        )
        self.assertEqual(outcome['body_status'], 'fetch_failed')
        self.assertEqual(outcome['body_error_class'], 'ValueError')
        self.assertEqual(used, 0)
        self.assertEqual(calls, [])

    def test_reconnect_budget_exhausted_keeps_failure_isolated(self):
        broken = BrokenConn(ConnectionResetError('x'))
        outcome, conn, used = cg.fetch_with_reconnect(
            broken, 7, lambda: (FakeConn(), None), allow_reconnect=False,
        )
        self.assertEqual(outcome['body_error_class'], 'ConnectionResetError')
        self.assertEqual(used, 0)

    def test_non_ok_fetch_records_status_class_without_body(self):
        outcome = cg.fetch_body_summary(FakeConn(status='NO'), 1)
        self.assertEqual(outcome['body_status'], 'fetch_failed')
        self.assertEqual(outcome['body_error_class'], 'imap_no')
        self.assertNotIn('body', outcome)


if __name__ == '__main__':
    unittest.main(verbosity=2)
