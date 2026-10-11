// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPermit2 {
    struct PermitDetails {
        address token;
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }
    
    struct PermitSingle {
        PermitDetails details;
        address spender;
        uint256 sigDeadline;
    }
    
    function permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature) external;
    function transferFrom(address from, address to, uint160 amount, address token) external;
    function allowance(address owner, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce);
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price);
}

interface IContinuousClearingAuction {
    function submitBid(
        uint256 _maxPrice,
        uint128 _amount,
        address _owner,
        uint256 _prevTickPrice,
        bytes calldata _hookData
    ) external payable returns (uint256);
    
    function submitBid(
        uint256 _maxPrice,
        uint128 _amount,
        address _owner,
        bytes calldata _hookData
    ) external payable returns (uint256);
    
    function exitBid(uint256 bidId) external;
    function claimTokens(uint256 bidId) external;
    function clearingPrice() external view returns (uint256);
    function currency() external view returns (address);
    function token() external view returns (address);
    function isGraduated() external view returns (bool);
    function endBlock() external view returns (uint64);
    function floorPrice() external view returns (uint256);
    function tickSpacing() external view returns (uint256);
    function startBlock() external view returns (uint64);
}

type Currency is address;
type PoolId is bytes32;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

type BalanceDelta is int256;
type BeforeSwapDelta is int256;

interface IPoolManager {
    struct ModifyLiquidityParams {
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
        bytes32 salt;
    }
    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }
}

abstract contract BaseHookMinimal {
    IPoolManager public immutable poolManager;

    error HookAddressNotValid(address hooks);

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        
        uint160 addr = uint160(address(this));
        uint160 flags = uint160(
            (1 << 13) | (1 << 12) | (1 << 11) | (1 << 10) |
            (1 << 9)  | (1 << 8)  | (1 << 7)  | (1 << 6) |
            (1 << 5)  | (1 << 4)
        );
        
        if (address(this) != address(0) && (addr & flags) != flags) {
            revert HookAddressNotValid(address(this));
        }
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external virtual returns (bytes4) {
        return this.beforeInitialize.selector;
    }
    
    function afterInitialize(address, PoolKey calldata, uint160, int24) external virtual returns (bytes4) {
        return this.afterInitialize.selector;
    }
    
    function beforeAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external virtual returns (bytes4) {
        return this.beforeAddLiquidity.selector;
    }
    
    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external virtual returns (bytes4, BalanceDelta) {
        return (this.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }
    
    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external virtual returns (bytes4) {
        return this.beforeRemoveLiquidity.selector;
    }
    
    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external virtual returns (bytes4, BalanceDelta) {
        return (this.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }
    
    function beforeSwap(
        address,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) external virtual returns (bytes4, BeforeSwapDelta, uint24) {
        return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
    }
    
    function afterSwap(
        address,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) external virtual returns (bytes4, int128) {
        return (this.afterSwap.selector, 0);
    }
    
    function beforeDonate(
        address,
        PoolKey calldata,
        uint256,
        uint256,
        bytes calldata
    ) external virtual returns (bytes4) {
        return this.beforeDonate.selector;
    }
    
    function afterDonate(
        address,
        PoolKey calldata,
        uint256,
        uint256,
        bytes calldata
    ) external virtual returns (bytes4) {
        return this.afterDonate.selector;
    }
}

// ReentrancyGuard implemented directly to avoid inheritance issues
contract NoVCAngelHookV2 is BaseHookMinimal, IERC721Receiver {
    // Constants
    address public constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address public constant PYTH_ADDR = 0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379;
    address public constant NATIVE_MON = address(0);
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    bytes32 public constant ETH_USD_FEED_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 public constant USDC_USD_FEED_ID = 0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a;

    uint256 public constant APY_SLICE_PERCENT = 3000;
    uint256 public constant AUCTION_SLICE_PERCENT = 7000;
    uint256 public constant VOTING_THRESHOLD = 6000;
    uint24 public constant DEFAULT_FEE = 3000;
    int24 public constant DEFAULT_TICK_SPACING = 60;
    uint256 public constant MIN_ETH_DEPOSIT = 0.0001 ether;
    uint256 public constant MIN_USDC_DEPOSIT = 1e6;

    uint256 private constant Q96 = 2**96;
    uint256 private constant MAX_REASONABLE_PRICE_Q96 = 1e36;

    IPyth public immutable pyth;

    // ReentrancyGuard implemented directly
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    struct Investor {
        address wallet;
        uint256 usdcContributed;
        uint256 ethContributed;
        uint256 sharePercentage;
        uint256 activeLiquidity;
        uint256 lastVoteAuctionId;
        uint256[] positionTokenIds;
        mapping(address => uint256) tokenBalances;
    }

    struct PoolAllocation {
        uint256 totalValue;
        uint256 apySlice;
        uint256 auctionSlice;
        uint256 idleSlice;
        uint256 activeLiquiditySlice;
        uint256 totalInvestors;
    }

    struct AuctionInvestment {
        uint256 auctionId;
        address auctionAddress;
        address auctionToken;
        uint256 proposedAmount;
        uint256 totalInvestedUSDC;
        uint256 tokensPurchased;
        uint256 bidId;
        bool isActive;
        bool isExecuted;
        bool tokensClaimed;
        uint256 voteDeadline;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 clearingPriceAtInvestment;
        bytes32 poolIdRef;
    }

    struct InvestorAuctionShare {
        address investor;
        uint256 sharePercentage;
        uint256 claimedTokens;
        bool hasVoted;
        bool voteFor;
    }

    // State variables
    bytes32 public poolId;
    PoolAllocation public poolAllocation;
    mapping(address => Investor) public investors;
    address[] public investorList;
    mapping(uint256 => AuctionInvestment) public auctionInvestments;
    uint256[] public poolAuctionInvestments;
    mapping(uint256 => InvestorAuctionShare[]) public auctionInvestorShares;
    uint256 public nextAuctionId;
    mapping(address => bool) public usdcApprovedForPermit2;

    // Events
    event InvestorDeposited(address indexed investor, uint256 usdcAmount, uint256 ethAmount, uint256 share);
    event AuctionProposed(uint256 indexed auctionId, address indexed auction, uint256 proposedAmount, uint256 deadline);
    event AuctionVoted(uint256 indexed auctionId, address indexed voter, bool voteFor, uint256 votes);
    event AuctionExecuted(uint256 indexed auctionId, address indexed auction, uint256 amount, uint256 bidId);
    event AuctionTokensClaimed(uint256 indexed auctionId, address indexed token, uint256 totalTokens);
    event TokensDistributed(uint256 indexed auctionId, address indexed investor, address indexed token, uint256 amount);
    event Withdrawal(address indexed investor, address indexed token, uint256 amount);
    event PoolCreated(bytes32 indexed poolId, address indexed creator);
    event SlicesAllocated(uint256 apyAmount, uint256 auctionAmount);
    event USDCApproved(address indexed auction, uint256 amount);
    event Permit2Approved(address indexed investor);
    event ThresholdReached(uint256 indexed auctionId, uint256 yesVotes);
    event BidNFTReceived(uint256 indexed auctionId, uint256 indexed bidId, address indexed from);
    event AccountingRecovered(uint256 oldTotal, uint256 newTotal, uint256 addedToIdle);
    event DebugExecuteAuction(
        uint256 auctionId,
        uint256 proposedAmount,
        uint256 floorPrice,
        uint256 tickSpacing,
        uint256 maxPrice,
        uint256 tokenAmountMicro,
        uint256 verifyAmountMicro,
        uint256 hookBalanceBefore,
        uint256 hookBalanceAfter,
        uint64 currentBlock,
        uint64 auctionStartBlock,
        uint64 auctionEndBlock,
        bool isActive,
        bool success
    );

    // Errors
    error NotInvestor();
    error AlreadyVoted();
    error VotingEnded();
    error InsufficientVotingPower();
    error NotEnoughAuctionFunds();
    error AuctionNotActive();
    error AuctionAlreadyExecuted();
    error InvalidAmount();
    error TransferFailed();
    error PoolNotCreated();
    error BelowMinimum();
    error InvalidAuctionParameters();
    error AuctionAlreadyProposed();
    error USDCApproveFailed();
    error Permit2ApproveFailed();
    error AuctionNotEnded();
    error TokensAlreadyClaimed();
    error OnlyEOA();
    error ThresholdNotReached();
    error InvalidAuctionAddress();
    error InvalidMaxPrice();
    error InsufficientAllowance();
    error InsufficientPermit2Allowance();
    error TransferFromFailed();
    error PrecisionLoss();
    error TotalValueMismatch();
    error TransferAmountMismatch();
    error AuctionEnded();
    error AuctionNotStarted();
    error Permit2NotApproved();
    error ReentrancyGuardReentrantCall();

    modifier nonReentrant() {
        if (_status == ENTERED) revert ReentrancyGuardReentrantCall();
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }

    modifier onlyInvestor() {
        if (investors[msg.sender].sharePercentage == 0) revert NotInvestor();
        _;
    }

    modifier poolExists() {
        if (poolId == bytes32(0)) revert PoolNotCreated();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _pythContract
    ) BaseHookMinimal(_poolManager) {
        pyth = IPyth(_pythContract);
        nextAuctionId = 1;
        _status = NOT_ENTERED;
        
        // Initialize poolAllocation to prevent any storage issues
        poolAllocation = PoolAllocation({
            totalValue: 0,
            apySlice: 0,
            auctionSlice: 0,
            idleSlice: 0,
            activeLiquiditySlice: 0,
            totalInvestors: 0
        });
    }

    function getActualContractBlockNumber() internal view returns (uint256 blockNumber) {
        assembly {
            blockNumber := number()
        }
    }

    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        emit BidNFTReceived(tokenId, tokenId, from);
        return IERC721Receiver.onERC721Received.selector;
    }

    // ============ UNISWAP V4 HOOK IMPLEMENTATIONS ============
    
    function beforeInitialize(
        address,
        PoolKey calldata,
        uint160
    ) external pure override returns (bytes4) {
        return this.beforeInitialize.selector;
    }
    
    function afterInitialize(
        address,
        PoolKey calldata,
        uint160,
        int24
    ) external pure override returns (bytes4) {
        return this.afterInitialize.selector;
    }

    function beforeAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.beforeAddLiquidity.selector;
    }
    
    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        return (this.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.beforeRemoveLiquidity.selector;
    }
    
    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        return (this.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeSwap(
        address,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        bytes calldata
    ) external pure override returns (bytes4, BeforeSwapDelta, uint24) {
        return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
    }
    
    uint256 public constant SWAP_FEE_BPS = 5;
    uint256 public totalSwapFeesCollected;
    
    event SwapFeesCaptured(uint256 feeAmount, bool isToken0, uint256 ethPrice, uint256 newApySlice);
    
    function _computePoolId(PoolKey calldata key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }
    
    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external override returns (bytes4, int128) {
        if (poolId == bytes32(0) || _computePoolId(key) != poolId) {
            return (this.afterSwap.selector, 0);
        }
        
        if (poolAllocation.totalValue == 0) {
            return (this.afterSwap.selector, 0);
        }
        
        int256 rawDelta = int256(BalanceDelta.unwrap(delta));
        int128 amount0 = int128(rawDelta >> 128);
        int128 amount1 = int128(rawDelta);
        
        int128 unspecifiedAmount;
        bool isUSDCOutput;
        
        if (params.zeroForOne) {
            unspecifiedAmount = amount1;
            isUSDCOutput = Currency.unwrap(key.currency1) == USDC;
        } else {
            unspecifiedAmount = amount0;
            isUSDCOutput = Currency.unwrap(key.currency0) == USDC;
        }
        
        if (unspecifiedAmount >= 0) {
            return (this.afterSwap.selector, 0);
        }
        
        uint256 absOutput = uint256(uint128(-unspecifiedAmount));
        uint256 feeInOutputToken = (absOutput * SWAP_FEE_BPS) / 10000;
        
        if (feeInOutputToken == 0) {
            return (this.afterSwap.selector, 0);
        }
        
        uint256 usdcEquivalent;
        if (isUSDCOutput) {
            usdcEquivalent = feeInOutputToken;
        } else {
            uint256 ethPrice = _getNormalizedETHPrice();
            usdcEquivalent = (feeInOutputToken * ethPrice) / 1e8;
            usdcEquivalent = usdcEquivalent / 1e12;
        }
        
        if (usdcEquivalent > 0) {
            poolAllocation.apySlice += usdcEquivalent;
            poolAllocation.totalValue += usdcEquivalent;
            totalSwapFeesCollected += usdcEquivalent;
            
            uint256 ethPrice = _getNormalizedETHPrice();
            emit SwapFeesCaptured(usdcEquivalent, !params.zeroForOne, ethPrice, poolAllocation.apySlice);
        }
        
        return (this.afterSwap.selector, int128(uint128(feeInOutputToken)));
    }
    
    function beforeDonate(
        address,
        PoolKey calldata,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.beforeDonate.selector;
    }
    
    function afterDonate(
        address,
        PoolKey calldata,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.afterDonate.selector;
    }

    // ============ CORE FUNCTIONS ============

    function approveUSDCForPermit2() external {
        if (!IERC20(USDC).approve(PERMIT2, type(uint256).max)) {
            revert USDCApproveFailed();
        }
        usdcApprovedForPermit2[msg.sender] = true;
        emit Permit2Approved(msg.sender);
    }

    function isPermit2Approved(address user) external view returns (bool) {
        return usdcApprovedForPermit2[user];
    }

    function approveAuctionUSDC(address auctionAddress, uint256 amount) external onlyInvestor poolExists {
        if (!IERC20(USDC).approve(auctionAddress, amount)) {
            revert USDCApproveFailed();
        }
        emit USDCApproved(auctionAddress, amount);
    }

    function createAngelPool() external nonReentrant returns (bytes32) {
        if (poolId != bytes32(0)) revert("Pool already created");
        
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(USDC),
            currency1: Currency.wrap(NATIVE_MON),
            fee: DEFAULT_FEE,
            tickSpacing: DEFAULT_TICK_SPACING,
            hooks: address(this)
        });
        
        bytes32 newPoolId = keccak256(abi.encode(key));
        poolId = newPoolId;
        
        // Initialize the entire struct at once
        poolAllocation = PoolAllocation({
            totalValue: 0,
            apySlice: 0,
            auctionSlice: 0,
            idleSlice: 0,
            activeLiquiditySlice: 0,
            totalInvestors: 0
        });
        
        emit PoolCreated(newPoolId, msg.sender);
        return newPoolId;
    }

    function depositUSDC(uint256 amount) external nonReentrant poolExists {
        if (amount < MIN_USDC_DEPOSIT) revert BelowMinimum();
        
        bool success = IERC20(USDC).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        
        _updateInvestor(msg.sender, amount, 0);
        
        poolAllocation.idleSlice += amount;
        poolAllocation.totalValue += amount;
        
        _recalculateShares();
        
        emit InvestorDeposited(msg.sender, amount, 0, investors[msg.sender].sharePercentage);
    }

    function depositETH() external payable nonReentrant poolExists {
        if (msg.value < MIN_ETH_DEPOSIT) revert BelowMinimum();
        
        uint256 ethPrice = _getNormalizedETHPrice();
        uint256 usdcValue = (msg.value * ethPrice) / 1e20;
        
        _updateInvestor(msg.sender, 0, msg.value);
        
        poolAllocation.idleSlice += usdcValue;
        poolAllocation.totalValue += usdcValue;
        
        _recalculateShares();
        
        emit InvestorDeposited(msg.sender, 0, msg.value, investors[msg.sender].sharePercentage);
    }

    function allocateSlices() external nonReentrant poolExists {
        uint256 idleAmount = poolAllocation.idleSlice;
        if (idleAmount == 0) revert("No idle funds");
        
        uint256 apyAmount = (idleAmount * APY_SLICE_PERCENT) / 10000;
        uint256 auctionAmount = (idleAmount * AUCTION_SLICE_PERCENT) / 10000;
        
        uint256 totalAllocated = apyAmount + auctionAmount;
        require(totalAllocated <= idleAmount, "Allocation overflow");
        
        poolAllocation.apySlice += apyAmount;
        poolAllocation.auctionSlice += auctionAmount;
        poolAllocation.idleSlice = idleAmount - totalAllocated;
        
        uint256 newTotal = poolAllocation.apySlice + poolAllocation.auctionSlice + 
                          poolAllocation.idleSlice + poolAllocation.activeLiquiditySlice;
        
        if (newTotal != poolAllocation.totalValue) {
            revert TotalValueMismatch();
        }
        
        _recalculateShares();
        
        emit SlicesAllocated(apyAmount, auctionAmount);
    }

    function recoverAccounting() external onlyInvestor poolExists {
        uint256 oldTotal = poolAllocation.totalValue;
        uint256 actualBalance = IERC20(USDC).balanceOf(address(this));
        
        uint256 sumSlices = poolAllocation.apySlice + poolAllocation.auctionSlice + 
                            poolAllocation.idleSlice + poolAllocation.activeLiquiditySlice;
        
        if (actualBalance > sumSlices) {
            uint256 difference = actualBalance - sumSlices;
            poolAllocation.idleSlice += difference;
        } else if (actualBalance < sumSlices) {
            uint256 difference = sumSlices - actualBalance;
            if (poolAllocation.idleSlice >= difference) {
                poolAllocation.idleSlice -= difference;
            } else {
                poolAllocation = PoolAllocation({
                    totalValue: actualBalance,
                    apySlice: 0,
                    auctionSlice: 0,
                    idleSlice: actualBalance,
                    activeLiquiditySlice: 0,
                    totalInvestors: poolAllocation.totalInvestors
                });
            }
        }
        
        poolAllocation.totalValue = actualBalance;
        
        uint256 newSum = poolAllocation.apySlice + poolAllocation.auctionSlice + 
                         poolAllocation.idleSlice + poolAllocation.activeLiquiditySlice;
        
        require(newSum == poolAllocation.totalValue, "Recovery failed");
        
        _recalculateShares();
        
        emit AccountingRecovered(oldTotal, poolAllocation.totalValue, 
                                 poolAllocation.idleSlice);
    }

    function withdrawUSDC(uint256 amount) external nonReentrant poolExists {
        Investor storage inv = investors[msg.sender];
        if (inv.usdcContributed < amount) revert("Insufficient USDC");

        inv.usdcContributed -= amount;
        _subtractFromSlices(amount);
        poolAllocation.totalValue -= amount;

        bool success = IERC20(USDC).transfer(msg.sender, amount);
        if (!success) revert TransferFailed();
        
        _recalculateShares();
        
        emit Withdrawal(msg.sender, USDC, amount);
    }

    function withdrawETH(uint256 amount) external nonReentrant poolExists {
        Investor storage inv = investors[msg.sender];
        if (inv.ethContributed < amount) revert("Insufficient ETH");

        uint256 ethPrice = _getNormalizedETHPrice();
        uint256 usdcValue = (amount * ethPrice) / 1e20;

        inv.ethContributed -= amount;
        _subtractFromSlices(usdcValue);
        poolAllocation.totalValue -= usdcValue;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
        
        _recalculateShares();
        
        emit Withdrawal(msg.sender, NATIVE_MON, amount);
    }

    function _subtractFromSlices(uint256 amount) internal {
        uint256 remaining = amount;

        if (poolAllocation.idleSlice >= remaining) {
            poolAllocation.idleSlice -= remaining;
            return;
        }
        remaining -= poolAllocation.idleSlice;
        poolAllocation.idleSlice = 0;

        if (poolAllocation.auctionSlice >= remaining) {
            poolAllocation.auctionSlice -= remaining;
            return;
        }
        remaining -= poolAllocation.auctionSlice;
        poolAllocation.auctionSlice = 0;

        if (poolAllocation.apySlice >= remaining) {
            poolAllocation.apySlice -= remaining;
            return;
        }
        remaining -= poolAllocation.apySlice;
        poolAllocation.apySlice = 0;

        if (poolAllocation.activeLiquiditySlice < remaining) revert("Funds locked");
        poolAllocation.activeLiquiditySlice -= remaining;
    }

    function proposeAuctionInvestment(address auctionAddress, uint256 investmentAmount) 
        external 
        nonReentrant 
        poolExists
        returns (uint256) 
    {
        Investor storage inv = investors[msg.sender];
        if (inv.sharePercentage == 0) revert InsufficientVotingPower();
        
        IContinuousClearingAuction auction = IContinuousClearingAuction(auctionAddress);
        
        if (auction.currency() != USDC) revert("Auction must use USDC");
        if (auction.isGraduated()) revert("Auction already graduated");
        
        uint256 floorPrice = auction.floorPrice();
        uint256 tickSpacing = auction.tickSpacing();
        
        for (uint256 i = 0; i < poolAuctionInvestments.length; i++) {
            AuctionInvestment storage existing = auctionInvestments[poolAuctionInvestments[i]];
            if (existing.auctionAddress == auctionAddress && existing.isActive) {
                revert AuctionAlreadyProposed();
            }
        }
        
        if (floorPrice == 0) revert InvalidAuctionParameters();
        if (tickSpacing == 0) revert InvalidAuctionParameters();
        if (floorPrice > MAX_REASONABLE_PRICE_Q96) revert InvalidAuctionParameters();
        if (tickSpacing > MAX_REASONABLE_PRICE_Q96) revert InvalidAuctionParameters();
        
        if (poolAllocation.auctionSlice < investmentAmount) revert NotEnoughAuctionFunds();
        if (investmentAmount == 0) revert InvalidAmount();

        uint256 auctionId = nextAuctionId++;
        
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        investment.auctionId = auctionId;
        investment.auctionAddress = auctionAddress;
        investment.auctionToken = auction.token();
        investment.proposedAmount = investmentAmount;
        investment.isActive = true;
        investment.isExecuted = false;
        investment.voteDeadline = block.timestamp + 3 days;
        investment.clearingPriceAtInvestment = auction.clearingPrice();
        investment.poolIdRef = poolId;
        
        poolAuctionInvestments.push(auctionId);
        poolAllocation.auctionSlice -= investmentAmount;
        
        emit AuctionProposed(auctionId, auctionAddress, investmentAmount, investment.voteDeadline);
        
        return auctionId;
    }

    function voteOnAuction(uint256 auctionId, bool voteFor) external nonReentrant poolExists {
        Investor storage voter = investors[msg.sender];
        if (voter.sharePercentage == 0) revert InsufficientVotingPower();
        
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        if (!investment.isActive) revert AuctionNotActive();
        if (investment.isExecuted) revert AuctionAlreadyExecuted();
        if (block.timestamp > investment.voteDeadline) revert VotingEnded();
        if (investment.poolIdRef != poolId) revert("Auction not from this pool");
        if (voter.lastVoteAuctionId == auctionId) revert AlreadyVoted();
        
        voter.lastVoteAuctionId = auctionId;

        InvestorAuctionShare memory share = InvestorAuctionShare({
            investor: msg.sender,
            sharePercentage: voter.sharePercentage,
            claimedTokens: 0,
            hasVoted: true,
            voteFor: voteFor
        });
        
        auctionInvestorShares[auctionId].push(share);
        
        if (voteFor) {
            investment.yesVotes += voter.sharePercentage;
        } else {
            investment.noVotes += voter.sharePercentage;
        }
        
        emit AuctionVoted(auctionId, msg.sender, voteFor, voter.sharePercentage);

        if (investment.yesVotes >= VOTING_THRESHOLD) {
            emit ThresholdReached(auctionId, investment.yesVotes);
        }
    }

    // Works with auction's permit2TransferFrom requirement
    function executeAuction(uint256 auctionId) external nonReentrant poolExists {
        if (msg.sender != tx.origin) revert OnlyEOA();
        
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        
        if (investment.auctionAddress == address(0)) revert("Investment does not exist");
        if (investment.isExecuted) revert AuctionAlreadyExecuted();
        
        IContinuousClearingAuction auction = IContinuousClearingAuction(investment.auctionAddress);
        
        uint256 currentBlock = getActualContractBlockNumber();
        uint256 auctionStartBlock = auction.startBlock();
        uint256 auctionEndBlock = auction.endBlock();
        
        if (currentBlock < auctionStartBlock) revert AuctionNotStarted();
        if (currentBlock >= auctionEndBlock) revert AuctionEnded();
        if (auction.isGraduated()) revert("Auction already graduated");
        
        if (investment.yesVotes < VOTING_THRESHOLD) revert ThresholdNotReached();
        
        uint256 floorPrice = auction.floorPrice();
        uint256 tickSpacing = auction.tickSpacing();
        uint256 maxPrice = floorPrice + tickSpacing;
        
        uint256 proposedAmount = investment.proposedAmount;
        
        if (proposedAmount == 0) revert InvalidAmount();
        if (proposedAmount > type(uint128).max) revert InvalidAmount();
        
        uint256 balanceBefore = IERC20(USDC).balanceOf(address(this));
        
        if (balanceBefore < proposedAmount) {
            revert("Insufficient USDC balance");
        }
        
        IERC20(USDC).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(USDC, investment.auctionAddress, type(uint160).max, type(uint48).max);
        IERC20(USDC).approve(investment.auctionAddress, proposedAmount);
        
        uint256 bidId = auction.submitBid(
            maxPrice,
            uint128(proposedAmount),
            address(this),
            floorPrice,
            ""
        );
        
        uint256 balanceAfter = IERC20(USDC).balanceOf(address(this));
        uint256 spent = balanceBefore - balanceAfter;
        
        if (spent > proposedAmount) {
            revert("Auction pulled more USDC than proposed");
        }
        
        investment.totalInvestedUSDC = spent;
        investment.bidId = bidId;
        investment.isExecuted = true;
        investment.isActive = false;
        
        emit DebugExecuteAuction(
            auctionId,
            proposedAmount,
            floorPrice,
            tickSpacing,
            maxPrice,
            proposedAmount,
            proposedAmount,
            balanceBefore,
            balanceAfter,
            uint64(currentBlock),
            uint64(auctionStartBlock),
            uint64(auctionEndBlock),
            true,
            true
        );
        
        emit AuctionExecuted(auctionId, investment.auctionAddress, spent, bidId);
    }

    // Works with auction's permit2TransferFrom requirement
    function executeAuctionDirect(uint256 auctionId) external nonReentrant poolExists {
        if (msg.sender != tx.origin) revert OnlyEOA();
        
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        
        if (investment.auctionAddress == address(0)) revert("Investment does not exist");
        if (investment.isExecuted) revert AuctionAlreadyExecuted();
        
        IContinuousClearingAuction auction = IContinuousClearingAuction(investment.auctionAddress);
        
        uint256 currentBlock = getActualContractBlockNumber();
        uint256 auctionStartBlock = auction.startBlock();
        uint256 auctionEndBlock = auction.endBlock();
        
        if (currentBlock < auctionStartBlock) revert AuctionNotStarted();
        if (currentBlock >= auctionEndBlock) revert AuctionEnded();
        if (auction.isGraduated()) revert("Auction already graduated");
        
        if (investment.yesVotes < VOTING_THRESHOLD) revert ThresholdNotReached();
        
        uint256 floorPrice = auction.floorPrice();
        uint256 tickSpacing = auction.tickSpacing();
        uint256 maxPrice = floorPrice + tickSpacing;
        
        uint256 proposedAmount = investment.proposedAmount;
        
        if (proposedAmount == 0) revert InvalidAmount();
        if (proposedAmount > type(uint128).max) revert InvalidAmount();
        
        uint256 balanceBefore = IERC20(USDC).balanceOf(address(this));
        
        if (balanceBefore < proposedAmount) {
            revert("Insufficient USDC balance");
        }
        
        IERC20(USDC).approve(PERMIT2, type(uint256).max);
        IPermit2(PERMIT2).approve(USDC, investment.auctionAddress, type(uint160).max, type(uint48).max);
        IERC20(USDC).approve(investment.auctionAddress, proposedAmount);
        
        uint256 bidId = auction.submitBid(
            maxPrice,
            uint128(proposedAmount),
            address(this),
            floorPrice,
            ""
        );
        
        uint256 balanceAfter = IERC20(USDC).balanceOf(address(this));
        uint256 spent = balanceBefore - balanceAfter;
        
        if (spent > proposedAmount) {
            revert("Auction pulled more USDC than proposed");
        }
        
        investment.totalInvestedUSDC = spent;
        investment.bidId = bidId;
        investment.isExecuted = true;
        investment.isActive = false;
        
        emit AuctionExecuted(auctionId, investment.auctionAddress, spent, bidId);
    }

    function claimAuctionTokens(uint256 auctionId) external nonReentrant poolExists {
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        
        if (!investment.isExecuted) revert("Auction not executed");
        if (investment.tokensClaimed) revert TokensAlreadyClaimed();
        
        IContinuousClearingAuction auction = IContinuousClearingAuction(investment.auctionAddress);
        
        if (block.number < uint256(auction.endBlock())) revert AuctionNotEnded();
        
        auction.claimTokens(investment.bidId);
        
        address auctionToken = investment.auctionToken;
        uint256 tokenBalance = IERC20(auctionToken).balanceOf(address(this));
        
        investment.tokensPurchased = tokenBalance;
        investment.tokensClaimed = true;
        
        emit AuctionTokensClaimed(auctionId, auctionToken, tokenBalance);
        
        _distributeAuctionTokens(auctionId, auctionToken, tokenBalance);
    }

    function _distributeAuctionTokens(uint256 auctionId, address token, uint256 totalTokens) internal {
        InvestorAuctionShare[] storage shares = auctionInvestorShares[auctionId];
        
        uint256 totalYesVotes = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            if (shares[i].voteFor) {
                totalYesVotes += shares[i].sharePercentage;
            }
        }
        
        if (totalYesVotes == 0) revert("No YES votes");
        
        for (uint256 i = 0; i < shares.length; i++) {
            InvestorAuctionShare storage share = shares[i];
            if (share.voteFor) {
                uint256 tokenAmount = (totalTokens * share.sharePercentage) / totalYesVotes;
                
                if (tokenAmount > 0) {
                    IERC20(token).transfer(share.investor, tokenAmount);
                    share.claimedTokens = tokenAmount;
                    investors[share.investor].tokenBalances[token] += tokenAmount;
                    
                    emit TokensDistributed(auctionId, share.investor, token, tokenAmount);
                }
            }
        }
    }

    function _updateInvestor(address investorAddr, uint256 usdcAmount, uint256 ethAmount) internal {
        Investor storage inv = investors[investorAddr];
        
        if (inv.wallet == address(0)) {
            investorList.push(investorAddr);
            poolAllocation.totalInvestors++;
            
            inv.wallet = investorAddr;
            inv.usdcContributed = usdcAmount;
            inv.ethContributed = ethAmount;
            inv.positionTokenIds = new uint256[](0);
        } else {
            inv.usdcContributed += usdcAmount;
            inv.ethContributed += ethAmount;
        }
    }

    function _recalculateShares() internal {
        uint256 totalValue = poolAllocation.totalValue;
        
        if (totalValue == 0) {
            for (uint256 i = 0; i < investorList.length; i++) {
                investors[investorList[i]].sharePercentage = 0;
            }
            return;
        }
        
        uint256 ethPrice = _getNormalizedETHPrice();
        
        for (uint256 i = 0; i < investorList.length; i++) {
            address investorAddr = investorList[i];
            Investor storage inv = investors[investorAddr];
            
            uint256 ethValueInUSDC = (inv.ethContributed * ethPrice) / 1e20;
            uint256 investorValue = inv.usdcContributed + ethValueInUSDC;
            
            if (investorValue > 0) {
                inv.sharePercentage = (investorValue * 10000) / totalValue;
            } else {
                inv.sharePercentage = 0;
            }
        }
    }

    function _getNormalizedETHPrice() internal view returns (uint256) {
        try pyth.getPriceNoOlderThan(ETH_USD_FEED_ID, 60) returns (IPyth.Price memory price) {
            if (price.price < 0) return 2000 * 1e8;
            return uint256(uint64(price.price));
        } catch {
            return 2000 * 1e8;
        }
    }

    // ============ VIEW FUNCTIONS ============
    // All modifiers removed to prevent reverts

    function getInvestorInfo(address investor) external view returns (
        uint256 usdcBalance, 
        uint256 ethBalance, 
        uint256 sharePercentage,
        uint256 activeLiquidity, 
        uint256[] memory positionIds
    ) {
        Investor storage inv = investors[investor];
        return (
            inv.usdcContributed, 
            inv.ethContributed, 
            inv.sharePercentage, 
            inv.activeLiquidity, 
            inv.positionTokenIds
        );
    }

    function getPoolAuctionInvestments() external view returns (uint256[] memory) {
        return poolAuctionInvestments;
    }

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
    ) {
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        return (
            investment.auctionAddress, 
            investment.auctionToken, 
            investment.proposedAmount,
            investment.totalInvestedUSDC,
            investment.tokensPurchased, 
            investment.isActive, 
            investment.yesVotes,
            investment.noVotes, 
            investment.voteDeadline
        );
    }

    function getInvestorTokenBalance(address investor, address token) external view returns (uint256) {
        return investors[investor].tokenBalances[token];
    }

    function getAllInvestors() external view returns (address[] memory) {
        return investorList;
    }

    function getPoolInfo() external view returns (
        uint256 totalValue, 
        uint256 apySlice, 
        uint256 auctionSlice,
        uint256 idleSlice, 
        uint256 activeLiquiditySlice, 
        uint256 totalInvestors
    ) {
        return (
            poolAllocation.totalValue, 
            poolAllocation.apySlice, 
            poolAllocation.auctionSlice,
            poolAllocation.idleSlice, 
            poolAllocation.activeLiquiditySlice, 
            poolAllocation.totalInvestors
        );
    }

    function getAuctionProposal(uint256 auctionId) external view returns (
        uint256 proposedAmount,
        bool isExecuted,
        uint256 yesVotes,
        uint256 noVotes
    ) {
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        return (
            investment.proposedAmount,
            investment.isExecuted,
            investment.yesVotes,
            investment.noVotes
        );
    }

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
    ) {
        AuctionInvestment storage investment = auctionInvestments[auctionId];
        require(investment.auctionAddress != address(0), "Auction not found");
        
        IContinuousClearingAuction auction = IContinuousClearingAuction(investment.auctionAddress);
        
        floorPrice = auction.floorPrice();
        tickSpacing = auction.tickSpacing();
        maxPrice = floorPrice + tickSpacing;
        proposedAmount = investment.proposedAmount;
        
        uint256 proposedAmountMicro = proposedAmount * 1e6;
        tokenAmountMicro = (proposedAmountMicro * Q96) / maxPrice;
        verifyAmountMicro = (tokenAmountMicro * maxPrice) / Q96;
        mathValid = (verifyAmountMicro == proposedAmountMicro);
        
        tokenAmountUSDC = tokenAmountMicro / 1e6;
        
        currentBlock = uint64(getActualContractBlockNumber());
        auctionStartBlock = auction.startBlock();
        auctionEndBlock = auction.endBlock();
        isActive = currentBlock >= auctionStartBlock && currentBlock < auctionEndBlock;
    }

    receive() external payable {}
}