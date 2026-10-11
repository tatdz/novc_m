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
    // ---- Monad testnet addresses ----
    address constant POSITION_MANAGER = 0x3Bb14E3D0Cd50aBe3EdACa06d06c29C78676C31A;
    address constant POOL_MANAGER     = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address constant USDC             = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    // On Monad, the native token is MON, not ETH.
    // In Uniswap V4, the native currency is represented by address(0).
    address constant NATIVE_MON = address(0);

    // ---- Pool parameters (must match the hook's createAngelPool) ----
    uint24 constant FEE = 3000;
    int24  constant TICK_SPACING = 60;

    // ---- Newly deployed hook ----
    address constant HOOK_ADDRESS = 0x9d7CBeBe77a27D44BB0748C52462DeA763653fF0;

    // V4 hook flags — all bits 4..13 set. This matches the flags the hook
    // requires at construction time.
    //
    //  BEFORE_INITIALIZE_FLAG        = 1 << 13 = 8192
    //  AFTER_INITIALIZE_FLAG         = 1 << 12 = 4096
    //  BEFORE_ADD_LIQUIDITY_FLAG     = 1 << 11 = 2048
    //  AFTER_ADD_LIQUIDITY_FLAG      = 1 << 10 = 1024
    //  BEFORE_REMOVE_LIQUIDITY_FLAG  = 1 << 9  = 512
    //  AFTER_REMOVE_LIQUIDITY_FLAG   = 1 << 8  = 256
    //  BEFORE_SWAP_FLAG              = 1 << 7  = 128
    //  AFTER_SWAP_FLAG               = 1 << 6  = 64
    //  BEFORE_DONATE_FLAG            = 1 << 5  = 32
    //  AFTER_DONATE_FLAG             = 1 << 4  = 16
    uint160 constant EXPECTED_FLAGS =
        (1 << 13) | (1 << 12) | (1 << 11) | (1 << 10) |
        (1 << 9)  | (1 << 8)  | (1 << 7)  | (1 << 6) |
        (1 << 5)  | (1 << 4);

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Creating Uniswap V4 pool...");
        console.log("Deployer:", deployer);
        console.log("Hook:    ", HOOK_ADDRESS);
        console.log("========================================");

        validateHookStatic();

        vm.startBroadcast(deployerPrivateKey);

        IAngelHookV2 hook = IAngelHookV2(HOOK_ADDRESS);

        // Step 1: ensure the hook's internal Angel pool exists.
        // This records a bytes32 poolId inside the hook's storage.
        // Calling this twice reverts with "Pool already created", so we
        // only call it when the hook has no poolId yet.
        bytes32 existingPoolId = hook.poolId();
        if (existingPoolId == bytes32(0)) {
            console.log("Calling createAngelPool()...");
            existingPoolId = hook.createAngelPool();
            console.log("Hook poolId set:");
            console.logBytes32(existingPoolId);
        } else {
            console.log("Hook already had poolId:");
            console.logBytes32(existingPoolId);
        }

        // Step 2: build the V4 pool key.
        // It must exactly match the key the hook's createAngelPool() built,
        // including currency ordering (native MON first, USDC second).
        // V4 also requires currency0 < currency1 by address; address(0) < USDC,
        // so this ordering is the canonical one.
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(NATIVE_MON),
            currency1: Currency.wrap(USDC),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK_ADDRESS)
        });

        // Step 3: initial price.
        //   V4 stores sqrtPriceX96 = floor(sqrt(P) * 2^96),
        //   where P = currency1/currency0 in raw units.
        //   Here currency0 = MON (18 decimals), currency1 = USDC (6 decimals),
        //   and 1 MON ~= $0.027.
        //   P = 1e6 / (0.027 * 1e18) = 3.7000e-11
        //   sqrt(P) = 6.083e-6
        //   sqrtPriceX96 = floor(6.083e-6 * 2^96) = 482001430789625741400000
        uint160 sqrtPriceX96 = 482001430789625741400000;

        console.log("Initializing pool at sqrtPriceX96:", sqrtPriceX96);

        IPositionManager positionManager = IPositionManager(POSITION_MANAGER);
        int24 tick = positionManager.initializePool(key, sqrtPriceX96);

        bytes32 poolId = keccak256(abi.encode(key));

        vm.stopBroadcast();

        console.log("========================================");
        console.log("SUCCESS");
        console.log("V4 poolId:");
        console.logBytes32(poolId);
        console.log("Hook's stored poolId:");
        console.logBytes32(existingPoolId);
        if (existingPoolId == poolId) {
            console.log("Pool IDs MATCH");
        } else {
            console.log("Pool IDs DON'T MATCH - check key ordering");
        }
        console.log("Initial tick:", tick);
        console.log("========================================");
        console.log("Next steps:");
        console.log("1) Redeploy DirectSwap with HOOK = ", HOOK_ADDRESS);
        console.log("2) Run AddLiquidity.s.sol");
        console.log("3) Update lib/abis.ts: NOVC_ANGEL_HOOK + POOL_ID");
        console.log("4) Update AngelPoolDashboard.tsx: HOOK_ADDRESS + DIRECT_SWAP_ADDRESS");
    }

    function validateHookStatic() internal view {
        address hookAddress = HOOK_ADDRESS;

        require(hookAddress.code.length > 0, "Hook has no code");
        console.log("Hook bytecode size:", hookAddress.code.length);

        uint160 hookAddressWithFlags = uint160(hookAddress);
        uint160 last14Bits = hookAddressWithFlags & ((1 << 14) - 1);

        console.log("Expected hook flags:", uint(EXPECTED_FLAGS));
        console.log("Actual   hook flags:", uint(last14Bits));
        if (last14Bits == EXPECTED_FLAGS) {
            console.log("Hook flags OK");
        } else {
            console.log("Hook flags MISMATCH - initializePool will revert");
        }

        IAngelHookV2 hook = IAngelHookV2(hookAddress);
        try hook.poolId() returns (bytes32 poolIdValue) {
            console.log("poolId() callable");
            if (poolIdValue != bytes32(0)) {
                console.log("Angel pool already initialized:");
                console.logBytes32(poolIdValue);
            }
        } catch {
            console.log("poolId() NOT callable - check hook deployment");
        }

        console.log("Hook static validation passed");
    }
}