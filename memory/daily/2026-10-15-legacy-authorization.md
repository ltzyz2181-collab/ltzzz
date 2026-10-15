# 旧Vault权限观测 · 2026-10-15

旧Vault在区块52640777的两条RPC读数一致：USDC、aUSDC和exposure均为0，但guardian仍为旧Agent地址；权限撤销和私钥泄露均未得到本次核验证明，新增资金保持禁用。

证据：knowledge/results/security/legacy-vault-38742938089-attempt-1.json。运行38742938089成功，模型调用0、交易0；两次eth_call均为contract_reverted，这也可能由余额或其他前置条件造成，不能推导授权已移除。源码与链上字节码等价尚未验证。
