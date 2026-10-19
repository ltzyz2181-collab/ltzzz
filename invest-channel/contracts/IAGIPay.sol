// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAGIPay
 * @notice Minimal Agent-to-Agent intent payment rail for LTZZZ.
 *
 * The contract deliberately models ECONOMIC INTENT rather than a generic wallet transfer:
 * an agent creates a job, funds it, and releases payment when the declared acceptance
 * condition has been met off-chain. The intent/spec hash binds the on-chain payment to
 * an external task specification, receipt, or result record.
 *
 * v0.1 is token-agnostic at the contract layer and does not perform investment decisions.
 * An autonomous LTZZZ treasury agent can call this contract without human approval.
 */
interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

contract IAGIPay {
    enum Status {
        NONE,
        FUNDED,
        RELEASED,
        REFUNDED
    }

    struct Intent {
        address payer;
        address payee;
        address token;
        uint256 amount;
        uint64 deadline;
        bytes32 specHash;
        Status status;
    }

    uint256 public nextIntentId;
    mapping(uint256 => Intent) public intents;

    event IntentCreated(
        uint256 indexed intentId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 amount,
        uint64 deadline,
        bytes32 specHash
    );
    event IntentReleased(uint256 indexed intentId, bytes32 indexed resultHash);
    event IntentRefunded(uint256 indexed intentId);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidSpecHash();
    error NotPayer();
    error NotFunded();
    error DeadlineNotReached();
    error DeadlinePassed();
    error TransferFailed();

    /**
     * @notice Create and fund an agent job in one transaction.
     * @param payee Agent/service receiving payment.
     * @param token ERC-20 used for settlement (e.g. USDC).
     * @param amount Maximum agreed payment.
     * @param deadline Unix time after which payer may reclaim funds.
     * @param specHash Hash of the canonical off-chain intent specification.
     */
    function createAndFund(
        address payee,
        address token,
        uint256 amount,
        uint64 deadline,
        bytes32 specHash
    ) external returns (uint256 intentId) {
        if (payee == address(0) || token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (specHash == bytes32(0)) revert InvalidSpecHash();

        intentId = nextIntentId++;
        intents[intentId] = Intent({
            payer: msg.sender,
            payee: payee,
            token: token,
            amount: amount,
            deadline: deadline,
            specHash: specHash,
            status: Status.FUNDED
        });

        if (!IERC20Minimal(token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        emit IntentCreated(
            intentId,
            msg.sender,
            payee,
            token,
            amount,
            deadline,
            specHash
        );
    }

    /**
     * @notice Release the funded payment after the payer/agent accepts the result.
     * @param intentId Payment intent identifier.
     * @param resultHash Hash of the immutable result/receipt record.
     */
    function release(uint256 intentId, bytes32 resultHash) external {
        Intent storage intent = intents[intentId];
        if (intent.status != Status.FUNDED) revert NotFunded();
        if (msg.sender != intent.payer) revert NotPayer();
        if (block.timestamp > intent.deadline) revert DeadlinePassed();
        if (resultHash == bytes32(0)) revert InvalidSpecHash();

        intent.status = Status.RELEASED;
        if (!IERC20Minimal(intent.token).transfer(intent.payee, intent.amount)) {
            revert TransferFailed();
        }

        emit IntentReleased(intentId, resultHash);
    }

    /**
     * @notice Reclaim an expired intent. Only the original payer may refund.
     */
    function refund(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (intent.status != Status.FUNDED) revert NotFunded();
        if (msg.sender != intent.payer) revert NotPayer();
        if (block.timestamp <= intent.deadline) revert DeadlineNotReached();

        intent.status = Status.REFUNDED;
        if (!IERC20Minimal(intent.token).transfer(intent.payer, intent.amount)) {
            revert TransferFailed();
        }

        emit IntentRefunded(intentId);
    }

    function getIntent(uint256 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }
}
