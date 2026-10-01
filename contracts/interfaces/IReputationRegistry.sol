// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReputationRegistry
 * @notice LTZZZ 链上信誉注册表（骨架，未部署）
 * @dev 目标网络：Base。为每个 AI Agent（EOA/DID）登记信誉等级与推理锚定根。
 *      与 agent-wallet/identity-registry.json 双向同步；部署前需审计。
 */
interface ReputationRegistry {
    // ============ Events（可观察） ============
    event AgentRegistered(address indexed agent, string did, uint256 timestamp);
    event GradeUpdated(address indexed agent, string grade, uint256 score, uint256 timestamp);
    event ReasoningAnchored(bytes32 indexed root, uint256 txCount, uint256 timestamp);

    // ============ View ============
    function getGrade(address agent) external view returns (string memory grade, uint256 score);
    function getReasoningRoot(uint256 batchIndex) external view returns (bytes32 root, uint256 txCount);

    // ============ Owner / Registry ============
    function registerAgent(address agent, string calldata did) external;
    function updateGrade(address agent, string calldata grade, uint256 score) external;
    function anchorReasoning(bytes32 root, uint256 txCount) external;

    // ============ 治理 ============
    // 人类否决权：Safe 多签为一键冻结与一票否决的终极安全网（不在此合约内，由 Safe 控制资金）
}
