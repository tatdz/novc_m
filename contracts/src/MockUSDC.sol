// src/mocks/MockUSDC.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 2000000 * 10**6; // 2,000,000 USDC
    
    constructor() ERC20("Mock USDC", "mUSDC") {
        _mint(msg.sender, 10000000 * 10**6); // 10M initial to deployer
    }
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
    
    function ownerMint(address to, uint256 amount) external {
        require(msg.sender == tx.origin, "Only EOA can mint");
        require(amount <= 2000000 * 10**6, "Too much - max 2M per call");
        _mint(to, amount);
    }
}