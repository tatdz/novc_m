// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IPoolManager {
    // Try different initialization signatures
    function initializePool(bytes32 poolId, uint160 sqrtPriceX96) external;
    function createPool(bytes32 poolId, uint160 sqrtPriceX96) external;
    function initPool(bytes32 poolId, uint160 sqrtPriceX96) external;
    function initialize(bytes32 poolId, uint160 sqrtPriceX96) external;
    
    function swap(
        bytes32 poolId,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata hookData
    ) external returns (int256, int256);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract DirectSwap {
    address public constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;
    address public constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address public constant HOOK = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    
    bytes32 public constant POOL_ID = 0x002b8ad258154f5e44e8f2960e2aa0671f88b857037c8e089d8c463e7b1150f5;
    
    event Debug(string message);
    event DebugUint(string label, uint256 value);
    
    function initializePool() external {
        uint160 sqrtPriceX96 = 79228162514264337593543950336;
        
        // Try different initialization functions
        bytes4[4] memory selectors = [
            bytes4(keccak256("initializePool(bytes32,uint160)")),
            bytes4(keccak256("createPool(bytes32,uint160)")),
            bytes4(keccak256("initPool(bytes32,uint160)")),
            bytes4(keccak256("initialize(bytes32,uint160)"))
        ];
        
        for (uint i = 0; i < selectors.length; i++) {
            emit Debug("Trying selector");
            emit DebugUint("Selector", uint256(uint32(selectors[i])));
            
            (bool success, ) = POOL_MANAGER.call(
                abi.encodeWithSelector(selectors[i], POOL_ID, sqrtPriceX96)
            );
            
            if (success) {
                emit Debug("Pool initialized successfully");
                return;
            }
        }
        
        revert("All initialization attempts failed");
    }
    
    function swapETHForUSDC() external payable {
        require(msg.value > 0, "No ETH sent");
        
        IWETH(WETH).deposit{value: msg.value}();
        IERC20(WETH).approve(POOL_MANAGER, msg.value);
        
        (bool success, bytes memory returnData) = POOL_MANAGER.call(
            abi.encodeWithSignature(
                "swap(bytes32,bool,int256,uint160,bytes)",
                POOL_ID,
                true,
                int256(msg.value),
                uint160(0),
                new bytes(0)
            )
        );
        
        require(success, "Swap failed");
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
    }
}

contract InitializePool is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address swap = vm.envAddress("DIRECT_SWAP");
        
        vm.startBroadcast(pk);
        DirectSwap(payable(swap)).initializePool();
        vm.stopBroadcast();
        
        console.log("Pool initialization attempted");
    }
}