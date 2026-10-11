// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PoolSwapTest} from "lib/v4-core/src/test/PoolSwapTest.sol";
import {IPoolManager} from "lib/v4-core/src/interfaces/IPoolManager.sol";

contract DeployPoolSwapTest is Script {
    // The canonical Monad Testnet PoolManager address
    address constant POOL_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;

    function run() external returns (PoolSwapTest poolSwapTest) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        poolSwapTest = new PoolSwapTest(IPoolManager(POOL_MANAGER));

        vm.stopBroadcast();
    }
}
