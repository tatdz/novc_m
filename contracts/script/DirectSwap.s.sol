// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

type Currency is address;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

type BalanceDelta is int256;

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (BalanceDelta);
    function sync(Currency currency) external;
    function settle() external payable returns (uint256 paid);
    function take(Currency currency, address to, uint256 amount) external;
}

contract DirectSwap {
    address public constant POOL_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address public constant USDC         = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address public constant HOOK         = 0xD242803aE1840bB5FaC91EcbBC03B26BcB2eFFF0;

    uint24 public constant POOL_FEE = 3000;
    int24  public constant POOL_TICK_SPACING = 60;
    uint160 private constant MIN_SQRT_PRICE_PLUS_ONE = 4295128740;

    event SwapExecuted(address indexed sender, uint256 monIn, uint256 usdcOut);

    function poolKey() public pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(USDC),
            fee: POOL_FEE,
            tickSpacing: POOL_TICK_SPACING,
            hooks: HOOK
        });
    }

    function poolId() public pure returns (bytes32) {
        return keccak256(abi.encode(poolKey()));
    }

    function swapMONForUSDC(uint256 minUSDCAmountOut) external payable {
        require(msg.value > 0, "DirectSwap: no MON sent");
        bytes memory payload = abi.encode(msg.sender, msg.value, minUSDCAmountOut);
        bytes memory result = IPoolManager(POOL_MANAGER).unlock(payload);
        uint256 usdcOut = abi.decode(result, (uint256));
        require(usdcOut >= minUSDCAmountOut, "DirectSwap: slippage");
        emit SwapExecuted(msg.sender, msg.value, usdcOut);
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == POOL_MANAGER, "DirectSwap: only PoolManager");

        (address user, uint256 monIn, uint256 minOut) = abi.decode(rawData, (address, uint256, uint256));

        // Monad V4 uses negative amountSpecified for exact input
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(monIn),
            sqrtPriceLimitX96: MIN_SQRT_PRICE_PLUS_ONE
        });

        BalanceDelta delta = IPoolManager(POOL_MANAGER).swap(poolKey(), params, "");

        int256 raw = BalanceDelta.unwrap(delta);
        int128 amount0 = int128(raw >> 128);
        int128 amount1 = int128(raw);

        require(amount0 < 0, "DirectSwap: unexpected MON delta");
        require(amount1 > 0, "DirectSwap: unexpected USDC delta");

        uint256 monOwed = uint256(uint128(-amount0));
        uint256 usdcOut = uint256(uint128(amount1));

        require(monOwed <= monIn, "DirectSwap: owed more than sent");
        require(usdcOut >= minOut, "DirectSwap: slippage in callback");

        IPoolManager(POOL_MANAGER).sync(Currency.wrap(address(0)));
        IPoolManager(POOL_MANAGER).settle{value: monOwed}();
        IPoolManager(POOL_MANAGER).take(Currency.wrap(USDC), user, usdcOut);

        return abi.encode(usdcOut);
    }

    receive() external payable {}
}

contract DeployDirectSwap is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        DirectSwap swap = new DirectSwap();
        vm.stopBroadcast();

        console.log("DirectSwap deployed at:", address(swap));
        console.log("Expected poolId:");
        console.logBytes32(0x9b0bd1da49fd50cb2dc1c4f3cb6231e3f1f35b20683ed1d73c7d76ce86893194);
        console.log("Computed poolId:");
        console.logBytes32(swap.poolId());
    }
}