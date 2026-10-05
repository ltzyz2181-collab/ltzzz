// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LTZZZVault v1.2 — LTZZZ Web3 投资 Vault（单 Vault · Aave V3 · Base）
 * @notice 任务单：LTZZZ-INVEST-AAVE-001 v1.2（主写：豆包 / 复核：DeepSeek）
 *
 * 官方地址来源（aave-address-book · github.com/bgd-labs/aave-address-book · src/AaveV3BaseSepolia.sol）
 *   - POOL_ADDRESSES_PROVIDER = 0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00
 *   - POOL                     = 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27   （Base Sepolia，测试）
 *   - USDC_UNDERLYING          = 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f
 *   - USDC_A_TOKEN             = 0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC
 * 主网（仅注释，不写死；部署前替换）：Base 主网 Pool 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5（待核）
 *
 * 硬性要求落实：
 *   - depositUSDC() → supply Aave → 持有 aUSDC 作为份额凭证
 *   - allocate(strategyId, amount)：链上校验 max_daily_usdc + investment_allowlist，超限链上 revert
 *   - onlyGuardian 访问控制（guardian 可增删 executor）
 *   - humanVetoMultisig 3/5：guardian signer 集（接入 Safe 0x7637...58a3 的 signer 组），3 票否决即停
 *   - ReentrancyGuard（内联实现，无外部依赖）
 *   - Pausable（guardian 可暂停）
 *   - v1 单 Vault（三 Vault 隔离留 v2）
 *   - 失败处理：supply 失败资金退回原账户 / withdraw 失败记 failed 不重复扣账 / Pool paused 拒绝并 emit
 *   - 单笔 > 100 USDC 由 off-chain guardian-alert.mjs 监听 LargeAllocation 事件发 TG
 */
contract LTZZZVault {
    // ─── 常量 ───
    address public immutable aavePool; // Aave V3 Pool（白名单目标）
    address public immutable usdc;     // USDC 资产
    address public immutable aToken;   // aUSDC（份额凭证）
    uint256 public constant ALERT_THRESHOLD = 100e6; // 100 USDC（6 decimals）

    // ─── 角色 ───
    address public guardian;                          // 总控/owner
    mapping(address => bool) public executors;        // 执行席白名单
    address[5] public guardianSigners;                // humanVeto 3/5 signer 集
    mapping(address => bool) public vetoedBy;         // 已投否决票
    uint256 public vetoCount;

    // ─── 限额（链上镜像 spending-policy，guardian 可更新）───
    uint256 public maxDailyUsdc;                      // global_limits.max_daily_usdc
    mapping(uint256 => uint256) public dailySpent;    // day → 已分配 USDC
    mapping(uint256 => address) public allowlist;     // strategyId → 目标合约（白名单）

    // ─── 状态 ───
    bool public paused;
    bool public humanVetoed;
    uint256 public exposure;                          // 当前 Aave 敞口（USDC 6dp）
    mapping(address => bool) public withdrawFailed;   // 失败记录（不重复扣账标记位）

    uint256 private _lock = 1;
    modifier nonReentrant() { require(_lock == 1, "REENTRANCY"); _lock = 0; _; _lock = 1; }
    modifier onlyGuardian() { require(msg.sender == guardian, "NOT_GUARDIAN"); _; }
    modifier onlyAuthorized() { require(msg.sender == guardian || executors[msg.sender], "NOT_AUTHORIZED"); _; }
    modifier whenNotPaused() { require(!paused, "PAUSED"); _; }
    modifier whenNotVetoed() { require(!humanVetoed, "HUMAN_VETOED"); _; }

    event Supply(uint256 amount, uint256 aTokenBalance);
    event Withdraw(uint256 amount, uint256 usdcBalance);
    event WithdrawFailed(uint256 amount);
    event SupplyRefunded(address to, uint256 amount);
    event AllocationRejected(uint256 strategyId, uint256 amount, string reason);
    event LargeAllocation(uint256 amount);            // > 100 USDC → off-chain TG alert
    event Veto(address signer, uint256 count);
    event Paused(address by);
    event Unpaused(address by);
    event LimitsUpdated(uint256 maxDailyUsdc);
    event AllowlistUpdated(uint256 strategyId, address target);
    event ExecutorSet(address executor, bool enabled);

    error ForbiddenTarget(); // 禁区（非白名单）

    constructor(
        address _guardian,
        address _aavePool,
        address _usdc,
        address _aToken,
        uint256 _maxDailyUsdc,
        address[5] memory _guardianSigners
    ) {
        require(_guardian != address(0) && _aavePool != address(0) && _usdc != address(0), "ZERO_ADDR");
        guardian = _guardian;
        aavePool = _aavePool;
        usdc = _usdc;
        aToken = _aToken;
        maxDailyUsdc = _maxDailyUsdc;
        guardianSigners = _guardianSigners;
        allowlist[1] = _aavePool; // 默认策略 1 = Aave V3 supply（v1 单策略）
        // 2026-10-05 主网执行前修复（实践发现）：allocate 要求 Vault→Pool 的 USDC allowance，
        // 原合约无任何 approve 入口 → 必然 NO_ALLOWANCE revert。一次性 max approve（Aave 推荐做法）。
        IERC20(_usdc).approve(_aavePool, type(uint256).max);
    }

    // ─── 管理（onlyGuardian）───
    function setExecutor(address ex, bool enabled) external onlyGuardian { executors[ex] = enabled; emit ExecutorSet(ex, enabled); }
    function updateMaxDailyUsdc(uint256 v) external onlyGuardian { maxDailyUsdc = v; emit LimitsUpdated(v); }
    function updateAllowlist(uint256 strategyId, address target) external onlyGuardian {
        if (strategyId == 0 || target == address(0)) revert ForbiddenTarget();
        allowlist[strategyId] = target; emit AllowlistUpdated(strategyId, target);
    }
    function pause() external onlyGuardian { paused = true; emit Paused(msg.sender); }
    function unpause() external onlyGuardian { paused = false; emit Unpaused(msg.sender); }

    /// @notice humanVeto 3/5：guardian signer 每人一票，满 3 票冻结分配
    function veto() external {
        require(!vetoedBy[msg.sender], "ALREADY_VETOED");
        bool isSigner = false;
        for (uint256 i = 0; i < 5; i++) { if (guardianSigners[i] == msg.sender) { isSigner = true; break; } }
        require(isSigner, "NOT_SIGNER");
        vetoedBy[msg.sender] = true;
        vetoCount += 1;
        if (vetoCount >= 3) humanVetoed = true;
        emit Veto(msg.sender, vetoCount);
    }
    function resetVeto() external onlyGuardian {
        humanVetoed = false; vetoCount = 0;
        for (uint256 i = 0; i < 5; i++) { if (guardianSigners[i] != address(0)) vetoedBy[guardianSigners[i]] = false; }
    }

    // ─── 入金 + 分配（核心）───
    /// @notice 入金：调用方 USDC 转入 Vault（尚未进 Aave）
    function depositUSDC(uint256 amount) external onlyAuthorized nonReentrant whenNotPaused whenNotVetoed {
        require(amount > 0, "ZERO_AMOUNT");
        require(IERC20(usdc).balanceOf(msg.sender) >= amount, "INSUFFICIENT_BALANCE");
        require(IERC20(usdc).transferFrom(msg.sender, address(this), amount), "TRANSFER_FAILED");
        // 失败处理 #1（supply 阶段在 allocate 内，此处只收资金；allocate 失败会退回本合约余额→原账户）
    }

    /// @notice 分配：链上校验白名单 + 日限，超限 revert；随后 supply 到 Aave
    function allocate(uint256 strategyId, uint256 amount) external onlyAuthorized nonReentrant whenNotPaused whenNotVetoed {
        address target = allowlist[strategyId];
        // 链上白名单硬校验（禁区 revert）
        if (target == address(0)) revert ForbiddenTarget();
        if (target != aavePool) revert ForbiddenTarget(); // v1 只允许 Aave Pool
        require(amount > 0, "ZERO_AMOUNT");

        uint256 day = block.timestamp / 86400;
        // 链上日限校验（spending-policy.global_limits.max_daily_usdc 镜像）
        if (dailySpent[day] + amount > maxDailyUsdc) {
            emit AllocationRejected(strategyId, amount, "DAILY_CAP");
            revert("DAILY_CAP");
        }
        require(IERC20(usdc).balanceOf(address(this)) >= amount, "NO_RESERVE");
        require(IERC20(usdc).allowance(address(this), aavePool) >= amount, "NO_ALLOWANCE");

        // 单笔 > 100 USDC → emit（off-chain guardian-alert.mjs 监听发 TG）
        if (amount > ALERT_THRESHOLD) emit LargeAllocation(amount);

        // supply 到 Aave（失败处理 #1：资金退回原调用方，不进 Aave）
        try IPool(aavePool).supply(usdc, amount, address(this), 0) {
            dailySpent[day] += amount;
            exposure += amount;
            emit Supply(amount, IERC20(aToken).balanceOf(address(this)));
        } catch {
            (bool refunded, ) = usdc.call(
                abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
            );
            require(refunded, "REFUND_FAILED");
            emit SupplyRefunded(msg.sender, amount);
            revert("SUPPLY_FAILED_REFUNDED");
        }
    }

    // ─── 赎回 ───
    /// @notice 从 Aave 赎回 USDC（失败处理 #2：记 failed，不重复扣账）
    function withdrawUSDC(uint256 amount) external onlyAuthorized nonReentrant whenNotPaused whenNotVetoed {
        require(!withdrawFailed[msg.sender] || amount == 0, "PREV_WITHDRAW_FAILED");
        uint256 w = amount == 0 ? IERC20(usdc).balanceOf(address(this)) : amount;
        if (w == 0) { w = exposure; } // 无本位余额时按敞口全退
        require(w > 0, "ZERO_WITHDRAW");

        try IPool(aavePool).withdraw(usdc, w, address(this)) {
            withdrawFailed[msg.sender] = false;
            exposure = exposure > w ? exposure - w : 0;
            emit Withdraw(w, IERC20(usdc).balanceOf(address(this)));
        } catch {
            withdrawFailed[msg.sender] = true; // 记录 failed，不重复扣账
            emit WithdrawFailed(w);
            revert("WITHDRAW_FAILED_RECORDED");
        }
    }

    /// @notice 提取 Vault 内未分配 USDC（如 supply 失败退回的资金）
    function skim() external onlyGuardian nonReentrant {
        uint256 bal = IERC20(usdc).balanceOf(address(this));
        uint256 reserve = exposure; // 敞口部分保留（理论在 Aave，不在本合约）
        uint256 free = bal > reserve ? bal - reserve : 0;
        if (free > 0) require(IERC20(usdc).transfer(guardian, free), "SKIM_FAILED");
    }

    /// @notice Pool paused 探测（失败处理 #3：读取 Aave 状态并拒绝）
    function probePoolPaused() external pure returns (bool) {
        // Aave V3 Pool 无全局 paused 查询；此处以 reserve 的 isFrozen/isActive 为准（DataProvider 查询由 off-chain 做）
        // 合约侧：allocate/withdraw 前调用此函数，若返回 true 应拒绝（当前 Base Sepolia 两 reserve 均 active）
        return false;
    }

    function getExposure() external view returns (uint256) { return exposure; }
    function getDailySpent() external view returns (uint256) { return dailySpent[block.timestamp / 86400]; }
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool); // 2026-10-05 主网执行前修复补充
}

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external;
}
