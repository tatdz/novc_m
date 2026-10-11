// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

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
    function swap(
        PoolKey memory key,
        SwapParams memory params,
        bytes calldata hookData
    ) external returns (BalanceDelta);

    function sync(Currency currency) external;
    function settle() external payable returns (uint256 paid);
    function take(Currency currency, address to, uint256 amount) external;
}

contract DirectSwap {
    // ---- Monad testnet addresses ----
    address public constant POOL_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address public constant USDC         = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    // ---- Newly deployed hook ----
    address public constant HOOK = 0x9d7CBeBe77a27D44BB0748C52462DeA763653fF0;

    // ---- Pool params (match hook + CreatePool) ----
    uint24 public constant POOL_FEE = 3000;
    int24  public constant POOL_TICK_SPACING = 60;

    // V4 price-limit sentinels. Passing 0 reverts with PriceLimitOutOfBounds(0).
    //   MIN_SQRT_PRICE = 4295128739
    //   MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342
    uint160 private constant MIN_SQRT_PRICE_PLUS_ONE = 4295128740;

    event SwapExecuted(address indexed sender, uint256 monIn, uint256 usdcOut);

    function poolKey() public pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),   // native MON
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

        (address user, uint256 monIn, uint256 minOut) = abi.decode(
            rawData,
            (address, uint256, uint256)
        );

        // Selling currency0 (native MON) => zeroForOne = true => price decreases.
        // Passing 0 reverts with PriceLimitOutOfBounds; use MIN_SQRT_PRICE+1.
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: int256(monIn),
            sqrtPriceLimitX96: MIN_SQRT_PRICE_PLUS_ONE
        });

        BalanceDelta delta = IPoolManager(POOL_MANAGER).swap(poolKey(), params, "");

        // Unpack: upper 128 bits = amount0 (MON), lower 128 = amount1 (USDC)
        // For MON -> USDC, amount0 should be negative, amount1 positive.
        int256 raw = BalanceDelta.unwrap(delta);
        int128 amount0 = int128(raw >> 128);
        int128 amount1 = int128(raw);

        require(amount0 < 0, "DirectSwap: unexpected MON delta");
        require(amount1 > 0, "DirectSwap: unexpected USDC delta");

        uint256 monOwed = uint256(uint128(-amount0));
        uint256 usdcOut = uint256(uint128(amount1));

        require(monOwed <= monIn, "DirectSwap: owed more than sent");
        require(usdcOut >= minOut, "DirectSwap: slippage in callback");

        // Settle native MON, then take USDC.
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
        console.logBytes32(0x15af33761730cb1dd00f47eff431ad51cadfa664b53f68911f7cbea906f53d96);
        console.log("Computed poolId from DirectSwap:");
        console.logBytes32(swap.poolId());
        console.log("If they don't match, PoolKey ordering is wrong.");
    }
}

contract CheckPool is Script {
    function run() external view {
        address swap = vm.envAddress("DIRECT_SWAP");
        DirectSwap ds = DirectSwap(payable(swap));
        console.log("Pool ID from DirectSwap:");
        console.logBytes32(ds.poolId());
    }
}