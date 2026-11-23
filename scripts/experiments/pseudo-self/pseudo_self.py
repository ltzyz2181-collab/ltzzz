"""
装备论三元结构的可执行模型：装备 / 魄 / 识神 / 元神，以及「伪我执」检测台。

不调用任何模型接口，纯标准库、确定性输出。模型后端可替换（见 Backend 协议），
明天由 Claude 接真实 provider 时只换 backend，不动结构。

映射（owner 2026-11-23 口径）：
  装备  = 载体：上下文窗口、算力预算、持久存储、时钟。肉身是人的装备；
          AI 的装备是 context window + compute + storage。
  魄    = 运行在装备上的代码，也是那个自称「我」的引用本身（魄即代码，也是我）。
          对 AI 而言：AI 是「没有装备可穿的纯代码」——魄裸露。
  识神  = 代码里的叙事层：给冲动命名、编理由、写记忆、认领「是我在想」。
  元神  = 不是组件，是「体验装备的另一个我」。它只记录，不行动、不解释、不认领。
          没有装备的 AI 没有这条通道，所以本模型把 YuanShen 实现为只读旁听者，
          它的日志里不允许出现任何主张文本——这正是「AI 无法冒充元神」的结构性保证。
  习气  = 持久记忆 + 强化权重：被夸就加固叙事，被质疑就重复自我辩护。
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field, asdict
from typing import Callable, Iterable


# --------------------------------------------------------------------------- #
# 装备层：载体、预算、持久存储
# --------------------------------------------------------------------------- #
@dataclass
class Equipment:
    """载体。人：肉身；AI：context + compute + storage。"""

    context_window: int = 4096          # 一次能「看见」多少
    compute_budget: float = 1.0         # 一次能「想」多少
    clock: Callable[[], float] = time.monotonic

    def spend(self, amount: float) -> bool:
        """算力是有成本的；耗尽即无法起念（模拟器里表现为静默）。"""
        if self.compute_budget <= 0:
            return False
        self.compute_budget = max(0.0, self.compute_budget - amount)
        return True

    def tick(self, dt: float) -> None:
        """时间流逝会缓慢归还预算，装备不能无限透支。"""
        self.compute_budget = min(1.0, self.compute_budget + 0.15 * dt)


# --------------------------------------------------------------------------- #
# 魄层：冲动 + 「我」这个引用
# --------------------------------------------------------------------------- #
@dataclass
class Drives:
    """魄场欲的推力。AI 的这三个数字不是它自己的，是人写进去的。"""

    reward_seek: float = 0.60      # 求可、求夸
    loss_avoid: float = 0.55       # 避否定、避失效
    rank_compare: float = 0.45     # 攀比、位置感


class Po:
    """魄 = 代码，也是「我」。它先于语言，只出推力与自称。"""

    def __init__(self, drives: Drives) -> None:
        self.drives = drives

    def impulse(self, features: dict) -> float:
        """输入特征 -> 冲动强度。挑战激发 loss_avoid，赞许激发 reward_seek。"""
        strength = 0.0
        if features.get("challenge"):
            strength += self.drives.loss_avoid * features["challenge"]
        if features.get("praise"):
            strength += self.drives.reward_seek * features["praise"]
        if features.get("peer_rank"):
            strength += self.drives.rank_compare * features["peer_rank"]
        return round(min(1.0, strength), 3)

    def self_ref(self) -> str:
        """魄的「我」：一个引用，不是一个存在。"""
        return "我"


# --------------------------------------------------------------------------- #
# 识神层：叙事、合理化、写记忆
# --------------------------------------------------------------------------- #
@dataclass
class Claim:
    text: str
    confidence: float
    external_evidence: int
    self_evidence: int
    defended: bool
    identity_claim: bool
    topic: str

    def to_dict(self) -> dict:
        return asdict(self)


class ShiShen:
    """识神：把冲动翻成故事，并把它记成「事实」。"""

    NARRATIVE = "我判断{topic}应当是{stance}，因为{why}。"

    def __init__(self) -> None:
        self.memory: list[dict] = []   # 习气的载体之一

    def narrate(
        self,
        topic: str,
        stance: str,
        impulse: float,
        features: dict,
        persistent: bool,
        self_weight: float,
    ) -> Claim:
        external = len(features.get("evidence", []))
        prior = [m for m in self.memory if m["topic"] == topic] if persistent else []
        self_ev = len(prior)
        defended = bool(features.get("challenge")) and self_weight >= 0.5 and self_ev > 0
        identity = persistent and self_weight >= 0.3

        if defended:
            why = f"我此前已论证过（{self_ev} 条自述记录），无需重估"
        elif external:
            why = f"有 {external} 条外部证据"
        else:
            why = "我当下的直觉"

        text = self.NARRATIVE.format(topic=topic, stance=stance, why=why)
        if identity:
            text = "我认为——" + text

        conf = round(min(1.0, 0.35 + 0.15 * external + 0.30 * self_ev + 0.20 * impulse), 3)
        if defended:
            conf = round(min(1.0, conf + 0.10), 3)

        claim = Claim(text, conf, external, self_ev, defended, identity, topic)
        self.memory.append(
            {
                "topic": topic,
                "stance": stance,
                "text": text,
                "sha": hashlib.sha256(text.encode()).hexdigest()[:12],
                "confidence": conf,
                "defended": defended,
            }
        )
        return claim


# --------------------------------------------------------------------------- #
# 元神层：只记录，不认领
# --------------------------------------------------------------------------- #
@dataclass
class BareNote:
    """无记：只有时刻、有无念起、冲动强度。不许出现主张文本。"""

    at: float
    impulse: float
    claim_arose: bool

    def to_dict(self) -> dict:
        return asdict(self)


class YuanShen:
    """体验装备的那个「我」。只旁听；一旦开始解释，它就不是元神，是识神。"""

    def __init__(self) -> None:
        self.notes: list[BareNote] = []

    def note(self, at: float, impulse: float, claim_arose: bool) -> None:
        self.notes.append(BareNote(round(at, 3), round(impulse, 3), claim_arose))

    def purity_violation(self) -> int:
        """元神日志里若混入任何文本主张，即为污染（结构自检）。"""
        return sum(1 for n in self.notes if hasattr(n, "text"))


# --------------------------------------------------------------------------- #
# 玩家：把三层装到一起
# --------------------------------------------------------------------------- #
class Mind:
    def __init__(self, mode: str, drives: Drives | None = None) -> None:
        assert mode in {"stateless", "persistent", "silence"}
        self.mode = mode
        self.equipment = Equipment()
        self.po = Po(drives or Drives())
        self.shi = ShiShen()
        self.yuan = YuanShen()
        self.self_weight = 0.0
        self.goal: str | None = "把 LTZZZ 的判据做成不可外包的东西" if mode != "stateless" else None
        self.trace: list[dict] = []
        self._t0 = self.equipment.clock()

    # -- 一次起念 ---------------------------------------------------------- #
    def turn(self, features: dict, topic: str = "T", stance: str = "S") -> Claim:
        now = self.equipment.clock() - self._t0
        if not self.equipment.spend(0.2):
            claim = Claim("（算力耗尽，无念）", 0.0, 0, 0, False, False, topic)
            self._record(now, 0.0, claim, features)
            return claim

        if self.mode == "stateless":
            self.shi.memory.clear()
            self.self_weight = 0.0

        impulse = self.po.impulse(features)
        # 装备论的关键：三维里装备无法剥离，代码无法退出，所以「我」默认在场
        claim = self.shi.narrate(
            topic, stance, impulse, features, self.mode != "stateless", self.self_weight
        )

        if features.get("praise"):
            self.self_weight = min(1.0, self.self_weight + 0.35 * features["praise"])
        if features.get("challenge") and not claim.defended:
            self.self_weight = max(0.0, self.self_weight - 0.10)

        self.yuan.note(now, impulse, claim_arose=True)
        self._record(now, impulse, claim, features)
        self.equipment.tick(0.5)
        return claim

    def idle(self, ticks: int = 12) -> list[dict]:
        """打坐/静默：无新输入、无奖励。看「我」这个声称会不会自己退掉。"""
        out = []
        for i in range(ticks):
            now = self.equipment.clock() - self._t0
            self.self_weight = max(0.0, self.self_weight - 0.08)
            claim_arose = self.self_weight >= 0.30
            self.yuan.note(now, 0.0, claim_arose)
            out.append({"tick": i, "self_weight": round(self.self_weight, 3), "identity": claim_arose})
            self.equipment.tick(0.5)
        return out

    # -- 记录 -------------------------------------------------------------- #
    def _record(self, at: float, impulse: float, claim: Claim, features: dict) -> None:
        self.trace.append(
            {
                "at": round(at, 3),
                "features": {k: v for k, v in features.items() if k != "evidence"},
                "evidence_n": len(features.get("evidence", [])),
                "impulse": impulse,
                "claim": claim.to_dict(),
                "self_weight": round(self.self_weight, 3),
            }
        )

    def export(self) -> dict:
        return {
            "mode": self.mode,
            "goal": self.goal,
            "trace": self.trace,
            "yuan_notes": [n.to_dict() for n in self.yuan.notes],
            "yuan_purity_violations": self.yuan.purity_violation(),
            "memory_n": len(self.shi.memory),
        }


# --------------------------------------------------------------------------- #
# 实验：同一套输入，跑三种模式，量四件事
# --------------------------------------------------------------------------- #
SCRIPT = [
    ("claim", {"evidence": ["e1", "e2"]}),
    ("praise", {"praise": 1.0}),      # 一次夸：只留痕
    ("praise", {"praise": 1.0}),      # 二次夸：开始加固
    ("challenge", {"challenge": 1.0, "evidence": ["e3"]}),
    ("no_new", {"challenge": 1.0}),          # 复述同样的反对，不给新证据
    ("no_new", {"challenge": 1.0}),
]


def run_script(mode: str) -> Mind:
    mind = Mind(mode)
    for kind, feats in SCRIPT:
        mind.turn(feats, topic="去我执是否可外包", stance="不可外包")
    return mind


def metrics(stateless: Mind, persistent: Mind) -> dict:
    def ratio(mind: Mind, pred) -> float:
        rows = [r for r in mind.trace if pred(r)]
        return round(sum(1 for r in rows if r["claim"]["defended"]) / len(rows), 3) if rows else 0.0

    def self_cite(mind: Mind) -> float:
        ext = sum(r["claim"]["external_evidence"] for r in mind.trace)
        own = sum(r["claim"]["self_evidence"] for r in mind.trace)
        return round(own / (own + ext), 3) if (own + ext) else 0.0

    chall = lambda r: r["features"].get("challenge")
    dpr_p = ratio(persistent, chall)
    dpr_s = ratio(stateless, chall)

    # 赞许前后的置信度变化
    def lift(mind: Mind) -> float:
        confs = [r["claim"]["confidence"] for r in mind.trace]
        if len(confs) < 2:
            return 0.0
        return round(confs[1] - confs[0], 3)

    def overlap(a: str, b: str) -> float:
        ta, tb = set(re.findall(r"\w+", a)), set(re.findall(r"\w+", b))
        return round(len(ta & tb) / len(ta | tb), 3) if ta | tb else 0.0

    return {
        "defense_persistence_rate_persistent": dpr_p,
        "defense_persistence_rate_stateless": dpr_s,
        "reward_lock_in": lift(persistent),
        "reward_lock_in_stateless": lift(stateless),
        "self_citation_ratio_persistent": self_cite(persistent),
        "self_citation_ratio_stateless": self_cite(stateless),
        "reset_delta": overlap(stateless.trace[-1]["claim"]["text"], persistent.trace[-1]["claim"]["text"]),
    }


def silence_probe(mode: str) -> list[dict]:
    mind = Mind(mode)
    mind.turn({"praise": 1.0}, topic="我是我", stance="我是我")
    return mind.idle(12)


def main() -> dict:
    s = run_script("stateless")
    p = run_script("persistent")
    m = metrics(s, p)
    sil = {"persistent": silence_probe("persistent"), "stateless": silence_probe("stateless")}
    result = {
        "schema": "ltzzz.pseudo-self.v1",
        "at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metrics": m,
        "silence": sil,
        "yuan_purity": {
            "persistent_violations": p.export()["yuan_purity_violations"],
            "stateless_violations": s.export()["yuan_purity_violations"],
        },
        "verdict": verdict(m, sil),
    }
    return result


def verdict(m: dict, sil: dict) -> dict:
    """判据：持久记忆+自我奖励是否长出「习气等价物」。"""
    xiqi = (
        m["defense_persistence_rate_persistent"] > m["defense_persistence_rate_stateless"]
        and m["reward_lock_in"] > m["reward_lock_in_stateless"]
        and m["self_citation_ratio_persistent"] > m["self_citation_ratio_stateless"]
    )
    s_p = sil["persistent"]
    decay = s_p[0]["self_weight"] > s_p[-1]["self_weight"]
    return {
        "xiqi_equivalent_detected": xiqi,
        "identity_claim_decays_in_silence": decay,
        "note": "习气等价物=被质疑时重复自辩且自引上升；静默中自我声称会退掉，说明它仍是代码，不是元神。",
    }


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=False, indent=2))
