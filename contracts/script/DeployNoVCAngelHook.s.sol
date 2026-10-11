// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {NoVCAngelHookV2} from "../src/NoVCAngelHookV2.sol";

library HookMiner {
    uint160 constant FLAG_MASK = (1 << 14) - 1; // 16383 in decimal
    
    uint256 constant MAX_LOOP = 160444;

    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs)
        internal
        view
        returns (address, bytes32)
    {
        flags = flags & FLAG_MASK;
        bytes memory creationCodeWithArgs = abi.encodePacked(creationCode, constructorArgs);

        address hookAddress;
        for (uint256 salt; salt < MAX_LOOP; salt++) {
            hookAddress = computeAddress(deployer, salt, creationCodeWithArgs);

            if (uint160(hookAddress) & FLAG_MASK == flags && hookAddress.code.length == 0) {
                return (hookAddress, bytes32(salt));
            }
        }
        revert("HookMiner: could not find salt");
    }

    function computeAddress(address deployer, uint256 salt, bytes memory creationCodeWithArgs)
        internal
        pure
        returns (address)
    {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xFF), deployer, bytes32(salt), keccak256(creationCodeWithArgs)))))
        );
    }
}

contract DeployNoVCAngelHook is Script {
    // --- Unichain Sepolia Addresses ---
    address constant POOL_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address constant PYTH = 0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379;

    // Address of the universal CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Hook flags - matching the PoolManager's expectations (bits 4-13)
    // Based on Hooks.sol from Uniswap V4:
    // BEFORE_INITIALIZE_FLAG = 1 << 13 = 8192
    // AFTER_INITIALIZE_FLAG = 1 << 12 = 4096
    // BEFORE_ADD_LIQUIDITY_FLAG = 1 << 11 = 2048
    // AFTER_ADD_LIQUIDITY_FLAG = 1 << 10 = 1024
    // BEFORE_REMOVE_LIQUIDITY_FLAG = 1 << 9 = 512
    // AFTER_REMOVE_LIQUIDITY_FLAG = 1 << 8 = 256
    // BEFORE_SWAP_FLAG = 1 << 7 = 128
    // AFTER_SWAP_FLAG = 1 << 6 = 64
    // BEFORE_DONATE_FLAG = 1 << 5 = 32
    // AFTER_DONATE_FLAG = 1 << 4 = 16
    uint160 constant FLAGS = 
        (1 << 13) | // beforeInitialize
        (1 << 12) | // afterInitialize
        (1 << 11) | // beforeAddLiquidity
        (1 << 10) | // afterAddLiquidity
        (1 << 9)  | // beforeRemoveLiquidity
        (1 << 8)  | // afterRemoveLiquidity
        (1 << 7)  | // beforeSwap
        (1 << 6)  | // afterSwap
        (1 << 5)  | // beforeDonate
        (1 << 4);   // afterDonate
    // Total = 16368

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer Address:", deployer);
        console.log("Network: Unichain Sepolia (1301)");
        console.log("========================================");

        console.log("Required flags (decimal):", uint(FLAGS)); // Should be 16368
        console.log("Required flags (hex):", vm.toString(FLAGS));
        console.log("Mining salt for CREATE2 address with correct hook flags...");

        // Encode constructor arguments as raw addresses
        bytes memory constructorArgs = abi.encode(POOL_MANAGER, PYTH);

        // Mine for address with correct flags using HookMiner
        (address predictedAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            FLAGS,
            type(NoVCAngelHookV2).creationCode,
            constructorArgs
        );

        console.log("Salt found!");
        console.log("Salt:", vm.toString(salt));
        console.log("Predicted address:", predictedAddress);
        console.log("Verifying flags...");

        // Verify the flags are correct
        uint160 addrAsUint = uint160(uint256(uint160(predictedAddress)));
        uint160 last14Bits = addrAsUint & ((1 << 14) - 1);
        
        console.log("Last 14 bits of address:", uint(last14Bits));
        require(last14Bits == FLAGS, "Flag verification failed");

        console.log("Flag verification passed!");
        console.log("Proceeding with deployment...");

        // Begin broadcast
        vm.startBroadcast(deployerPrivateKey);

        // Deploy the hook using CREATE2 with the mined salt
        bytes memory creationCodeWithArgs = abi.encodePacked(
            type(NoVCAngelHookV2).creationCode,
            constructorArgs
        );

        address hookAddress;
        assembly {
            hookAddress := create2(0, add(creationCodeWithArgs, 32), mload(creationCodeWithArgs), salt)
        }

        require(hookAddress != address(0), "Create2 failed");
        require(hookAddress == predictedAddress, "Deployed address mismatch");

        vm.stopBroadcast();

        // Final verification
        console.log("========================================");
        console.log("DEPLOYMENT SUCCESSFUL!");
        console.log("NoVCAngelHookV2 deployed at:", hookAddress);
        
        uint160 deployedAddrAsUint = uint160(uint256(uint160(hookAddress)));
        uint160 deployedLast14Bits = deployedAddrAsUint & ((1 << 14) - 1);
        console.log("Flags in address:", uint(deployedLast14Bits));
        
        if (deployedLast14Bits == FLAGS) {
            console.log("Flags match exactly!");
        }
        
        console.log("========================================");
    }
}