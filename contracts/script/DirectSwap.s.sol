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
    address public constant POOL_MANAGER = 0x451D64ab3b650040d2aE1886602b97ed6eDc643d;
    address public constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address public constant HOOK = 0x8f93D9b74E8034FfA21bF423A43aD0A67a48BfF0;
    address public constant WETH = 0x45477f4709771331db81944A5E20eF95Bc7BA2D7;
    
    bytes32 public constant POOL_ID = 0x4dcd2ab926bedf4668df25be63e75dbed286bdec1e591faa14fb7609517f3f76;
    
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