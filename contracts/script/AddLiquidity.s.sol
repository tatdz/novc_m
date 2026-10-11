// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
    function allowance(address owner, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce);
}

type Currency is address;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

interface IPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function nextTokenId() external view returns (uint256);
}

library Actions {
    uint8 internal constant MINT_POSITION = 0x02;
    uint8 internal constant SETTLE_PAIR   = 0x0d;
}

contract AddLiquidity is Script {
    address constant POSITION_MANAGER = 0x3Bb14E3D0Cd50aBe3EdACa06d06c29C78676C31A;
    address constant USDC             = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address constant PERMIT2          = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Newly deployed hook
    address constant HOOK = 0xD242803aE1840bB5FaC91EcbBC03B26BcB2eFFF0;

    uint24 constant FEE = 3000;
    int24  constant TICK_SPACING = 60;

    int24 constant TICK_LOWER = -887220;
    int24 constant TICK_UPPER = 887220;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("Deployer:", deployer);
        console.log("MON balance (wei):", deployer.balance);
        console.log("USDC balance:    ", IERC20(USDC).balanceOf(deployer));

        // Liquidity scaled to fit the deployer's MON balance.
        // At the corrected price (1 MON ~= $0.027) and full range:
        //   1e12 liquidity -> ~6.08 MON + ~0.16 USDC
        //   so 2.5e11 -> ~1.52 MON + ~0.04 USDC
        uint128 liquidity = 250_000_000_000; // 2.5e11

        uint128 amount0Max = 2_000_000_000_000_000_000; // 2 MON
        uint128 amount1Max = 10_000_000;                // 10 USDC

        require(deployer.balance >= amount0Max, "Not enough MON");
        require(IERC20(USDC).balanceOf(deployer) >= amount1Max, "Not enough USDC");

        vm.startBroadcast(pk);

        // ---- Approval 1: USDC -> Permit2 (skip if already set) ----
        uint256 currentAllowance = IERC20(USDC).allowance(deployer, PERMIT2);
        if (currentAllowance < amount1Max) {
            if (currentAllowance > 0) {
                IERC20(USDC).approve(PERMIT2, 0);
                console.log("Reset USDC allowance to 0");
            }
            IERC20(USDC).approve(PERMIT2, type(uint256).max);
            console.log("Approved USDC to Permit2");
        } else {
            console.log("USDC already approved to Permit2, skipping");
        }

        // ---- Approval 2: Permit2 -> PositionManager ----
        (uint160 p2Amount, uint48 p2Expiration, ) = IPermit2(PERMIT2).allowance(
            deployer,
            USDC,
            POSITION_MANAGER
        );
        if (p2Amount < amount1Max || p2Expiration < block.timestamp) {
            IPermit2(PERMIT2).approve(
                USDC,
                POSITION_MANAGER,
                type(uint160).max,
                type(uint48).max
            );
            console.log("Approved PositionManager via Permit2");
        } else {
            console.log("PositionManager already approved via Permit2, skipping");
        }

        // ---- Build the mint ----
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),   // native MON
            currency1: Currency.wrap(USDC),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOK
        });

        bytes memory mintParams = abi.encode(
            key,
            TICK_LOWER,
            TICK_UPPER,
            uint256(liquidity),
            amount0Max,
            amount1Max,
            deployer,
            bytes("")
        );

        bytes memory settleParams = abi.encode(key.currency0, key.currency1);

        bytes memory actions = abi.encodePacked(
            Actions.MINT_POSITION,
            Actions.SETTLE_PAIR
        );

        bytes[] memory params = new bytes[](2);
        params[0] = mintParams;
        params[1] = settleParams;

        bytes memory unlockData = abi.encode(actions, params);

        uint256 deadline = block.timestamp + 300;
        IPositionManager(POSITION_MANAGER).modifyLiquidities{value: amount0Max}(
            unlockData,
            deadline
        );

        vm.stopBroadcast();

        uint256 tokenId = IPositionManager(POSITION_MANAGER).nextTokenId() - 1;
        console.log("Liquidity added successfully");
        console.log("Position tokenId:", tokenId);
        console.log("Position liquidity:", IPositionManager(POSITION_MANAGER).getPositionLiquidity(tokenId));
    }
}