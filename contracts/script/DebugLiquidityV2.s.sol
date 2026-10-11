// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

// Complete IERC20 interface
interface IERC20 {
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

contract DebugLiquidityV2 {
    address public constant POOL_MODIFY_TEST = 0x5fa728C0A5cfd51BEe4B060773f50554c0C8A7AB;
    address public constant USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;
    address public constant HOOK = 0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0;
    
    event Log(string message);
    event LogUint(string label, uint256 value);
    event LogInt(string label, int256 value);
    event LogBytes(bytes data);
    event LogAddress(string label, address addr);
    
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
        
        emit Log("Step 1: Checking USDC balance");
        uint256 balance = IERC20(USDC).balanceOf(msg.sender);
        emit LogUint("Sender USDC balance", balance);
        require(balance >= usdcAmount, "Insufficient USDC");
        
        emit Log("Step 2: Checking allowance");
        uint256 allowance = IERC20(USDC).allowance(msg.sender, address(this));
        emit LogUint("Allowance", allowance);
        require(allowance >= usdcAmount, "Insufficient allowance");
        
        emit Log("Step 3: Transferring USDC");
        IERC20(USDC).transferFrom(msg.sender, address(this), usdcAmount);
        
        emit Log("Step 4: Checking contract USDC balance");
        uint256 contractBalance = IERC20(USDC).balanceOf(address(this));
        emit LogUint("Contract USDC balance", contractBalance);
        
        emit Log("Step 5: Approving USDC for test contract");
        IERC20(USDC).approve(POOL_MODIFY_TEST, usdcAmount);
        
        emit Log("Step 6: Getting pool key");
        PoolKey memory key = getPoolKey();
        
        // Try a very simple tick range
        int24 tickLower = -60;
        int24 tickUpper = 60;
        int256 liquidityDelta = 1000000;
        
        emit LogInt("tickLower", tickLower);
        emit LogInt("tickUpper", tickUpper);
        emit LogInt("liquidityDelta", liquidityDelta);
        
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityDelta: liquidityDelta,
            salt: bytes32(0)
        });
        
        emit Log("Step 7: Calling modifyLiquidity");
        
        (bool success, bytes memory returnData) = POOL_MODIFY_TEST.call{value: msg.value}(
            abi.encodeWithSignature(
                "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes,bool,bool)",
                key,
                params,
                new bytes(0),
                false,
                false
            )
        );
        
        if (!success) {
            emit Log("Step 8: Call failed");
            emit LogBytes(returnData);
            
            if (returnData.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(returnData, 0x20))
                }
                emit LogUint("Error selector", uint256(uint32(selector)));
                
                // Try to decode as string
                if (returnData.length >= 68) {
                    uint256 length;
                    assembly {
                        length := mload(add(returnData, 0x24))
                    }
                    if (length > 0 && length < 100) {
                        string memory reason = new string(length);
                        for (uint256 i = 0; i < length; i++) {
                            bytes1 char;
                            assembly {
                                char := mload(add(add(returnData, 0x44), i))
                            }
                            bytes(reason)[i] = char;
                        }
                        emit Log("Revert reason:");
                        emit Log(reason);
                    }
                }
            }
            revert("modifyLiquidity failed");
        }
        
        emit Log("Step 8: Call succeeded");
        (int256 amount0, int256 amount1) = abi.decode(returnData, (int256, int256));
        emit LogInt("amount0", amount0);
        emit LogInt("amount1", amount1);
    }
    
    receive() external payable {}
}

contract DeployDebugV2 is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        DebugLiquidityV2 debug = new DebugLiquidityV2();
        vm.stopBroadcast();
        console.log("DebugLiquidityV2 deployed at:", address(debug));
    }
}