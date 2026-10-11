// script/SwapFinal.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import "forge-std/console.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

contract SwapFinal is Script {
    // Unichain Sepolia addresses
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address constant HOOK_ADDRESS = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
    
    // Token addresses
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address constant ETH = 0x0000000000000000000000000000000000000000;
    
    // Pool configuration
    uint24 constant LP_FEE = 3000;
    int24 constant TICK_SPACING = 60;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("========================================");
        console.log("Executing swap...");
        console.log("Deployer:", deployer);
        console.log("========================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Create PoolKey
        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(ETH),
            currency1: Currency.wrap(USDC),
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK_ADDRESS)
        });
        
        // Swap 0.00001 ETH for USDC
        uint256 amountIn = 0.00001 ether;
        
        // Create swap parameters using v4-periphery pattern
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE),
            uint8(Actions.TAKE)
        );

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            poolKey,
            true, // zeroForOne (ETH -> USDC)
            uint128(amountIn),
            uint128(0), // amountOutMinimum
            uint160(0), // sqrtPriceLimitX96
            new bytes(0) // hookData
        );
        params[1] = abi.encode(Currency.wrap(ETH), amountIn);
        params[2] = abi.encode(Currency.wrap(USDC), uint256(0));
        
        // Call Universal Router
        address UNIVERSAL_ROUTER = 0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D;
        
        (bool success, ) = UNIVERSAL_ROUTER.call{value: amountIn}(
            abi.encodeWithSignature(
                "execute(bytes,bytes[],uint256)",
                abi.encodePacked(uint8(0x10)), // V4_SWAP command
                params,
                block.timestamp + 3600
            )
        );
        
        require(success, "Swap failed");
        
        vm.stopBroadcast();
        
        console.log("Swap executed successfully!");
    }
}