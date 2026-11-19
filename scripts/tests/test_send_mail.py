#!/usr/bin/env python3
"""日报发信器的单元测试（不连真实 SMTP）。

覆盖边界：
- 缺授权码/收件人时 fail-closed，回执写 creds_missing 并以非 0 退出；
- AUTOLOOP_SEND_MAIL=false 时明确 skipped_by_switch，不假装已发送；
- dry-run 不建立任何 SMTP 连接；
- 成功路径只落主题/正文哈希、收件人域与哈希，不落授权码、完整地址或正文；
- meta 结构不对时拒绝发送。
"""
import json
import os
import re
import tempfile
import unittest
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODULE_PATH = os.path.join(ROOT, 'scripts', 'send-mail.py')

spec = importlib.util.spec_from_file_location('send_mail', MODULE_PATH)
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

AUTH_CODE = 'qq-auth-code-should-never-appear-0123456789'


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout=45):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.calls = []
        FakeSMTP.instances.append(self)

    def login(self, user, password):
        self.calls.append(('login', user, password))

    def send_message(self, message):
        self.calls.append(('send_message', message))
        return 250, b'OK queued as test'

    def quit(self):
        self.calls.append(('quit',))


class SendMailTest(unittest.TestCase):
    def setUp(self):
        FakeSMTP.instances = []
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.body = os.path.join(self.tmp.name, 'email.txt')
        with open(self.body, 'w', encoding='utf-8') as fh:
            fh.write('LTZZZ 日报\n一、今天完成了什么\n- DSA-1：ok\n')
        self.meta = os.path.join(self.tmp.name, 'email.meta.json')
        with open(self.meta, 'w', encoding='utf-8') as fh:
            json.dump({
                'schema': sm.META_SCHEMA,
                'date': '2026-11-19',
                'subject': '[LTZZZ日报] 2026-11-19 完成=1 待GPT裁决=0 阻塞=0',
                'body_file': self.body,
                'contains_mail_body': False,
            }, fh, ensure_ascii=False)
        self.receipt = os.path.join(self.tmp.name, 'receipt.json')

    def env(self, **overrides):
        base = {
            'MAIL_SMTP_HOST': 'smtp.qq.com',
            'MAIL_SMTP_PORT': '465',
            'MAIL_SMTP_USER': 'sender@qq.com',
            'MAIL_SMTP_AUTH_CODE': AUTH_CODE,
            'MAIL_FROM': 'sender@qq.com',
            'AUTOLOOP_MAIL_TO': 'owner@example.com,deputy@example.org',
            'AUTOLOOP_SEND_MAIL': 'true',
        }
        base.update(overrides)
        return base

    def read_receipt(self):
        with open(self.receipt, encoding='utf-8') as fh:
            return json.load(fh)

    def test_missing_auth_code_fails_closed(self):
        code, payload = sm.run(self.meta, receipt_path=self.receipt,
                               env=self.env(MAIL_SMTP_AUTH_CODE=''), smtp_factory=FakeSMTP)
        self.assertEqual(code, 3)
        self.assertEqual(payload['status'], 'creds_missing')
        self.assertIn('MAIL_SMTP_AUTH_CODE', payload['required_env'])
        self.assertEqual(FakeSMTP.instances, [])
        raw = open(self.receipt, encoding='utf-8').read()
        self.assertNotIn(AUTH_CODE, raw)
        self.assertNotIn('owner@example.com', raw)

    def test_switch_off_does_not_send(self):
        code, payload = sm.run(self.meta, receipt_path=self.receipt,
                               env=self.env(AUTOLOOP_SEND_MAIL='false'), smtp_factory=FakeSMTP)
        self.assertEqual(code, 0)
        self.assertEqual(payload['status'], 'skipped_by_switch')
        self.assertEqual(FakeSMTP.instances, [])

    def test_dry_run_never_connects(self):
        code, payload = sm.run(self.meta, receipt_path=self.receipt, dry_run=True,
                               env=self.env(), smtp_factory=FakeSMTP)
        self.assertEqual(code, 0)
        self.assertEqual(payload['status'], 'dry_run')
        self.assertEqual(FakeSMTP.instances, [])
        self.assertEqual(payload['body_bytes'], os.path.getsize(self.body))

    def test_sent_receipt_has_hashes_not_secrets(self):
        code, payload = sm.run(self.meta, receipt_path=self.receipt,
                               env=self.env(), smtp_factory=FakeSMTP)
        self.assertEqual(code, 0)
        self.assertEqual(payload['status'], 'sent')
        self.assertEqual(payload['smtp_code'], 250)
        self.assertEqual(payload['recipients_count'], 2)
        self.assertEqual(payload['recipient_domains'], ['example.com', 'example.org'])
        self.assertFalse(payload['secrets_included'])
        self.assertFalse(payload['body_persisted'])
        self.assertEqual(len(FakeSMTP.instances), 1)
        conn = FakeSMTP.instances[0]
        self.assertEqual(conn.port, 465)
        self.assertEqual(conn.timeout, 45)
        sent = [call[1] for call in conn.calls if call[0] == 'send_message'][0]
        self.assertIn('LTZZZ 日报', sent.get_content())
        self.assertIn('Message-ID', sent)
        raw = open(self.receipt, encoding='utf-8').read()
        for forbidden in (AUTH_CODE, 'owner@example.com', 'deputy@example.org', '一、今天完成了什么'):
            self.assertNotIn(forbidden, raw, '回执不得包含 ' + forbidden)

    def test_invalid_meta_schema_rejected(self):
        with open(self.meta, 'w', encoding='utf-8') as fh:
            json.dump({'schema': 'other', 'subject': 'x', 'body_file': self.body}, fh)
        code, payload = sm.run(self.meta, receipt_path=self.receipt,
                               env=self.env(), smtp_factory=FakeSMTP)
        self.assertEqual(code, 2)
        self.assertEqual(payload['status'], 'invalid_input')
        self.assertEqual(FakeSMTP.instances, [])

    def test_missing_body_file_rejected(self):
        code, payload = sm.run(self.meta, body_path=os.path.join(self.tmp.name, 'nope.txt'),
                               receipt_path=self.receipt, env=self.env(), smtp_factory=FakeSMTP)
        self.assertEqual(code, 2)
        self.assertEqual(payload['status'], 'invalid_input')
        self.assertEqual(FakeSMTP.instances, [])

    def test_smtp_failure_is_recorded_without_secret(self):
        class Boom(FakeSMTP):
            def send_message(self, message):
                raise OSError('connection reset by peer')

        code, payload = sm.run(self.meta, receipt_path=self.receipt,
                               env=self.env(), smtp_factory=Boom)
        self.assertEqual(code, 3)
        self.assertEqual(payload['status'], 'failed')
        self.assertEqual(payload['reason'], 'OSError')
        raw = open(self.receipt, encoding='utf-8').read()
        self.assertNotIn(AUTH_CODE, raw)


class SourceDisciplineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(MODULE_PATH, encoding='utf-8') as fh:
            cls.source = fh.read()

    def test_auth_code_never_printed_or_written(self):
        for line in self.source.splitlines():
            if 'AUTH_CODE' not in line:
                continue
            self.assertNotIn('print(', line, '授权码不得被打印')
            self.assertNotIn('json.dump', line, '授权码不得进入回执')
            self.assertNotIn('write(', line, '授权码不得被写出')

    def test_no_body_written_to_receipt(self):
        self.assertIn('body_persisted', self.source)
        self.assertNotRegex(self.source, r"payload\['body'\]")
        self.assertNotIn("'body': body", self.source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
