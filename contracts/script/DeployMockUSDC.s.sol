// script/DeployMockUSDC.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/mocks/MockUSDC.sol";

contract DeployMockUSDC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy only MockUSDC - no ETH funding needed!
        MockUSDC mockUSDC = new MockUSDC();
        
        console.log("MockUSDC deployed successfully!");
        console.log("Address:", address(mockUSDC));
        console.log("Faucet gives:", mockUSDC.FAUCET_AMOUNT() / 1e6, "mUSDC per call");
        
        vm.stopBroadcast();
        
        console.log("Add to .env.local:");
        console.log(string.concat("NEXT_PUBLIC_MOCK_USDC=", vm.toString(address(mockUSDC))));
    }
}