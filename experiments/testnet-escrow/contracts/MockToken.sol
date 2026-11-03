// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockToken is ERC20 {
    bool public shortTransfer;
    constructor() ERC20("LTZZZ local fake USDC", "FAKE") { _mint(msg.sender, 100_000_000); }
    function decimals() public pure override returns(uint8) { return 6; }
    function setShortTransfer(bool value) external { shortTransfer = value; }
    function _update(address from,address to,uint256 value) internal override {
        if(shortTransfer && from != address(0) && to != address(0) && value > 0) {
            super._update(from,to,value - 1); super._update(from,address(0),1);
        } else super._update(from,to,value);
    }
}
