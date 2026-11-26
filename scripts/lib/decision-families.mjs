// 2026-11-20 owner 授权：GPT 决策席只保留五类事项。
// 这里只做文本分类，不改变资金、签名、钱包或凭据的实际执行能力；
// 命中五类只表示“应交给 GPT 决策席”，不等于已经获得任何执行授权。
export const RESERVED_FAMILIES = Object.freeze([
  {
    key: 'funds_and_financial_asset_disposition',
    label: '资金及资金处分',
    patterns: [
      /资金|付款|放款|转账|支付|收款|充值|提现|预算|余额|金额|经费|采购|financial|funds?|payment|payout|transfer|budget|balance|amount_usd|treasury/i,
    ],
  },
  {
    key: 'refund_finality',
    label: '退款终态',
    patterns: [
      /退款(?:终态|裁决|决定|结论|最终|金额|政策|流程)|refund[_ -]?(?:finality|decision|amount|policy)/i,
    ],
  },
  {
    key: 'signing_operations',
    label: '签名操作',
    patterns: [
      /\b(?:sign|signing|signature|signed|signer)\b|签名|签署|签字/i,
    ],
  },
  {
    key: 'private_keys_seed_phrases_root_keys',
    label: '私钥/助记词/根密钥',
    patterns: [
      /私钥|助记词|种子短语|根密钥|签名密钥|密钥对|private[_ -]?key|seed[_ -]?phrase|root[_ -]?key|mnemonic/i,
    ],
  },
  {
    key: 'wallet_operations_including_five_signature_wallet',
    label: '钱包操作（含五签）',
    patterns: [
      /钱包|五签|多签|wallet|multisig|gnosis|safe[_ -]?multisig|five[_ -]?signature/i,
    ],
  },
]);

// 返回命中的具体家族，便于日报与回执写清“为什么仍归 GPT”。
// 空文本返回 null；调用方需自行决定是否对“无说明”的保留状态 fail-closed。
export function classifyReservedFamily(text) {
  const haystack = String(text || '');
  if (!haystack.trim()) return null;
  for (const family of RESERVED_FAMILIES) {
    if (family.patterns.some((pattern) => pattern.test(haystack))) {
      return {key: family.key, label: family.label};
    }
  }
  return null;
}

export function isReservedDecision(text) {
  return classifyReservedFamily(text) !== null;
}
