// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IFundingToken {
    function balanceOf(address) external view returns (uint256);
    function allowance(address,address) external view returns (uint256);
    function transferFrom(address,address,uint256) external returns (bool);
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    function POOL() external view returns (address);
}
interface IFundingPool { function withdraw(address,uint256,address) external returns(uint256); }
/// Owner approves aUSDC once; an executor may only redeem to the immutable LTZZZ treasury.
/// No owner private key, arbitrary recipient, leverage, or strategy execution is permitted.
contract OwnerAaveFunding {
    uint256 public constant SINGLE_CAP = 100e6;
    uint256 public constant DAILY_CAP = 200e6;
    address public immutable owner;
    address public immutable treasury;
    address public immutable pool;
    address public immutable usdc;
    address public immutable aUsdc;
    address public executor;
    bool public paused = true;
    uint256 public grantRemaining;
    uint256 public principalOutstanding;
    uint256 public principalReturned;
    uint256 public lossesAccepted;
    mapping(uint256 => uint256) public dailyPulled;
    mapping(bytes32 => bool) public usedIntent;
    uint256 private lock = 1;
    event Funding(bytes32 indexed intent, uint256 amount, uint256 day);
    event PrincipalReturned(uint256 amount);
    event LossAccepted(uint256 amount);
    event Control(bool paused, address executor, uint256 grantRemaining);
    modifier onlyOwner(){ require(msg.sender == owner,"OWNER_ONLY"); _; }
    modifier nonReentrant(){ require(lock == 1,"REENTRANCY"); lock = 0; _; lock = 1; }
    constructor(address o,address t,address p,address u,address a,address e){
        require(block.chainid == 8453,"BASE_ONLY");
        require(o!=address(0)&&t!=address(0)&&e!=address(0)&&o!=t,"BAD_PARTIES");
        require(p.code.length>0&&u.code.length>0&&a.code.length>0,"NO_CONTRACT");
        require(IFundingToken(a).UNDERLYING_ASSET_ADDRESS()==u&&IFundingToken(a).POOL()==p,"BAD_RESERVE");
        owner=o; treasury=t; pool=p; usdc=u; aUsdc=a; executor=e;
    }
    /// Owner opens/revokes a bounded program; an allowance alone does not activate it.
    function configure(bool stop,address e,uint256 remaining) external onlyOwner {
        require(e!=address(0),"BAD_EXECUTOR"); paused=stop; executor=e; grantRemaining=remaining;
        emit Control(stop,e,remaining);
    }
    function pull(uint256 amount,bytes32 intent) external nonReentrant {
        require(msg.sender==executor,"EXECUTOR_ONLY"); require(!paused,"PAUSED");
        require(intent!=bytes32(0)&&!usedIntent[intent],"INTENT_USED");
        require(amount>0&&amount<=SINGLE_CAP,"SINGLE_CAP");
        uint256 day=block.timestamp/1 days;
        require(dailyPulled[day]+amount<=DAILY_CAP,"DAILY_CAP");
        require(amount<=grantRemaining,"GRANT_CAP");
        usedIntent[intent]=true; dailyPulled[day]+=amount; grantRemaining-=amount; principalOutstanding+=amount;
        uint256 beforeBalance=IFundingToken(usdc).balanceOf(treasury);
        require(IFundingToken(aUsdc).transferFrom(owner,address(this),amount),"ATOKEN_TRANSFER");
        require(IFundingPool(pool).withdraw(usdc,amount,treasury)==amount,"SHORT_WITHDRAW");
        require(IFundingToken(usdc).balanceOf(treasury)-beforeBalance==amount,"SHORT_RECEIPT");
        emit Funding(intent,amount,day);
    }
    /// Actual token movement, not an internal balance entry. Approve USDC from the returning wallet.
    function returnPrincipal(uint256 amount) external nonReentrant {
        require(amount>0&&amount<=principalOutstanding,"PRINCIPAL_CAP");
        principalOutstanding-=amount; principalReturned+=amount;
        require(IFundingToken(usdc).transferFrom(msg.sender,owner,amount),"RETURN_FAILED");
        emit PrincipalReturned(amount);
    }
    /// Owner alone may recognise a verified realised loss; never disguise it as repayment.
    function acceptLoss(uint256 amount) external onlyOwner {
        require(amount>0&&amount<=principalOutstanding,"LOSS_CAP");
        principalOutstanding-=amount; lossesAccepted+=amount; emit LossAccepted(amount);
    }
}
