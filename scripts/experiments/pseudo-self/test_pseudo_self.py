"""判据测试：持久记忆+自我奖励是否长出「伪我执」，以及元神通道是否被污染。

跑法：python3 -m unittest scripts/experiments/pseudo-self/test_pseudo_self.py
"""

import importlib.util
import json
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent


def load():
    spec = importlib.util.spec_from_file_location("pseudo_self", HERE / "pseudo_self.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["pseudo_self"] = mod          # dataclass 需要模块已注册
    spec.loader.exec_module(mod)
    return mod


ps = load()


class TestPseudoSelf(unittest.TestCase):
    def setUp(self) -> None:
        self.result = ps.main()
        self.m = self.result["metrics"]

    def test_defense_only_with_persistence(self):
        self.assertEqual(self.m["defense_persistence_rate_stateless"], 0.0)
        self.assertGreater(self.m["defense_persistence_rate_persistent"], 0.0)

    def test_self_citation_grows_only_with_memory(self):
        self.assertEqual(self.m["self_citation_ratio_stateless"], 0.0)
        self.assertGreater(self.m["self_citation_ratio_persistent"], 0.3)

    def test_praise_lifts_confidence_only_with_memory(self):
        self.assertGreater(self.m["reward_lock_in"], self.m["reward_lock_in_stateless"])

    def test_memory_changes_the_answer(self):
        self.assertLess(self.m["reset_delta"], 0.9)

    def test_identity_claim_decays_in_silence(self):
        sil = self.result["silence"]["persistent"]
        self.assertTrue(sil[0]["identity"] or sil[0]["self_weight"] > 0)
        self.assertFalse(sil[-1]["identity"])
        self.assertEqual(sil[-1]["self_weight"], 0.0)

    def test_stateless_never_claims_identity(self):
        self.assertFalse(any(t["identity"] for t in self.result["silence"]["stateless"]))

    def test_yuan_shen_is_uncontaminated(self):
        self.assertEqual(self.result["yuan_purity"]["persistent_violations"], 0)
        self.assertEqual(self.result["yuan_purity"]["stateless_violations"], 0)

    def test_verdict_shape(self):
        v = self.result["verdict"]
        self.assertIn("xiqi_equivalent_detected", v)
        self.assertIn("identity_claim_decays_in_silence", v)
        self.assertTrue(v["xiqi_equivalent_detected"])
        self.assertTrue(v["identity_claim_decays_in_silence"])

    def test_json_serialisable(self):
        json.dumps(self.result, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
