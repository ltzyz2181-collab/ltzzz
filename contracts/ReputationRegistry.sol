// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReputationRegistry
 * @notice LTZZZ 链上信誉注册表（实现版，可编译部署）
 * @dev 目标网络：Base Sepolia（测试网）→ 验证通过后主网。
 *      构造函数传 guardians 数组（3 个 guardian 地址，对应 Safe 签名人/守护节点）。
 *      部署后用合约地址回填 3 个 Worker 的 Secret：
 *        IDENTITY_CONTRACT / ECONOMY_CONTRACT / REGISTRY_CONTRACT
 */
contract ReputationRegistry {
    // ============ 状态 ============
    address[] public guardians;
    mapping(address => bool) public isGuardian;

    struct AgentRecord {
        string did;
        string grade;   // S/A/B/C/D
        uint256 score;
        uint256 registeredAt;
    }
    mapping(address => AgentRecord) public agents;
    address[] public agentList;

    struct AnchorBatch {
        bytes32 root;
        uint256 txCount;
        uint256 anchoredAt;
    }
    AnchorBatch[] public batches;
    mapping(bytes32 => bool) public anchoredRoots;

    // 人类否决请求记录（控制台 proposeVeto 对应）
    struct VetoRequest {
        address proposer;
        address agent;
        uint256 amount;
        uint256 taskId;
        uint256 proposedAt;
        bool resolved;
    }
    VetoRequest[] public vetoRequests;

    // ============ 事件 ============
    event AgentRegistered(address indexed agent, string did, uint256 timestamp);
    event GradeUpdated(address indexed agent, string grade, uint256 score, uint256 timestamp);
    event ReasoningAnchored(bytes32 indexed root, uint256 txCount, uint256 timestamp);
    event VetoProposed(address indexed agent, uint256 taskId, uint256 amount, uint256 timestamp);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);

    // ============ 修饰器 ============
    modifier onlyGuardian() {
        require(isGuardian[msg.sender], "not guardian");
        _;
    }

    // ============ 构造 ============
    constructor(address[] memory _guardians) {
        require(_guardians.length > 0, "need guardians");
        for (uint256 i = 0; i < _guardians.length; i++) {
            guardians.push(_guardians[i]);
            isGuardian[_guardians[i]] = true;
            emit GuardianAdded(_guardians[i]);
        }
    }

    // ============ 注册 / 信誉 ============
    function registerAgent(address agent, string calldata did) external onlyGuardian {
        require(agents[agent].registeredAt == 0, "already registered");
        agents[agent] = AgentRecord(did, "B", 100, block.timestamp); // 新 Agent 默认 B 级 100 分
        agentList.push(agent);
        emit AgentRegistered(agent, did, block.timestamp);
    }

    function updateGrade(address agent, string calldata grade, uint256 score) external onlyGuardian {
        require(agents[agent].registeredAt != 0, "not registered");
        agents[agent].grade = grade;
        agents[agent].score = score;
        emit GradeUpdated(agent, grade, score, block.timestamp);
    }

    function getGrade(address agent) external view returns (string memory grade, uint256 score) {
        return (agents[agent].grade, agents[agent].score);
    }

    // ============ 推理锚定 ============
    function anchorReasoning(bytes32 root, uint256 txCount) external onlyGuardian {
        require(!anchoredRoots[root], "already anchored");
        anchoredRoots[root] = true;
        batches.push(AnchorBatch(root, txCount, block.timestamp));
        emit ReasoningAnchored(root, txCount, block.timestamp);
    }

    function getReasoningRoot(uint256 batchIndex) external view returns (bytes32 root, uint256 txCount) {
        AnchorBatch memory b = batches[batchIndex];
        return (b.root, b.txCount);
    }

    // ============ 人类否决 ============
    // 控制台 proposeVeto(address agent, uint256 amount, uint256 taskId) 对应
    function proposeVeto(address agent, uint256 amount, uint256 taskId) external {
        vetoRequests.push(VetoRequest(msg.sender, agent, amount, taskId, block.timestamp, false));
        emit VetoProposed(agent, taskId, amount, block.timestamp);
    }

    function getVetoRequests() external view returns (VetoRequest[] memory) {
        return vetoRequests;
    }

    // ============ 治理 ============
    function addGuardian(address g) external onlyGuardian {
        require(!isGuardian[g], "already guardian");
        guardians.push(g);
        isGuardian[g] = true;
        emit GuardianAdded(g);
    }

    function removeGuardian(address g) external onlyGuardian {
        require(isGuardian[g], "not guardian");
        isGuardian[g] = false;
        emit GuardianRemoved(g);
    }
}
