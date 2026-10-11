// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

// ==================== INTERFACES ====================
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

// PoolKey struct
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

// Command constants
library Commands {
    uint8 constant V4_SWAP = 0x10;
}

// ==================== MAIN SWAP CONTRACT ====================
contract TestSwap {
    address public constant UNIVERSAL_ROUTER = 0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D;
    address public constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address public constant HOOK = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    
    event SwapExecuted(uint256 amountIn, uint256 amountOut);
    event SwapFailed(bytes reason);
    
    constructor() {
        // Approve everything on deployment
        IERC20(USDC).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(
            USDC,
            UNIVERSAL_ROUTER,
            type(uint160).max,
            type(uint48).max
        );
    }
    
    // Execute ETH -> USDC swap
    function swapETHForUSDC() external payable {
        require(msg.value > 0, "No ETH sent");
        
        bytes memory commands = abi.encodePacked(Commands.V4_SWAP);
        bytes[] memory inputs = new bytes[](1);
        
        PoolKey memory poolKey = PoolKey({
            currency0: address(0), // ETH
            currency1: USDC,
            fee: 3000,
            tickSpacing: 60,
            hooks: HOOK
        });
        
        // V4 swap actions
        bytes memory actions = abi.encodePacked(
            uint8(1), // SWAP_EXACT_IN_SINGLE
            uint8(2), // SETTLE
            uint8(3)  // TAKE
        );
        
        bytes[] memory actionParams = new bytes[](3);
        
        // SWAP_EXACT_IN_SINGLE params
        actionParams[0] = abi.encode(
            poolKey,
            true, // zeroForOne (ETH -> USDC)
            msg.value,
            0, // amountOutMinimum
            uint160(0),
            bytes("")
        );
        
        // SETTLE params
        actionParams[1] = abi.encode(
            address(0),
            msg.value
        );
        
        // TAKE params
        actionParams[2] = abi.encode(
            USDC,
            uint256(0)
        );
        
        inputs[0] = abi.encode(actions, actionParams);
        
        try IUniversalRouter(UNIVERSAL_ROUTER).execute{value: msg.value}(
            commands,
            inputs,
            block.timestamp + 300
        ) {
            emit SwapExecuted(msg.value, 0);
        } catch (bytes memory reason) {
            emit SwapFailed(reason);
            revert(string(reason));
        }
    }
    
    // Execute USDC -> ETH swap
    function swapUSDCForETH(uint256 amountIn) external {
        require(amountIn > 0, "No USDC sent");
        require(IERC20(USDC).transferFrom(msg.sender, address(this), amountIn), "Transfer failed");
        
        IERC20(USDC).approve(UNIVERSAL_ROUTER, amountIn);
        
        bytes memory commands = abi.encodePacked(Commands.V4_SWAP);
        bytes[] memory inputs = new bytes[](1);
        
        PoolKey memory poolKey = PoolKey({
            currency0: address(0),
            currency1: USDC,
            fee: 3000,
            tickSpacing: 60,
            hooks: HOOK
        });
        
        bytes memory actions = abi.encodePacked(
            uint8(1), // SWAP_EXACT_IN_SINGLE
            uint8(2), // SETTLE
            uint8(3)  // TAKE
        );
        
        bytes[] memory actionParams = new bytes[](3);
        
        actionParams[0] = abi.encode(
            poolKey,
            false, // zeroForOne (USDC -> ETH)
            amountIn,
            0,
            uint160(0),
            bytes("")
        );
        
        actionParams[1] = abi.encode(
            USDC,
            amountIn
        );
        
        actionParams[2] = abi.encode(
            address(0),
            uint256(0)
        );
        
        inputs[0] = abi.encode(actions, actionParams);
        
        IUniversalRouter(UNIVERSAL_ROUTER).execute(
            commands,
            inputs,
            block.timestamp + 300
        );
        
        emit SwapExecuted(amountIn, 0);
    }
    
    // Helper to check balances
    function getBalances() external view returns (uint256 ethBalance, uint256 usdcBalance) {
        ethBalance = address(this).balance;
        usdcBalance = IERC20(USDC).balanceOf(address(this));
    }
    
    receive() external payable {}
}

// ==================== DEPLOYMENT SCRIPT ====================
contract DeployTestSwapScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("========================================");
        console.log("Deploying TestSwap...");
        console.log("Deployer:", deployer);
        console.log("========================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TestSwap testSwap = new TestSwap();
        
        console.log("TestSwap deployed at:", address(testSwap));
        
        vm.stopBroadcast();
        
        console.log("========================================");
        console.log("To execute a swap, run:");
        console.log("cast send", address(testSwap), "\"swapETHForUSDC()\" --value 0.001ether --private-key $PRIVATE_KEY --rpc-url $ALCHEMY_UNICHAIN_SEPOLIA_URL");
        console.log("========================================");
    }
}

// ==================== EXECUTE SWAP SCRIPT ====================
contract ExecuteSwapScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address payable testSwapAddress = payable(vm.envAddress("TEST_SWAP_ADDRESS"));
        
        console.log("========================================");
        console.log("Executing swap through Universal Router...");
        console.log("TestSwap address:", testSwapAddress);
        console.log("========================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TestSwap(testSwapAddress).swapETHForUSDC{value: 0.001 ether}();
        
        vm.stopBroadcast();
        
        console.log("Swap executed!");
        console.log("Check your hook's totalSwapFeesCollected:");
        console.log("cast call 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0 \"totalSwapFeesCollected()(uint256)\" --rpc-url $ALCHEMY_UNICHAIN_SEPOLIA_URL");
    }
}

// ==================== CHECK RESULTS SCRIPT ====================
contract CheckSwapResultsScript is Script {
    function run() external {
        address hook = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
        
        console.log("========================================");
        console.log("Checking swap results...");
        console.log("========================================");
        
        // Check total swap fees
        (bool success1, bytes memory data1) = hook.staticcall(
            abi.encodeWithSignature("totalSwapFeesCollected()")
        );
        if (success1) {
            uint256 fees = abi.decode(data1, (uint256));
            console.log("Total swap fees collected:", fees / 10**6, "USDC");
        }
        
        // Check pool info
        (bool success2, bytes memory data2) = hook.staticcall(
            abi.encodeWithSignature("getPoolInfo()")
        );
        if (success2) {
            (uint256 total, uint256 apy, uint256 auction, uint256 idle, uint256 active, uint256 investors) = 
                abi.decode(data2, (uint256, uint256, uint256, uint256, uint256, uint256));
            console.log("Pool total:", total / 10**6, "USDC");
            console.log("APY slice:", apy / 10**6, "USDC");
            console.log("Auction slice:", auction / 10**6, "USDC");
            console.log("Idle slice:", idle / 10**6, "USDC");
            console.log("Active liquidity:", active / 10**6, "USDC");
            console.log("Total investors:", investors);
        }
    }
}