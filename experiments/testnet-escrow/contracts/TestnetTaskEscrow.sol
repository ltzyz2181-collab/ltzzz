// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// Isolated pilot only. The chain transaction authenticates one fixed controller;
/// it does not prove AI identity, review acceptance or a commercial obligation.
/// First testnet beneficiary is the fixed funding account itself.
contract TestnetTaskEscrow is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    enum State { Unset, Funded, Released, Refunded }
    struct Escrow { bytes32 taskHash; uint128 amount; uint64 deadline; State state; bytes32 deliveryHash; }
    IERC20 public immutable token;
    address public immutable controller;
    address public immutable funder;
    uint256 public constant MAX_PER_ESCROW = 1_000_000; // 1 fake six-decimal token
    uint256 public constant MAX_TOTAL_OPEN = 3_000_000;
    uint256 public totalOpen;
    mapping(bytes32 => Escrow) public escrows;
    event Funded(bytes32 indexed id, bytes32 indexed taskHash, uint256 amount, uint64 deadline);
    event Released(bytes32 indexed id, bytes32 indexed deliveryHash, address beneficiary, uint256 amount);
    event Refunded(bytes32 indexed id, address funder, uint256 amount);
    error Invalid();
    error Unauthorized();
    modifier onlyController() { if(msg.sender != controller) revert Unauthorized(); _; }

    constructor(address token_, address controller_, address funder_) {
        if((block.chainid != 31337 && block.chainid != 84532) || token_.code.length == 0 ||
           controller_ == address(0) || funder_ == address(0) || IERC20Metadata(token_).decimals() != 6) revert Invalid();
        token = IERC20(token_); controller = controller_; funder = funder_;
    }
    function setPaused(bool value) external onlyController { if(value) _pause(); else _unpause(); }
    function create(bytes32 id, bytes32 taskHash, uint128 amount, uint64 deadline) external nonReentrant whenNotPaused {
        if(msg.sender != funder) revert Unauthorized();
        if(id == bytes32(0) || taskHash == bytes32(0) || escrows[id].state != State.Unset ||
           amount == 0 || amount > MAX_PER_ESCROW || totalOpen + amount > MAX_TOTAL_OPEN ||
           deadline <= block.timestamp || deadline > block.timestamp + 1 days) revert Invalid();
        escrows[id] = Escrow(taskHash, amount, deadline, State.Funded, bytes32(0));
        totalOpen += amount;
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(funder, address(this), amount);
        if(token.balanceOf(address(this)) != beforeBalance + amount) revert Invalid();
        emit Funded(id, taskHash, amount, deadline);
    }
    function release(bytes32 id, bytes32 deliveryHash) external onlyController nonReentrant whenNotPaused {
        Escrow storage e = escrows[id];
        if(e.state != State.Funded || block.timestamp >= e.deadline || deliveryHash == bytes32(0)) revert Invalid();
        e.state = State.Released; e.deliveryHash = deliveryHash; totalOpen -= e.amount;
        _payFunder(e.amount);
        emit Released(id, deliveryHash, funder, e.amount);
    }
    // Anyone may pay testnet gas to trigger an expired refund, even while paused.
    // They cannot choose the destination or release an unaccepted delivery.
    function refund(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if(e.state != State.Funded || block.timestamp < e.deadline) revert Invalid();
        e.state = State.Refunded; totalOpen -= e.amount;
        _payFunder(e.amount);
        emit Refunded(id, funder, e.amount);
    }
    function _payFunder(uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(funder);
        token.safeTransfer(funder, amount);
        if(token.balanceOf(funder) != beforeBalance + amount) revert Invalid();
    }
}
