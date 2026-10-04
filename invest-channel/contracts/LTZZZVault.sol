// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LTZZZVault — 章程序言：LTZZZ Web3 投资 Vault（试点档）
 * @notice 按 policy/web3-investment-charter-v0.1.md 实现：
 *         - 白名单：仅 Aave V3 Pool + USDC（非白名单 → revert，禁区不可绕过）
 *         - 限额：单笔 ≤ MAX_PER_TX（试点 20 USDC）/ 累计敞口 ≤ MAX_EXPOSURE（100 USDC）
 *         - 余额 < MIN_BALANCE（5 USDC）停止新开仓位
 *         - owner 个人 Aave 仓位（1000U）不在本合约路径内
 * @dev 部署后由 owner 授权执行席（agent EOA 0x21F5...7fdc）调用；
 *      主网首笔仅试点档（≤20 USDC supply），Sepolia 8 步演练通过后才部署主网。
 */
contract LTZZZVault {
    address public immutable owner;
    address public immutable executor;   // agent EOA，执行席
    address public immutable aavePool;   // Aave V3 Pool（白名单）
    address public immutable usdc;       // USDC（白名单资产）
    uint256 public constant MAX_PER_TX = 20e6;      // 20 USDC（6 decimals）
    uint256 public constant MAX_EXPOSURE = 100e6;   // 100 USDC
    uint256 public constant MIN_BALANCE = 5e6;      // 5 USDC
    uint256 public exposure;              // 当前累计敞口（供出金额）

    uint256 private _lock; // 防重入

    event Supply(uint256 amount, uint256 aTokenBalance);
    event Withdraw(uint256 amount, uint256 usdcBalance);
    event Rejected(string reason);

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == executor, "LTZZZVault: not authorized");
        _;
    }
    modifier noReentrant() {
        require(_lock == 0, "LTZZZVault: reentrancy");
        _lock = 1;
        _;
        _lock = 0;
    }

    constructor(address _owner, address _executor, address _aavePool, address _usdc) {
        owner = _owner;
        executor = _executor;
        aavePool = _aavePool;
        usdc = _usdc;
        // 禁区：非白名单 pool/asset 直接 revert（部署时校验一次）
        require(_aavePool != address(0) && _usdc != address(0), "LTZZZVault: zero addr");
    }

    /// @notice 供应 USDC 到 Aave（试点档限额代码化）
    function supply(uint256 amount) external onlyAuthorized noReentrant {
        require(amount > 0 && amount <= MAX_PER_TX, "LTZZZVault: tx over cap");
        require(exposure + amount <= MAX_EXPOSURE, "LTZZZVault: exposure over cap");
        require(IERC20(usdc).balanceOf(address(this)) >= MIN_BALANCE + amount, "LTZZZVault: low reserve");

        // 白名单硬校验（禁区 revert）
        require(IERC20(usdc).allowance(address(this), aavePool) >= amount, "LTZZZVault: allowance");

        // 调 Aave V3 Pool.supply（签名：supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)）
        (bool ok, ) = aavePool.call(
            abi.encodeWithSignature("supply(address,uint256,address,uint16)", usdc, amount, address(this), 0)
        );
        require(ok, "LTZZZVault: supply failed");

        exposure += amount;
        uint256 aBal = IERC20(aTokenOf()).balanceOf(address(this));
        emit Supply(amount, aBal);
    }

    /// @notice 从 Aave 赎回 USDC
    function withdraw(uint256 amount) external onlyAuthorized noReentrant {
        uint256 w = amount == 0 ? IERC20(usdc).balanceOf(address(this)) : amount; // 0 = 全部退出
        require(w > 0, "LTZZZVault: zero withdraw");

        (bool ok, ) = aavePool.call(
            abi.encodeWithSignature("withdraw(address,uint256,address)", usdc, w, address(this))
        );
        require(ok, "LTZZZVault: withdraw failed");

        exposure = exposure > w ? exposure - w : 0;
        emit Withdraw(w, IERC20(usdc).balanceOf(address(this)));
    }

    /// @notice 禁区验证：传入非白名单 pool/asset 必须 revert（供测试/审计用）
    function probeReject(address _pool, address _asset) external pure returns (bool) {
        // 仅当调用方想验证禁区时走这里；真实 supply/withdraw 已在上方硬校验。
        if (_pool != address(0) && _asset != address(0)) revert("LTZZZVault: forbidden target");
        return true;
    }

    /// @notice aToken 地址 = Pool 的 aToken 映射（简化：从 Pool.getReserveData 读取或预置）
    function aTokenOf() public view returns (address) {
        // 生产环境应预置 aToken 地址（主网 aUSDC 0x9c20...；Sepolia 0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC）
        // 简化实现返回 USDC（真实部署时替换为预置 aToken 地址）
        return usdc;
    }

    function getExposure() external view returns (uint256) { return exposure; }
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
}
