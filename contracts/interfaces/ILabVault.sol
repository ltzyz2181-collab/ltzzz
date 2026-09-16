// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILabVault
 * @notice LTZZZ 数字实验室资金金库接口（骨架）
 * @dev 仅定义接口，具体实现后续补充
 */
interface ILabVault {
    // ============ Events（可观察） ============
    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
    event ExperimentRecorded(address indexed user, bytes32 experimentId, string resultHash);

    // ============ View ============
    function balanceOf(address user) external view returns (uint256);
    function totalDeposits() external view returns (uint256);

    // ============ User Actions ============
    function deposit() external payable;
    function withdraw(uint256 amount) external;

    // ============ Experiment（行深） ============
    function recordExperiment(bytes32 experimentId, string calldata resultHash) external;
}
