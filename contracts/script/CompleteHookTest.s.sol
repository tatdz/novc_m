// script/CompleteHookTest.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IPyth {
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (
        int64 price,
        uint64 conf,
        int32 expo,
        uint256 publishTime
    );
}

interface INoVCAngelHook {
    // Constants
    function USDC() external view returns (address);
    function PERMIT2() external view returns (address);
    function PYTH_ADDR() external view returns (address);
    function ETH_USD_FEED_ID() external view returns (bytes32);
    function USDC_USD_FEED_ID() external view returns (bytes32);
    
    // Pool management
    function poolId() external view returns (bytes32);
    function getPoolInfo() external view returns (
        uint256 totalValue, 
        uint256 apySlice, 
        uint256 auctionSlice,
        uint256 idleSlice, 
        uint256 activeLiquiditySlice, 
        uint256 totalInvestors
    );
    
    // Investor functions
    function depositUSDC(uint256 amount) external;
    function depositETH() external payable;
    function withdrawUSDC(uint256 amount) external;
    function withdrawETH(uint256 amount) external;
    function allocateSlices() external;
    function recoverAccounting() external;
    function approveUSDCForPermit2() external;
    function isPermit2Approved(address user) external view returns (bool);
    
    function getInvestorInfo(address investor) external view returns (
        uint256 usdcBalance, 
        uint256 ethBalance, 
        uint256 sharePercentage,
        uint256 activeLiquidity, 
        uint256[] memory positionIds
    );
    
    // Auction functions
    function proposeAuctionInvestment(address auctionAddress, uint256 investmentAmount) external returns (uint256);
    function voteOnAuction(uint256 auctionId, bool voteFor) external;
    function executeAuction(uint256 auctionId) external;
    function executeAuctionDirect(uint256 auctionId) external;
    function claimAuctionTokens(uint256 auctionId) external;
    
    function getPoolAuctionInvestments() external view returns (uint256[] memory);
    function getAuctionDetails(uint256 auctionId) external view returns (
        address auctionAddress, 
        address auctionToken, 
        uint256 proposedAmount,
        uint256 totalInvested,
        uint256 tokensPurchased, 
        bool isActive, 
        uint256 yesVotes,
        uint256 noVotes, 
        uint256 deadline
    );
    
    function getAuctionProposal(uint256 auctionId) external view returns (
        uint256 proposedAmount,
        bool isExecuted,
        uint256 yesVotes,
        uint256 noVotes
    );
    
    function previewExecuteAuction(uint256 auctionId) external view returns (
        uint256 proposedAmount,
        uint256 floorPrice,
        uint256 tickSpacing,
        uint256 maxPrice,
        uint256 tokenAmountMicro,
        uint256 tokenAmountUSDC,
        uint256 verifyAmountMicro,
        bool mathValid,
        uint64 currentBlock,
        uint64 auctionStartBlock,
        uint64 auctionEndBlock,
        bool isActive
    );
    
    // Swap fee tracking
    function totalSwapFeesCollected() external view returns (uint256);
    function SWAP_FEE_BPS() external view returns (uint256);
    
    // Token tracking
    function getInvestorTokenBalance(address investor, address token) external view returns (uint256);
}

contract CompleteHookTest is Script {
    address constant HOOK = 0x8f93D9b74E8034FfA21bF423A43aD0A67a48BfF0;
    address constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant PYTH = 0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379;
    
    bytes32 constant ETH_USD_FEED_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    
    // Known auction addresses from your hook
    address[] AUCTIONS = [
        0x8DEf03Dc6e030D0D5Bb30Df43c9E8e9503a50158,
        0xF11856Ea3F2e7aCe4DD186E7F83C73C92f105278,
        0xfF5028D0e3974031B6ee55a11Bd79bEC394D1c44,
        0x67E553972f269BC886628b01Ea214a66238F4AD1,
        0xF0FFe2287e1311209aa1BB5c68C6909D0364F8ba,
        0xd825D662F253a777c2CA82be16fD07B7E54eBcaF
    ];
    
    INoVCAngelHook hook;
    IERC20 usdc;
    IPyth pyth;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        hook = INoVCAngelHook(HOOK);
        usdc = IERC20(USDC);
        pyth = IPyth(PYTH);
        
        console.log("========================================");
        console.log("COMPLETE HOOK TEST SUITE");
        console.log("Hook address:");
        console.logAddress(HOOK);
        console.log("Deployer:");
        console.logAddress(deployer);
        console.log("========================================");
        
        // Start broadcasting
        vm.startBroadcast(deployerPrivateKey);
        
        // TEST 1: Fix accounting first
        testRecoverAccounting();
        
        // TEST 2: Approve Permit2
        testApprovePermit2(deployer);
        
        // TEST 3: Check Pyth Oracle
        testPythOracle();
        
        // TEST 4: Deposit USDC
        testDepositUSDC(deployer);
        
        // TEST 5: Deposit ETH
        testDepositETH();
        
        // TEST 6: Check Investor Info
        testInvestorInfo(deployer);
        
        // TEST 7: Allocate Slices
        testAllocateSlices();
        
        // TEST 8: Propose Auction
        uint256 auctionId = testProposeAuction(deployer);
        
        // TEST 9: Vote on Auction
        if (auctionId > 0) {
            testVoteOnAuction(auctionId, deployer);
        }
        
        // TEST 10: Preview Execute
        testPreviewExecute();
        
        // TEST 11: Check Existing Auctions
        testCheckAuctions(deployer);
        
        // TEST 12: Claim Tokens (if any)
        testClaimTokens(deployer);
        
        // TEST 13: Check Swap Fees
        testSwapFees();
        
        // TEST 14: Withdraw Funds
        testWithdrawFunds(deployer);
        
        vm.stopBroadcast();
        
        console.log("========================================");
        console.log("ALL TESTS COMPLETE!");
        console.log("View transactions at:");
        console.log("https://unichain-sepolia.blockscout.com/address/");
        console.logAddress(HOOK);
        console.log("========================================");
    }
    
    function testRecoverAccounting() internal {
        console.log("");
        console.log("TEST 1: Recover Accounting");
        
        (uint256 totalBefore, uint256 apyBefore, uint256 auctionBefore, uint256 idleBefore, uint256 activeBefore, uint256 investorsBefore) = hook.getPoolInfo();
        
        console.log("  Before recover:");
        console.log("    Total Value:");
        console.logUint(totalBefore / 10**6);
        console.log(" USDC");
        console.log("    APY Slice:");
        console.logUint(apyBefore / 10**6);
        console.log(" USDC");
        console.log("    Auction Slice:");
        console.logUint(auctionBefore / 10**6);
        console.log(" USDC");
        console.log("    Idle Slice:");
        console.logUint(idleBefore / 10**6);
        console.log(" USDC");
        
        uint256 sumSlices = apyBefore + auctionBefore + idleBefore + activeBefore;
        if (sumSlices != totalBefore) {
            console.log("    MISMATCH! Sum slices:");
            console.logUint(sumSlices / 10**6);
            console.log(" USDC");
            
            hook.recoverAccounting();
            console.log("  Called recoverAccounting");
            
            (uint256 totalAfter, uint256 apyAfter, uint256 auctionAfter, uint256 idleAfter, , ) = hook.getPoolInfo();
            console.log("  After recover:");
            console.log("    Total Value:");
            console.logUint(totalAfter / 10**6);
            console.log(" USDC");
            console.log("    APY Slice:");
            console.logUint(apyAfter / 10**6);
            console.log(" USDC");
            console.log("    Auction Slice:");
            console.logUint(auctionAfter / 10**6);
            console.log(" USDC");
            console.log("    Idle Slice:");
            console.logUint(idleAfter / 10**6);
            console.log(" USDC");
        } else {
            console.log("  Accounting is consistent - no recover needed");
        }
    }
    
    function testApprovePermit2(address deployer) internal {
        console.log("");
        console.log("TEST 2: Approve Permit2");
        
        bool approved = hook.isPermit2Approved(deployer);
        if (approved) {
            console.log("  Permit2 already approved");
            return;
        }
        
        usdc.approve(PERMIT2, type(uint256).max);
        console.log("  Approved USDC for Permit2");
        
        hook.approveUSDCForPermit2();
        console.log("  Called approveUSDCForPermit2");
    }
    
    function testPythOracle() internal {
        console.log("");
        console.log("TEST 3: Pyth Oracle");
        
        console.log("  Pyth address:");
        console.logAddress(PYTH);
        
        // Try to get ETH price
        try pyth.getPriceNoOlderThan(ETH_USD_FEED_ID, 60) returns (
            int64 price, uint64 conf, int32 expo, uint256 publishTime
        ) {
            console.log("  ETH/USD price:");
            console.logUint(uint64(price) / 10**8);
            console.log("  Confidence:");
            console.logUint(conf);
            console.log("  Exponent:");
            console.logInt(expo);
            console.log("  Published:");
            console.logUint(publishTime);
        } catch {
            console.log("  Could not fetch Pyth price (may need older than 60s)");
        }
    }
    
    function testDepositUSDC(address deployer) internal {
        console.log("");
        console.log("TEST 4: Deposit USDC");
        
        uint256 balance = usdc.balanceOf(deployer);
        console.log("  USDC balance:");
        console.logUint(balance / 10**6);
        
        if (balance < 10 * 10**6) {
            console.log("  Insufficient USDC - skipping");
            return;
        }
        
        uint256 allowance = usdc.allowance(deployer, HOOK);
        if (allowance < 10 * 10**6) {
            usdc.approve(HOOK, 10 * 10**6);
            console.log("  Approved hook for 10 USDC");
        }
        
        hook.depositUSDC(10 * 10**6);
        console.log("  Deposited 10 USDC");
    }
    
    function testDepositETH() internal {
        console.log("");
        console.log("TEST 5: Deposit ETH");
        
        uint256 depositAmount = 0.001 ether;
        hook.depositETH{value: depositAmount}();
        console.log("  Deposited 0.001 ETH");
    }
    
    function testInvestorInfo(address deployer) internal {
        console.log("");
        console.log("TEST 6: Investor Info");
        
        (uint256 usdcBal, uint256 ethBal, uint256 sharePct, uint256 activeLiq, uint256[] memory posIds) = hook.getInvestorInfo(deployer);
        
        console.log("  USDC in pool:");
        console.logUint(usdcBal / 10**6);
        console.log("  ETH in pool:");
        console.logUint(ethBal / 1e18);
        console.log("  Share percentage:");
        console.logUint(sharePct / 100);
        console.log("%");
        console.log("  Active liquidity:");
        console.logUint(activeLiq / 10**6);
        console.log("  Position IDs count:");
        console.logUint(posIds.length);
    }
    
    function testAllocateSlices() internal {
        console.log("");
        console.log("TEST 7: Allocate Slices");
        
        (uint256 totalValue, , , uint256 idleSlice, , ) = hook.getPoolInfo();
        console.log("  Idle slice:");
        console.logUint(idleSlice / 10**6);
        console.log(" USDC");
        
        if (idleSlice == 0) {
            console.log("  No idle funds to allocate");
            return;
        }
        
        hook.allocateSlices();
        console.log("  Allocated slices");
        
        (uint256 totalAfter, uint256 apyAfter, uint256 auctionAfter, uint256 idleAfter, , ) = hook.getPoolInfo();
        console.log("  After allocation:");
        console.log("    APY slice:");
        console.logUint(apyAfter / 10**6);
        console.log(" USDC");
        console.log("    Auction slice:");
        console.logUint(auctionAfter / 10**6);
        console.log(" USDC");
        console.log("    Idle slice:");
        console.logUint(idleAfter / 10**6);
        console.log(" USDC");
    }
    
    function testProposeAuction(address deployer) internal returns (uint256) {
        console.log("");
        console.log("TEST 8: Propose Auction");
        
        (uint256 usdcBal, uint256 ethBal, uint256 sharePct, , ) = hook.getInvestorInfo(deployer);
        if (sharePct == 0) {
            console.log("  No voting power - skipping");
            return 0;
        }
        
        (, , uint256 auctionSlice, , , ) = hook.getPoolInfo();
        console.log("  Auction slice available:");
        console.logUint(auctionSlice / 10**6);
        console.log(" USDC");
        
        if (auctionSlice < 5 * 10**6) {
            console.log("  Auction slice too small - skipping");
            return 0;
        }
        
        // Try each auction until one works
        for (uint i = 0; i < AUCTIONS.length; i++) {
            address auctionAddr = AUCTIONS[i];
            console.log("  Trying auction:");
            console.logUint(i+1);
            console.log("  Address:");
            console.logAddress(auctionAddr);
            
            try hook.proposeAuctionInvestment(auctionAddr, 5 * 10**6) returns (uint256 newId) {
                console.log("  Success! Auction ID:");
                console.logUint(newId);
                return newId;
            } catch {
                console.log("  Failed - may already be proposed");
            }
        }
        
        console.log("  Could not propose any auction");
        return 0;
    }
    
    function testVoteOnAuction(uint256 auctionId, address deployer) internal {
        console.log("");
        console.log("TEST 9: Vote on Auction");
        console.log("Auction ID:");
        console.logUint(auctionId);
        
        (
            address auctionAddr,
            address auctionToken,
            uint256 proposed,
            uint256 totalInvested,
            uint256 tokensPurchased,
            bool isActive,
            uint256 yesVotes,
            uint256 noVotes,
            uint256 deadline
        ) = hook.getAuctionDetails(auctionId);
        
        console.log("  Auction address:");
        console.logAddress(auctionAddr);
        console.log("  Auction token:");
        console.logAddress(auctionToken);
        console.log("  Proposed:");
        console.logUint(proposed / 10**6);
        console.log(" USDC");
        console.log("  Invested:");
        console.logUint(totalInvested / 10**6);
        console.log(" USDC");
        console.log("  Tokens purchased:");
        console.logUint(tokensPurchased / 1e18);
        console.log("  Active:");
        console.logBool(isActive);
        console.log("  Current YES:");
        console.logUint(yesVotes / 100);
        console.log("%");
        console.log("  Current NO:");
        console.logUint(noVotes / 100);
        console.log("%");
        console.log("  Deadline:");
        console.logUint(deadline);
        
        if (!isActive) {
            console.log("  Auction not active - skipping vote");
            return;
        }
        
        if (block.timestamp > deadline) {
            console.log("  Voting deadline passed - skipping");
            return;
        }
        
        hook.voteOnAuction(auctionId, true);
        console.log("  Voted YES");
        
        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 newYes,
            uint256 newNo,
            
        ) = hook.getAuctionDetails(auctionId);
        
        console.log("  Updated YES:");
        console.logUint(newYes / 100);
        console.log("%");
        console.log("  Updated NO:");
        console.logUint(newNo / 100);
        console.log("%");
    }
    
    function testPreviewExecute() internal {
        console.log("");
        console.log("TEST 10: Preview Execute");
        
        uint256[] memory auctionIds = hook.getPoolAuctionInvestments();
        console.log("  Total auctions:");
        console.logUint(auctionIds.length);
        
        for (uint i = 0; i < auctionIds.length; i++) {
            uint256 id = auctionIds[i];
            console.log("");
            console.log("  Auction ID:");
            console.logUint(id);
            
            try hook.previewExecuteAuction(id) returns (
                uint256 proposed,
                uint256 floor,
                uint256 tick,
                uint256 max,
                uint256 tokenMicro,
                uint256 tokenUSDC,
                uint256 verify,
                bool valid,
                uint64 current,
                uint64 start,
                uint64 end,
                bool active
            ) {
                console.log("    Math valid:");
                console.logBool(valid);
                console.log("    Active:");
                console.logBool(active);
                if (valid && active) {
                    console.log("    Proposed:");
                    console.logUint(proposed / 10**6);
                    console.log(" USDC");
                    console.log("    Token amount:");
                    console.logUint(tokenUSDC / 10**6);
                }
            } catch {
                console.log("    Could not preview auction");
            }
        }
    }
    
    function testCheckAuctions(address deployer) internal {
        console.log("");
        console.log("TEST 11: Check Auctions");
        
        uint256[] memory auctionIds = hook.getPoolAuctionInvestments();
        console.log("  Total auctions:");
        console.logUint(auctionIds.length);
        
        for (uint i = 0; i < auctionIds.length; i++) {
            uint256 id = auctionIds[i];
            console.log("");
            console.log("  Auction ID:");
            console.logUint(id);
            
            (
                address auctionAddr,
                address tokenAddr,
                uint256 proposed,
                uint256 invested,
                uint256 tokens,
                bool isActive,
                uint256 yesVotes,
                uint256 noVotes,
                
            ) = hook.getAuctionDetails(id);
            
            console.log("    Address:");
            console.logAddress(auctionAddr);
            console.log("    Token:");
            console.logAddress(tokenAddr);
            console.log("    Proposed:");
            console.logUint(proposed / 10**6);
            console.log(" USDC");
            console.log("    Invested:");
            console.logUint(invested / 10**6);
            console.log(" USDC");
            console.log("    Tokens:");
            console.logUint(tokens / 1e18);
            console.log("    Active:");
            console.logBool(isActive);
            console.log("    YES:");
            console.logUint(yesVotes / 100);
            console.log("%");
            console.log("    NO:");
            console.logUint(noVotes / 100);
            console.log("%");
            
            // Try to execute if threshold reached
            if (isActive && yesVotes >= 6000) {
                console.log("    Threshold reached - attempting execute");
                try hook.executeAuction(id) {
                    console.log("    Executed auction");
                    console.logUint(id);
                } catch {
                    console.log("    Execute failed");
                }
            }
            
            // Check if user has tokens from this auction
            uint256 tokenBalance = hook.getInvestorTokenBalance(deployer, tokenAddr);
            if (tokenBalance > 0) {
                console.log("    You have tokens:");
                console.logUint(tokenBalance / 1e18);
            }
        }
    }
    
    function testClaimTokens(address deployer) internal {
        console.log("");
        console.log("TEST 12: Claim Tokens");
        
        uint256[] memory auctionIds = hook.getPoolAuctionInvestments();
        
        for (uint i = 0; i < auctionIds.length; i++) {
            uint256 id = auctionIds[i];
            (
                ,
                address tokenAddr,
                ,
                uint256 invested,
                uint256 tokensPurchased,
                bool isActive,
                ,
                ,
                
            ) = hook.getAuctionDetails(id);
            
            if (!isActive && invested > 0 && tokensPurchased == 0) {
                console.log("  Claimable auction:");
                console.logUint(id);
                
                try hook.claimAuctionTokens(id) {
                    console.log("  Claimed tokens from auction");
                    
                    uint256 balance = hook.getInvestorTokenBalance(deployer, tokenAddr);
                    console.log("  Token balance now:");
                    console.logUint(balance / 1e18);
                } catch {
                    console.log("  Claim failed for auction");
                    console.logUint(id);
                }
            }
        }
    }
    
    function testSwapFees() internal {
        console.log("");
        console.log("TEST 13: Swap Fees");
        
        uint256 totalFees = hook.totalSwapFeesCollected();
        uint256 feeBPS = hook.SWAP_FEE_BPS();
        
        console.log("  Total swap fees collected:");
        console.logUint(totalFees / 10**6);
        console.log(" USDC");
        console.log("  Fee basis points:");
        console.logUint(feeBPS);
    }
    
    function testWithdrawFunds(address deployer) internal {
        console.log("");
        console.log("TEST 14: Withdraw Funds");
        
        (uint256 usdcBal, uint256 ethBal, , , ) = hook.getInvestorInfo(deployer);
        
        console.log("  Available to withdraw:");
        console.log("    USDC:");
        console.logUint(usdcBal / 10**6);
        console.log("    ETH:");
        console.logUint(ethBal / 1e18);
        
        if (usdcBal >= 1 * 10**6) {
            hook.withdrawUSDC(1 * 10**6);
            console.log("  Withdrew 1 USDC");
        }
        
        if (ethBal >= 0.0001 ether) {
            hook.withdrawETH(0.0001 ether);
            console.log("  Withdrew 0.0001 ETH");
        }
        
        // Final investor info
        (uint256 usdcAfter, uint256 ethAfter, uint256 shareAfter, , ) = hook.getInvestorInfo(deployer);
        console.log("  Remaining in pool:");
        console.log("    USDC:");
        console.logUint(usdcAfter / 10**6);
        console.log("    ETH:");
        console.logUint(ethAfter / 1e18);
        console.log("    Share:");
        console.logUint(shareAfter / 100);
        console.log("%");
    }
}