// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IPoolManager} from "lib/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "lib/v4-core/src/types/PoolKey.sol";
import {Currency} from "lib/v4-core/src/types/Currency.sol";
import {IHooks} from "lib/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "lib/v4-core/src/libraries/Hooks.sol";

interface IPositionManager {
    function initializePool(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

// Define the interface for your specific hook contract
interface IAngelHookV2 is IHooks {
    function createAngelPool() external returns (bytes32);
    function poolId() external view returns (bytes32);
    function approveUSDCForPermit2() external;
    function depositUSDC(uint256 amount) external;
    function depositETH() external payable;
    function allocateSlices() external;
    function proposeAuctionInvestment(address auctionAddress, uint256 investmentAmount) external returns (uint256);
}

contract CreatePool is Script {
    // Unichain Sepolia Addresses
    address constant POSITION_MANAGER = 0xf969Aee60879C54bAAed9F3eD26147Db216Fd664;
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address constant NATIVE_ETH = address(0);
    
    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;
    
    address constant HOOK_ADDRESS = 0xC57066e35bEd99634B0e90111b56859bD8863FF0;
    
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
    uint160 constant EXPECTED_FLAGS = 
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
        
        console.log("Creating Uniswap V4 Pool with Hook...");
        console.log("Deployer:", deployer);
        console.log("Hook:", HOOK_ADDRESS);
        console.log("========================================");
        
        // Validate hook before broadcast
        validateHookStatic();
        
        vm.startBroadcast(deployerPrivateKey);
        
        IAngelHookV2 hook = IAngelHookV2(HOOK_ADDRESS);
        
        // Check if angel pool already exists
        bytes32 existingPoolId = hook.poolId();
        if (existingPoolId == bytes32(0)) {
            console.log("Creating new angel pool in hook...");
            existingPoolId = hook.createAngelPool();
            console.log("Angel pool created with ID:");
            console.logBytes32(existingPoolId);
        } else {
            console.log("Angel pool already exists with ID:");
            console.logBytes32(existingPoolId);
        }
        
        // Create the Uniswap V4 pool
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(NATIVE_ETH),
            currency1: Currency.wrap(USDC),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK_ADDRESS)
        });
        
        // sqrtPriceX96 for 1 ETH = 2000 USDC
        uint160 sqrtPriceX96 = 87150978765690771352898345369;
        
        console.log("Pool Key:");
        console.log("  ETH/USDC");
        console.log("    fee:", FEE);
        console.log("    tickSpacing:", TICK_SPACING);
        console.log("  sqrtPriceX96:", sqrtPriceX96);
        
        IPositionManager positionManager = IPositionManager(POSITION_MANAGER);
        int24 tick = positionManager.initializePool(key, sqrtPriceX96);
        
        bytes32 poolId = keccak256(abi.encode(key));
        
        vm.stopBroadcast();
        
        console.log("SUCCESS!");
        console.log("Uniswap Pool ID:");
        console.logBytes32(poolId);
        console.log("Hook's stored poolId:");
        console.logBytes32(existingPoolId);
        
        if (existingPoolId == poolId) {
            console.log("Pool IDs match!");
        } else {
            console.log("Pool IDs don't match - this is expected");
            console.log("Hook's pool uses USDC/ETH (reversed order)");
        }
        
        console.log("Initial tick:", tick);
        console.log("========================================");
        console.log("Next steps:");
        console.log("1. Investors should approve USDC for Permit2: hook.approveUSDCForPermit2()");
        console.log("2. Deposit funds: hook.depositUSDC() or hook.depositETH()");
        console.log("3. Allocate slices: hook.allocateSlices()");
        console.log("4. Propose auctions: hook.proposeAuctionInvestment()");
    }
    
    function validateHookStatic() internal view {
        address hookAddress = HOOK_ADDRESS;
        
        // Check code exists
        require(hookAddress.code.length > 0, "Hook has no code");
        
        console.log("Hook bytecode size:", hookAddress.code.length);
        
        // Verify the hook address has the correct flags encoded
        uint160 hookAddressWithFlags = uint160(hookAddress);
        uint160 last14Bits = hookAddressWithFlags & ((1 << 14) - 1);
        
        console.log("Hook address flags check:");
        console.log("  Expected flags (bits 4-13):", uint(EXPECTED_FLAGS));
        console.log("  Actual flags:", uint(last14Bits));
        
        if (last14Bits == EXPECTED_FLAGS) {
            console.log("  Hook has correct permission flags");
        } else {
            console.log("  Hook has INCORRECT permission flags!");
            console.log("  This will cause HookAddressNotValid error");
            console.log("  Expected:", uint(EXPECTED_FLAGS));
            console.log("  Got:", uint(last14Bits));
        }
        
        // Cast to your hook interface
        IAngelHookV2 hook = IAngelHookV2(hookAddress);
        
        // Check if poolId view function exists
        try hook.poolId() returns (bytes32 poolIdValue) {
            console.log("  poolId() exists");
            if (poolIdValue != bytes32(0)) {
                console.log("  Angel pool already initialized with ID:");
                console.logBytes32(poolIdValue);
            }
        } catch {
            console.log("  poolId() may not exist");
        }
        
        console.log("Hook static validation passed");
    }
}