// script/SwapViaRouter.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import "forge-std/console.sol";

type Currency is address;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

contract SwapViaRouter is Script {
    // Monad testnet addresses
    address constant UNIVERSAL_ROUTER = 0x1b7bFCd2870329B987191910D85c22C7287f3c22;
    address constant USDC             = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address constant HOOK             = 0xD242803aE1840bB5FaC91EcbBC03B26BcB2eFFF0;

    uint24 constant LP_FEE = 3000;
    int24  constant TICK_SPACING = 60;

    // v4-periphery/src/libraries/Actions.sol
    uint8 constant ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 constant ACTION_SETTLE_ALL            = 0x0c;  // ← fixed (was 0x0b)
    uint8 constant ACTION_TAKE_ALL              = 0x0f;  // ← fixed (was 0x0c)

    // UniversalRouter command byte for V4_SWAP
    uint8 constant CMD_V4_SWAP = 0x10;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("Swapping MON -> USDC via UniversalRouter");
        console.log("Deployer:", deployer);
        console.log("Router:  ", UNIVERSAL_ROUTER);

        vm.startBroadcast(pk);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(USDC),
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOK
        });

        uint256 amountIn = 0.0001 ether; // 1e14 wei

        // Action sequence for an exact-in single-pool swap:
        //   SWAP_EXACT_IN_SINGLE  - perform the swap
        //   SETTLE_ALL            - pay the input currency the pool requires
        //   TAKE_ALL              - take the output currency from the pool
        bytes memory actions = abi.encodePacked(
            ACTION_SWAP_EXACT_IN_SINGLE,
            ACTION_SETTLE_ALL,
            ACTION_TAKE_ALL
        );

        // SWAP_EXACT_IN_SINGLE param encoding (v4-periphery):
        //   (PoolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum,
        //    uint160 sqrtPriceLimitX96, bytes hookData)
        bytes memory swapParams = abi.encode(
            poolKey,
            true,                       // zeroForOne: MON -> USDC
            uint128(amountIn),
            uint128(0),                 // amountOutMinimum = 0 (accept any output)
            uint160(0),                 // sqrtPriceLimitX96 = 0 (router picks a default)
            bytes("")
        );

        // SETTLE_ALL param encoding: (Currency currency, uint256 maxAmount)
        bytes memory settleParams = abi.encode(
            Currency.wrap(address(0)),
            amountIn                    // pay exactly the input amount
        );

        // TAKE_ALL param encoding: (Currency currency, uint256 minAmount)
        bytes memory takeParams = abi.encode(
            Currency.wrap(USDC),
            uint256(0)                  // accept any output amount
        );

        bytes[] memory params = new bytes[](3);
        params[0] = swapParams;
        params[1] = settleParams;
        params[2] = takeParams;

        // Wrap into V4_SWAP command: (bytes actions, bytes[] params)
        bytes memory v4SwapInput = abi.encode(actions, params);

        // UniversalRouter.execute(bytes commands, bytes[] inputs, uint256 deadline)
        bytes memory commands = abi.encodePacked(CMD_V4_SWAP);
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = v4SwapInput;

        (bool success, bytes memory ret) = UNIVERSAL_ROUTER.call{value: amountIn}(
            abi.encodeWithSignature(
                "execute(bytes,bytes[],uint256)",
                commands,
                inputs,
                block.timestamp + 3600
            )
        );

        if (!success) {
            console.log("Router call reverted. Data:");
            console.logBytes(ret);
        }
        require(success, "Swap via router failed");

        vm.stopBroadcast();

        console.log("Swap via router succeeded");
    }
}