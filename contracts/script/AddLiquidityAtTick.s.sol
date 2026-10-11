// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

type Currency is address;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IPoolModifyLiquidityTest {
    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes memory hookData,
        bool settleUsingBurn,
        bool takeClaims
    ) external payable returns (int256, int256);
}

contract AddLiquidityAtTick {
    address public constant POOL_MODIFY_TEST = 0x5fa728C0A5cfd51BEe4B060773f50554c0C8A7AB;
    address public constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address public constant HOOK = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
    
    event Debug(string message);
    event DebugUint(string label, uint256 value);
    event DebugInt(string label, int256 value);
    
    function getPoolKey() public pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(USDC),
            fee: 3000,
            tickSpacing: 60,
            hooks: HOOK
        });
    }
    
    function addLiquidity() external payable {
        require(msg.value == 0.003 ether, "Send exactly 0.003 ETH");
        
        uint256 usdcAmount = 34 * 10**6;
        
        // Transfer USDC
        IERC20(USDC).transferFrom(msg.sender, address(this), usdcAmount);
        IERC20(USDC).approve(POOL_MODIFY_TEST, usdcAmount);
        
        PoolKey memory key = getPoolKey();
        
        // Use the tick from the successful swap (-642850)
        // Add liquidity in a range around this tick
        int24 currentTick = -642850;
        int24 tickSpacing = 60;
        
        // Round to nearest tick spacing
        int24 tickLower = (currentTick / tickSpacing) * tickSpacing - 10 * tickSpacing;
        int24 tickUpper = (currentTick / tickSpacing) * tickSpacing + 10 * tickSpacing;
        
        console.log("tickLower:", tickLower);
        console.log("tickUpper:", tickUpper);
        
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityDelta: 1000000000000,
            salt: bytes32(uint256(1))
        });
        
        (bool success, ) = POOL_MODIFY_TEST.call{value: msg.value}(
            abi.encodeWithSignature(
                "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes,bool,bool)",
                key,
                params,
                new bytes(0),
                false,
                false
            )
        );
        
        require(success, "modifyLiquidity failed");
    }
    
    receive() external payable {}
}

contract DeployAtTick is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        AddLiquidityAtTick addLiq = new AddLiquidityAtTick();
        vm.stopBroadcast();
        console.log("AddLiquidityAtTick deployed at:", address(addLiq));
    }
}