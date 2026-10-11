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

// PoolKey struct (matches your hook)
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

// Command constants from Universal Router
library Commands {
    uint8 constant V4_SWAP = 0x10;
}

// ==================== MAIN SWAP CONTRACT ====================
contract TestSwap {
    // Addresses
    address public constant UNIVERSAL_ROUTER = 0xf70536B3bcC1bD1a972dc186A2cf84cC6da6Be5D;
    address public constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address public constant HOOK = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    
    // Pool parameters (match your hook's pool)
    uint24 public constant POOL_FEE = 3000;      // 0.3%
    int24 public constant TICK_SPACING = 60;     // From your hook
    
    // Events for debugging
    event SwapExecuted(uint256 amountIn, uint256 amountOut);
    event SwapFailed(bytes reason);
    event Debug(string message);
    event DebugBytes(bytes data);
    event DebugUint(string label, uint256 value);
    event DebugAddress(string label, address value);
    event PoolInfo(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks);
    
    constructor() {
        emit Debug("TestSwap constructor starting");
        
        // Approve everything on deployment
        bool approve1 = IERC20(USDC).approve(PERMIT2, type(uint256).max);
        emit Debug(approve1 ? "USDC approved for Permit2" : "USDC approve failed");
        
        IPermit2(PERMIT2).approve(
            USDC,
            UNIVERSAL_ROUTER,
            type(uint160).max,
            type(uint48).max
        );
        emit Debug("Permit2 approved for Universal Router");
        
        // Also approve hook directly
        bool approve2 = IERC20(USDC).approve(HOOK, type(uint256).max);
        emit Debug(approve2 ? "USDC approved for Hook" : "Hook approve failed");
        
        emit Debug("TestSwap constructor completed");
    }
    
    // Get pool key for verification
    function getPoolKey() public view returns (PoolKey memory) {
        return PoolKey({
            currency0: address(0), // ETH
            currency1: USDC,
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOK
        });
    }
    
    // Simple function to check if contract is alive
    function ping() external pure returns (string memory) {
        return "pong";
    }
    
    // Check hook address
    function getHookAddress() external view returns (address) {
        return HOOK;
    }
    
    // Check if hook has code
    function hookHasCode() external view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(HOOK)
        }
        return size > 0;
    }
    
    // Simpler function: just send ETH to hook to test receive()
    function sendETHToHook() external payable {
        require(msg.value > 0, "No ETH sent");
        require(HOOK != address(0), "Hook address is zero");
        
        emit Debug("sendETHToHook: Starting");
        emit DebugUint("Amount", msg.value);
        emit DebugAddress("Hook", HOOK);
        
        // Check if hook has code
        uint256 hookCodeSize;
        assembly {
            hookCodeSize := extcodesize(HOOK)
        }
        emit DebugUint("Hook code size", hookCodeSize);
        require(hookCodeSize > 0, "Hook has no code");
        
        // Send ETH to hook
        (bool success, ) = HOOK.call{value: msg.value}("");
        require(success, "ETH transfer to hook failed");
        
        emit Debug("sendETHToHook: Success");
    }
    
    // Execute ETH -> USDC swap
    function swapETHForUSDC() external payable {
        require(msg.value > 0, "No ETH sent");
        
        emit Debug("Starting swapETHForUSDC");
        emit DebugUint("Amount", msg.value);
        
        // Get pool key
        PoolKey memory poolKey = getPoolKey();
        emit PoolInfo(poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks);
        
        // Check Universal Router has code
        uint256 routerCodeSize;
        assembly {
            routerCodeSize := extcodesize(UNIVERSAL_ROUTER)
        }
        emit DebugUint("Router code size", routerCodeSize);
        require(routerCodeSize > 0, "Router has no code");
        
        // Encode V4_SWAP command
        bytes memory commands = abi.encodePacked(Commands.V4_SWAP);
        
        // Encode actions
        bytes memory actions = abi.encodePacked(
            uint8(1), // SWAP_EXACT_IN_SINGLE
            uint8(2), // SETTLE
            uint8(3)  // TAKE
        );
        
        // Action parameters
        bytes[] memory actionParams = new bytes[](3);
        
        // 1. SWAP_EXACT_IN_SINGLE params
        actionParams[0] = abi.encode(
            poolKey,
            true, // zeroForOne (ETH -> USDC)
            uint128(msg.value), // amountIn
            uint256(1), // amountOutMinimum (1 wei, very low for testing)
            uint160(0), // sqrtPriceLimitX96
            bytes("") // hookData
        );
        
        // 2. SETTLE params (settle ETH)
        actionParams[1] = abi.encode(
            address(0), // ETH
            uint256(msg.value)
        );
        
        // 3. TAKE params (take USDC)
        actionParams[2] = abi.encode(
            USDC,
            uint256(0) // amount (0 means take all)
        );
        
        // Create inputs array
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, actionParams);
        
        emit Debug("Sending transaction to Universal Router");
        emit DebugUint("Deadline", block.timestamp + 600);
        
        // Execute with try/catch
        try IUniversalRouter(UNIVERSAL_ROUTER).execute{value: msg.value}(
            commands,
            inputs,
            block.timestamp + 600 // 10 minute deadline
        ) {
            emit SwapExecuted(msg.value, 0);
            emit Debug("Swap completed successfully");
        } catch (bytes memory reason) {
            emit SwapFailed(reason);
            emit DebugBytes(reason);
            
            // Decode common errors
            if (reason.length >= 4) {
                bytes4 errorSelector;
                assembly {
                    errorSelector := mload(add(reason, 0x20))
                }
                
                emit DebugBytes(abi.encodePacked("Error selector: ", errorSelector));
                
                if (errorSelector == 0x5cda29d7) {
                    revert("Swap failed: Invalid pool or insufficient liquidity (0x5cda29d7)");
                } else if (errorSelector == 0xfb8f41b2) {
                    revert("Swap failed: Auction not started");
                } else if (errorSelector == 0xec5a2e1b) {
                    revert("Swap failed: Auction ended");
                } else {
                    revert(string(abi.encodePacked("Swap failed with error: ", reason)));
                }
            }
            revert(string(reason));
        }
    }
    
    // Check hook's USDC balance
    function getHookUSDCBalance() external view returns (uint256) {
        return IERC20(USDC).balanceOf(HOOK);
    }
    
    // Check hook's ETH balance
    function getHookETHBalance() external view returns (uint256) {
        return HOOK.balance;
    }
    
    // Check this contract's balances
    function getBalances() external view returns (uint256 ethBalance, uint256 usdcBalance) {
        ethBalance = address(this).balance;
        usdcBalance = IERC20(USDC).balanceOf(address(this));
    }
    
    // Check this contract's USDC allowance for hook
    function getAllowanceForHook() external view returns (uint256) {
        return IERC20(USDC).allowance(address(this), HOOK);
    }
    
    receive() external payable {
        emit Debug("TestSwap received ETH");
    }
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
        
        // Test ping
        string memory pong = testSwap.ping();
        console.log("Ping test:", pong);
        
        // Check hook
        address hook = testSwap.getHookAddress();
        console.log("Hook address:", hook);
        
        bool hasCode = testSwap.hookHasCode();
        console.log("Hook has code:", hasCode);
        
        // Get pool key
        PoolKey memory key = testSwap.getPoolKey();
        console.log("Pool key:");
        console.log("  currency0 (ETH):", key.currency0);
        console.log("  currency1 (USDC):", key.currency1);
        console.log("  fee:", key.fee);
        console.log("  tickSpacing:", key.tickSpacing);
        console.log("  hooks:", key.hooks);
        
        // Check allowance
        uint256 allowance = testSwap.getAllowanceForHook();
        console.log("USDC allowance for hook:", allowance / 10**6, "USDC");
        
        vm.stopBroadcast();
        
        console.log("========================================");
        console.log("To test ETH transfer to hook:");
        console.log("cast send", address(testSwap), "\"sendETHToHook()\" --value 0.001ether --private-key $PRIVATE_KEY --rpc-url $ALCHEMY_MONAD_TESTNET_URL");
        console.log("");
        console.log("To test full swap:");
        console.log("cast send", address(testSwap), "\"swapETHForUSDC()\" --value 0.001ether --private-key $PRIVATE_KEY --rpc-url $ALCHEMY_MONAD_TESTNET_URL");
        console.log("========================================");
    }
}

// ==================== EXECUTE SWAP SCRIPT ====================
contract ExecuteSwapScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address testSwapAddress = vm.envAddress("TEST_SWAP_ADDRESS");
        
        console.log("========================================");
        console.log("Executing swap through Universal Router...");
        console.log("TestSwap address:", testSwapAddress);
        console.log("========================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TestSwap(payable(testSwapAddress)).swapETHForUSDC{value: 0.001 ether}();
        
        vm.stopBroadcast();
        
        console.log("Swap executed! Check results.");
    }
}

// ==================== SEND ETH TO HOOK SCRIPT ====================
contract SendETHToHookScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address testSwapAddress = vm.envAddress("TEST_SWAP_ADDRESS");
        
        console.log("========================================");
        console.log("Sending ETH directly to hook...");
        console.log("TestSwap address:", testSwapAddress);
        console.log("========================================");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TestSwap(payable(testSwapAddress)).sendETHToHook{value: 0.001 ether}();
        
        vm.stopBroadcast();
        
        console.log("ETH sent to hook! Check hook's ETH balance.");
    }
}

// ==================== CHECK RESULTS SCRIPT ====================
contract CheckSwapResultsScript is Script {
    function run() external {
        address hook = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
        address testSwapAddress = vm.envAddress("TEST_SWAP_ADDRESS");
        
        console.log("========================================");
        console.log("Checking results...");
        console.log("========================================");
        
        // Check hook's balances
        (bool success1, bytes memory data1) = hook.staticcall(
            abi.encodeWithSignature("totalSwapFeesCollected()")
        );
        if (success1) {
            uint256 fees = abi.decode(data1, (uint256));
            console.log("Total swap fees collected:", fees / 10**6, "USDC");
        } else {
            console.log("Could not get totalSwapFeesCollected");
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
        } else {
            console.log("Could not get pool info");
        }
        
        // Check hook's ETH balance
        uint256 hookETH = hook.balance;
        console.log("Hook ETH balance:", hookETH / 1e18, "ETH");
        
        // Check hook's USDC balance
        (bool success3, bytes memory data3) = 0x31d0220469e10c4E71834a79b1f276d740d3768F.staticcall(
            abi.encodeWithSignature("balanceOf(address)", hook)
        );
        if (success3) {
            uint256 usdcBalance = abi.decode(data3, (uint256));
            console.log("Hook USDC balance:", usdcBalance / 10**6, "USDC");
        }
        
        // Check test swap contract balances
        TestSwap testSwap = TestSwap(payable(testSwapAddress));
        (uint256 ethBal, uint256 usdcBal) = testSwap.getBalances();
        console.log("TestSwap ETH balance:", ethBal / 1e18, "ETH");
        console.log("TestSwap USDC balance:", usdcBal / 10**6, "USDC");
        
        // Check allowance
        uint256 allowance = testSwap.getAllowanceForHook();
        console.log("TestSwap USDC allowance for hook:", allowance / 10**6, "USDC");
    }
}

// ==================== DEBUG HOOK SCRIPT ====================
contract DebugHookScript is Script {
    function run() external {
        address hook = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
        
        console.log("========================================");
        console.log("Debugging Hook");
        console.log("========================================");
        
        // Check if hook has code
        uint256 hookCodeSize;
        assembly {
            hookCodeSize := extcodesize(hook)
        }
        console.log("Hook code size:", hookCodeSize);
        
        if (hookCodeSize == 0) {
            console.log("ERROR: Hook has no code!");
            return;
        }
        
        // Try to call poolId
        (bool success1, bytes memory data1) = hook.staticcall(
            abi.encodeWithSignature("poolId()")
        );
        if (success1) {
            bytes32 poolId = abi.decode(data1, (bytes32));
            console.log("poolId():");
            console.logBytes32(poolId);
        } else {
            console.log("poolId() call failed");
        }
        
        // Try to call getPoolInfo
        (bool success2, bytes memory data2) = hook.staticcall(
            abi.encodeWithSignature("getPoolInfo()")
        );
        if (success2) {
            (uint256 total, uint256 apy, uint256 auction, uint256 idle, uint256 active, uint256 investors) = 
                abi.decode(data2, (uint256, uint256, uint256, uint256, uint256, uint256));
            console.log("Pool Info:");
            console.log("  Total:", total / 10**6, "USDC");
            console.log("  APY:", apy / 10**6, "USDC");
            console.log("  Auction:", auction / 10**6, "USDC");
            console.log("  Idle:", idle / 10**6, "USDC");
            console.log("  Active:", active / 10**6, "USDC");
            console.log("  Investors:", investors);
        }
        
        // Check if hook can receive ETH (has receive function)
        // We can't directly check this, but we can try to estimate gas for a transfer
        console.log("To test ETH receive, run:");
        console.log("cast send", hook, "--value 0.001ether --private-key $PRIVATE_KEY --rpc-url $ALCHEMY_MONAD_TESTNET_URL");
    }
}