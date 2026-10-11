// lib/abis.ts
import { ethers } from 'ethers';
import { USDC_MONAD_TESTNET } from './contract-interactions';

// ============================================
// CCA (Continuous Clearing Auction) ABI
// ============================================
export const CCA_ABI = [
  // === BID SUBMISSION ===
  {
    type: 'function',
    name: 'submitBid',
    stateMutability: 'payable',
    inputs: [
      { name: '_maxPrice', type: 'uint256' },
      { name: '_amount', type: 'uint128' },
      { name: '_owner', type: 'address' },
      { name: '_prevTickPrice', type: 'uint256' },
      { name: '_hookData', type: 'bytes' }
    ],
    outputs: [{ name: 'bidId', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'submitBid',
    stateMutability: 'payable',
    inputs: [
      { name: '_maxPrice', type: 'uint256' },
      { name: '_amount', type: 'uint128' },
      { name: '_owner', type: 'address' },
      { name: '_hookData', type: 'bytes' }
    ],
    outputs: [{ name: 'bidId', type: 'uint256' }]
  },
  
  // === BID MANAGEMENT ===
  {
    type: 'function',
    name: 'getBid',
    stateMutability: 'view',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [
      {
        name: 'bid',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'amountQ96', type: 'uint256' },
          { name: 'maxPrice', type: 'uint256' },
          { name: 'startBlock', type: 'uint64' },
          { name: 'tokensFilled', type: 'uint256' },
          { name: 'exitedBlock', type: 'uint64' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'exitBid',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_bidId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'exitPartiallyFilledBid',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_bidId', type: 'uint256' },
      { name: '_lastFullyFilledCheckpointBlock', type: 'uint64' },
      { name: '_outbidBlock', type: 'uint64' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'claimTokens',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_bidId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'claimTokensBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_bidIds', type: 'uint256[]' }
    ],
    outputs: []
  },
  
  // === CHECKPOINT & STATE ===
  {
    type: 'function',
    name: 'checkpoint',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'cumulativeMps', type: 'uint64' },
          { name: 'cumulativeMpsPerPrice', type: 'uint88' },
          { name: 'clearingPrice', type: 'uint256' },
          { name: 'currencyRaisedAtClearingPriceQ96_X7', type: 'uint256' },
          { name: 'prev', type: 'uint64' },
          { name: 'next', type: 'uint64' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'latestCheckpoint',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'cumulativeMps', type: 'uint64' },
          { name: 'cumulativeMpsPerPrice', type: 'uint88' },
          { name: 'clearingPrice', type: 'uint256' },
          { name: 'currencyRaisedAtClearingPriceQ96_X7', type: 'uint256' },
          { name: 'prev', type: 'uint64' },
          { name: 'next', type: 'uint64' }
        ]
      }
    ]
  },
  
  // === AUCTION STATE ===
  {
    type: 'function',
    name: 'clearingPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'currencyRaised',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint128' }]
  },
  {
    type: 'function',
    name: 'totalCleared',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'startBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }]
  },
  {
    type: 'function',
    name: 'endBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }]
  },
  {
    type: 'function',
    name: 'claimBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }]
  },
  {
    type: 'function',
    name: 'isGraduated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    name: 'floorPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'tickSpacing',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'token',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    name: 'currency',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    name: 'step',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'mps', type: 'uint24' },
          { name: 'startBlock', type: 'uint64' },
          { name: 'endBlock', type: 'uint64' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'sweepCurrency',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    name: 'sweepUnsoldTokens',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    name: 'onTokensReceived',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    name: 'tokensRecipient',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    name: 'fundsRecipient',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  
  // === EVENTS ===
  {
    type: 'event',
    name: 'BidSubmitted',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'maxPrice', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint128', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'BidExited',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
      { name: 'refund', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'TokensClaimed',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'CheckpointUpdated',
    inputs: [
      { name: 'blockNumber', type: 'uint64', indexed: false },
      { name: 'clearingPrice', type: 'uint256', indexed: false },
      { name: 'cumulativeMps', type: 'uint64', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'ClearingPriceUpdated',
    inputs: [
      { name: 'blockNumber', type: 'uint64', indexed: false },
      { name: 'clearingPrice', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'TokensReceived',
    inputs: [
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  },
  { type: 'error', name: 'AuctionNotStarted', inputs: [] },
  { type: 'error', name: 'AuctionIsOver', inputs: [] },
  { type: 'error', name: 'AuctionSoldOut', inputs: [] },
  { type: 'error', name: 'BidAmountTooSmall', inputs: [] },
  { type: 'error', name: 'BidMustBeAboveClearingPrice', inputs: [] },
  { type: 'error', name: 'CurrencyIsNotNative', inputs: [] },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidBidPriceTooHigh', inputs: [{ name: 'maxPrice', type: 'uint256' }, { name: 'maxBidPrice', type: 'uint256' }] },
  { type: 'error', name: 'MpsRemainingIsZero', inputs: [] },
  { type: 'error', name: 'TokensNotReceived', inputs: [] },
  { type: 'error', name: 'BidOwnerCannotBeZeroAddress', inputs: [] },
  { type: 'error', name: 'InvalidTokenAmountReceived', inputs: [] }
] as const;

// ============================================
// Factory ABI
// ============================================
export const FACTORY_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }, 
      { "internalType": "bytes", "name": "configData", "type": "bytes" },
      { "internalType": "bytes32", "name": "salt", "type": "bytes32" }
    ],
    "name": "initializeDistribution",
    "outputs": [{ "internalType": "contract IDistributionContract", "name": "distributionContract", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "bytes", "name": "configData", "type": "bytes" },
      { "internalType": "bytes32", "name": "salt", "type": "bytes32" },
      { "internalType": "address", "name": "sender", "type": "address" }
    ],
    "name": "getAuctionAddress",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "auction", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "token", "type": "address" },
      { "indexed": false, "internalType": "uint128", "name": "amount", "type": "uint128" },
      { "indexed": false, "internalType": "bytes", "name": "configData", "type": "bytes" }
    ],
    "name": "AuctionCreated",
    "type": "event"
  },
  { "type": "error", "name": "InvalidTokenAmount", "inputs": [{ "name": "amount", "type": "uint256" }] },
  { "type": "error", "name": "InvalidEndBlock", "inputs": [] },
  { "type": "error", "name": "InvalidEndBlockGivenStepData", "inputs": [{ "name": "actualEndBlock", "type": "uint64" }, { "name": "expectedEndBlock", "type": "uint64" }] },
  { "type": "error", "name": "InvalidStepDataMps", "inputs": [{ "name": "actualMps", "type": "uint256" }, { "name": "expectedMps", "type": "uint256" }] },
  { "type": "error", "name": "InvalidAuctionDataLength", "inputs": [] },
  { "type": "error", "name": "StepBlockDeltaCannotBeZero", "inputs": [] },
  { "type": "error", "name": "TokenIsAddressZero", "inputs": [] },
  { "type": "error", "name": "TokenAndCurrencyCannotBeTheSame", "inputs": [] },
  { "type": "error", "name": "TotalSupplyIsZero", "inputs": [] },
  { "type": "error", "name": "TotalSupplyIsTooLarge", "inputs": [] },
  { "type": "error", "name": "TokensRecipientIsZero", "inputs": [] },
  { "type": "error", "name": "FundsRecipientIsZero", "inputs": [] },
  { "type": "error", "name": "TickSpacingTooSmall", "inputs": [] },
  { "type": "error", "name": "FloorPriceIsZero", "inputs": [] },
  { "type": "error", "name": "FloorPriceTooLow", "inputs": [] },
  { "type": "error", "name": "ClaimBlockIsBeforeEndBlock", "inputs": [] },
  { "type": "error", "name": "FloorPriceAndTickSpacingGreaterThanMaxBidPrice", "inputs": [{ "name": "nextTick", "type": "uint256" }, { "name": "maxBidPrice", "type": "uint256" }] },
  { "type": "error", "name": "DeploymentFailed", "inputs": [] },
  { "type": "error", "name": "TokensNotReceived", "inputs": [] }
] as const;

// ============================================
// ERC20 ABI (Standard)
// ============================================
export const ERC20_ABI = [
  // Read Functions
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  
  // Write Functions
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'transferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  
  // Events
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'spender', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }
] as const;

// ============================================
// Pyth Oracle ABI
// ============================================
export const PYTH_ABI = [
  {
    name: 'updatePriceFeeds',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'updateData', type: 'bytes[]' }],
    outputs: []
  },
  {
    name: 'getUpdateFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'updateData', type: 'bytes[]' }],
    outputs: [{ name: 'feeAmount', type: 'uint256' }]
  },
  {
    name: 'getPriceNoOlderThan',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'age', type: 'uint256' }
    ],
    outputs: [
      { name: 'price', type: 'int64' },
      { name: 'conf', type: 'uint64' },
      { name: 'expo', type: 'int32' },
      { name: 'publishTime', type: 'uint256' }
    ]
  }
] as const;

// ============================================
// CCTP Token Messenger ABI
// ============================================
export const CCTP_TOKEN_MESSENGER_ABI = [
  {
    name: 'depositForBurn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' }
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }]
  }
] as const;

// ============================================
// CCTP Message Transmitter ABI
// ============================================
export const CCTP_MESSAGE_TRANSMITTER_ABI = [
  {
    name: 'receiveMessage',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' }
    ],
    outputs: [{ name: 'success', type: 'bool' }]
  }
] as const;

// ============================================
// NoVCAngelHookV ABI 
// ============================================
export const NOVC_ANGEL_HOOK_ABI = [
  // Read Functions
  {
    "type": "function",
    "name": "APY_SLICE_PERCENT",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUCTION_SLICE_PERCENT",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SWAP_FEE_BPS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSwapFeesCollected",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_FEE",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint24" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_TICK_SPACING",
    "inputs": [],
    "outputs": [{ "name": "", "type": "int24" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ETH_USD_FEED_ID",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_ETH_DEPOSIT",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_USDC_DEPOSIT",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "NATIVE_ETH",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PYTH_ADDR",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC_USD_FEED_ID",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VOTING_THRESHOLD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionInvestments",
    "inputs": [{ "name": "", "type": "uint256" }],
    "outputs": [
      { "name": "auctionId", "type": "uint256" },
      { "name": "auctionAddress", "type": "address" },
      { "name": "auctionToken", "type": "address" },
      { "name": "proposedAmount", "type": "uint256" },
      { "name": "totalInvestedUSDC", "type": "uint256" },
      { "name": "tokensPurchased", "type": "uint256" },
      { "name": "bidId", "type": "uint256" },
      { "name": "isActive", "type": "bool" },
      { "name": "isExecuted", "type": "bool" },
      { "name": "tokensClaimed", "type": "bool" },
      { "name": "voteDeadline", "type": "uint256" },
      { "name": "yesVotes", "type": "uint256" },
      { "name": "noVotes", "type": "uint256" },
      { "name": "clearingPriceAtInvestment", "type": "uint256" },
      { "name": "poolIdRef", "type": "bytes32" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "auctionInvestorShares",
    "inputs": [
      { "name": "", "type": "uint256" },
      { "name": "", "type": "uint256" }
    ],
    "outputs": [
      { "name": "investor", "type": "address" },
      { "name": "sharePercentage", "type": "uint256" },
      { "name": "claimedTokens", "type": "uint256" },
      { "name": "hasVoted", "type": "bool" },
      { "name": "voteFor", "type": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAllInvestors",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address[]" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAuctionDetails",
    "inputs": [{ "name": "auctionId", "type": "uint256" }],
    "outputs": [
      { "name": "auctionAddress", "type": "address" },
      { "name": "auctionToken", "type": "address" },
      { "name": "proposedAmount", "type": "uint256" },
      { "name": "totalInvested", "type": "uint256" },
      { "name": "tokensPurchased", "type": "uint256" },
      { "name": "isActive", "type": "bool" },
      { "name": "yesVotes", "type": "uint256" },
      { "name": "noVotes", "type": "uint256" },
      { "name": "deadline", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAuctionProposal",
    "inputs": [{ "name": "auctionId", "type": "uint256" }],
    "outputs": [
      { "name": "proposedAmount", "type": "uint256" },
      { "name": "isExecuted", "type": "bool" },
      { "name": "yesVotes", "type": "uint256" },
      { "name": "noVotes", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getInvestorInfo",
    "inputs": [{ "name": "investor", "type": "address" }],
    "outputs": [
      { "name": "usdcBalance", "type": "uint256" },
      { "name": "ethBalance", "type": "uint256" },
      { "name": "sharePercentage", "type": "uint256" },
      { "name": "activeLiquidity", "type": "uint256" },
      { "name": "positionIds", "type": "uint256[]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getInvestorTokenBalance",
    "inputs": [
      { "name": "investor", "type": "address" },
      { "name": "token", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPoolAuctionInvestments",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256[]" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPoolInfo",
    "inputs": [],
    "outputs": [
      { "name": "totalValue", "type": "uint256" },
      { "name": "apySlice", "type": "uint256" },
      { "name": "auctionSlice", "type": "uint256" },
      { "name": "idleSlice", "type": "uint256" },
      { "name": "activeLiquiditySlice", "type": "uint256" },
      { "name": "totalInvestors", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "investorList",
    "inputs": [{ "name": "", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "investors",
    "inputs": [{ "name": "", "type": "address" }],
    "outputs": [
      { "name": "wallet", "type": "address" },
      { "name": "usdcContributed", "type": "uint256" },
      { "name": "ethContributed", "type": "uint256" },
      { "name": "sharePercentage", "type": "uint256" },
      { "name": "activeLiquidity", "type": "uint256" },
      { "name": "lastVoteAuctionId", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextAuctionId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolAllocation",
    "inputs": [],
    "outputs": [
      { "name": "totalValue", "type": "uint256" },
      { "name": "apySlice", "type": "uint256" },
      { "name": "auctionSlice", "type": "uint256" },
      { "name": "idleSlice", "type": "uint256" },
      { "name": "activeLiquiditySlice", "type": "uint256" },
      { "name": "totalInvestors", "type": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolAuctionInvestments",
    "inputs": [{ "name": "", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolId",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolManager",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pyth",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },

  // Write Functions
  {
    "type": "function",
    "name": "allocateSlices",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approveAuctionUSDC",
    "inputs": [
      { "name": "auctionAddress", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approveUSDCForPermit2",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "beforeAddLiquidity",
    "inputs": [
      { "name": "", "type": "address" },
      { "name": "", "type": "tuple", "components": [
        { "name": "currency0", "type": "address" },
        { "name": "currency1", "type": "address" },
        { "name": "fee", "type": "uint24" },
        { "name": "tickSpacing", "type": "int24" },
        { "name": "hooks", "type": "address" }
      ] },
      { "name": "", "type": "tuple", "components": [
        { "name": "tickLower", "type": "int24" },
        { "name": "tickUpper", "type": "int24" },
        { "name": "liquidityDelta", "type": "int256" },
        { "name": "salt", "type": "bytes32" }
      ] },
      { "name": "", "type": "bytes" }
    ],
    "outputs": [{ "name": "", "type": "bytes4" }],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "beforeRemoveLiquidity",
    "inputs": [
      { "name": "", "type": "address" },
      { "name": "", "type": "tuple", "components": [
        { "name": "currency0", "type": "address" },
        { "name": "currency1", "type": "address" },
        { "name": "fee", "type": "uint24" },
        { "name": "tickSpacing", "type": "int24" },
        { "name": "hooks", "type": "address" }
      ] },
      { "name": "", "type": "tuple", "components": [
        { "name": "tickLower", "type": "int24" },
        { "name": "tickUpper", "type": "int24" },
        { "name": "liquidityDelta", "type": "int256" },
        { "name": "salt", "type": "bytes32" }
      ] },
      { "name": "", "type": "bytes" }
    ],
    "outputs": [{ "name": "", "type": "bytes4" }],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "beforeSwap",
    "inputs": [
      { "name": "", "type": "address" },
      { "name": "", "type": "tuple", "components": [
        { "name": "currency0", "type": "address" },
        { "name": "currency1", "type": "address" },
        { "name": "fee", "type": "uint24" },
        { "name": "tickSpacing", "type": "int24" },
        { "name": "hooks", "type": "address" }
      ] },
      { "name": "", "type": "tuple", "components": [
        { "name": "zeroForOne", "type": "bool" },
        { "name": "amountSpecified", "type": "int256" },
        { "name": "sqrtPriceLimitX96", "type": "uint160" }
      ] },
      { "name": "", "type": "bytes" }
    ],
    "outputs": [
      { "name": "", "type": "bytes4" },
      { "name": "", "type": "int256" },
      { "name": "", "type": "uint24" }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "claimAuctionTokens",
    "inputs": [{ "name": "auctionId", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createAngelPool",
    "inputs": [],
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositETH",
    "inputs": [],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "depositUSDC",
    "inputs": [{ "name": "amount", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeAuction",
    "inputs": [{ "name": "auctionId", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeAuctionDirect",
    "inputs": [{ "name": "auctionId", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isPermit2Approved",
    "inputs": [{ "name": "user", "type": "address" }],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "onERC721Received",
    "inputs": [
      { "name": "operator", "type": "address" },
      { "name": "from", "type": "address" },
      { "name": "tokenId", "type": "uint256" },
      { "name": "data", "type": "bytes" }
    ],
    "outputs": [{ "name": "", "type": "bytes4" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "previewExecuteAuction",
    "inputs": [{ "name": "auctionId", "type": "uint256" }],
    "outputs": [
      { "name": "proposedAmount", "type": "uint256" },
      { "name": "floorPrice", "type": "uint256" },
      { "name": "tickSpacing", "type": "uint256" },
      { "name": "maxPrice", "type": "uint256" },
      { "name": "tokenAmountMicro", "type": "uint256" },
      { "name": "tokenAmountUSDC", "type": "uint256" },
      { "name": "verifyAmountMicro", "type": "uint256" },
      { "name": "mathValid", "type": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposeAuctionInvestment",
    "inputs": [
      { "name": "auctionAddress", "type": "address" },
      { "name": "investmentAmount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recoverAccounting",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "voteOnAuction",
    "inputs": [
      { "name": "auctionId", "type": "uint256" },
      { "name": "voteFor", "type": "bool" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawETH",
    "inputs": [{ "name": "amount", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawUSDC",
    "inputs": [{ "name": "amount", "type": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },

  // Events
  {
    "type": "event",
    "name": "AccountingRecovered",
    "inputs": [
      { "name": "oldTotal", "type": "uint256", "indexed": false },
      { "name": "newTotal", "type": "uint256", "indexed": false },
      { "name": "addedToIdle", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionExecuted",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "auction", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false },
      { "name": "bidId", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionProposed",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "auction", "type": "address", "indexed": true },
      { "name": "proposedAmount", "type": "uint256", "indexed": false },
      { "name": "deadline", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionTokensClaimed",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "token", "type": "address", "indexed": true },
      { "name": "totalTokens", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AuctionVoted",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "voter", "type": "address", "indexed": true },
      { "name": "voteFor", "type": "bool", "indexed": false },
      { "name": "votes", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BidNFTReceived",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "bidId", "type": "uint256", "indexed": true },
      { "name": "from", "type": "address", "indexed": true }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DebugExecuteAuction",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": false },
      { "name": "proposedAmount", "type": "uint256", "indexed": false },
      { "name": "floorPrice", "type": "uint256", "indexed": false },
      { "name": "tickSpacing", "type": "uint256", "indexed": false },
      { "name": "maxPrice", "type": "uint256", "indexed": false },
      { "name": "tokenAmountMicro", "type": "uint256", "indexed": false },
      { "name": "verifyAmountMicro", "type": "uint256", "indexed": false },
      { "name": "hookBalanceBefore", "type": "uint256", "indexed": false },
      { "name": "hookBalanceAfter", "type": "uint256", "indexed": false },
      { "name": "success", "type": "bool", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "InvestorDeposited",
    "inputs": [
      { "name": "investor", "type": "address", "indexed": true },
      { "name": "usdcAmount", "type": "uint256", "indexed": false },
      { "name": "ethAmount", "type": "uint256", "indexed": false },
      { "name": "share", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Permit2Approved",
    "inputs": [
      { "name": "investor", "type": "address", "indexed": true }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PoolCreated",
    "inputs": [
      { "name": "poolId", "type": "bytes32", "indexed": true },
      { "name": "creator", "type": "address", "indexed": true }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SlicesAllocated",
    "inputs": [
      { "name": "apyAmount", "type": "uint256", "indexed": false },
      { "name": "auctionAmount", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ThresholdReached",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "yesVotes", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TokensDistributed",
    "inputs": [
      { "name": "auctionId", "type": "uint256", "indexed": true },
      { "name": "investor", "type": "address", "indexed": true },
      { "name": "token", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "USDCApproved",
    "inputs": [
      { "name": "auction", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawal",
    "inputs": [
      { "name": "investor", "type": "address", "indexed": true },
      { "name": "token", "type": "address", "indexed": true },
      { "name": "amount", "type": "uint256", "indexed": false }
    ],
    "anonymous": false
  },

  // Errors
  { "type": "error", "name": "AlreadyVoted", "inputs": [] },
  { "type": "error", "name": "AuctionAlreadyExecuted", "inputs": [] },
  { "type": "error", "name": "AuctionAlreadyProposed", "inputs": [] },
  { "type": "error", "name": "AuctionNotActive", "inputs": [] },
  { "type": "error", "name": "AuctionNotEnded", "inputs": [] },
  { "type": "error", "name": "BelowMinimum", "inputs": [] },
  { "type": "error", "name": "HookAddressNotValid", "inputs": [{ "name": "hooks", "type": "address" }] },
  { "type": "error", "name": "InsufficientAllowance", "inputs": [] },
  { "type": "error", "name": "InsufficientPermit2Allowance", "inputs": [] },
  { "type": "error", "name": "InsufficientVotingPower", "inputs": [] },
  { "type": "error", "name": "InvalidAmount", "inputs": [] },
  { "type": "error", "name": "InvalidAuctionAddress", "inputs": [] },
  { "type": "error", "name": "InvalidAuctionParameters", "inputs": [] },
  { "type": "error", "name": "InvalidMaxPrice", "inputs": [] },
  { "type": "error", "name": "NotEnoughAuctionFunds", "inputs": [] },
  { "type": "error", "name": "NotInvestor", "inputs": [] },
  { "type": "error", "name": "OnlyEOA", "inputs": [] },
  { "type": "error", "name": "Permit2ApproveFailed", "inputs": [] },
  { "type": "error", "name": "Permit2NotApproved", "inputs": [] },
  { "type": "error", "name": "PoolNotCreated", "inputs": [] },
  { "type": "error", "name": "PrecisionLoss", "inputs": [] },
  { "type": "error", "name": "ReentrancyGuardReentrantCall", "inputs": [] },
  { "type": "error", "name": "StorageCorrupted", "inputs": [] },
  { "type": "error", "name": "ThresholdNotReached", "inputs": [] },
  { "type": "error", "name": "TokensAlreadyClaimed", "inputs": [] },
  { "type": "error", "name": "TotalValueMismatch", "inputs": [] },
  { "type": "error", "name": "TransferAmountMismatch", "inputs": [] },
  { "type": "error", "name": "TransferFailed", "inputs": [] },
  { "type": "error", "name": "TransferFromFailed", "inputs": [] },
  { "type": "error", "name": "USDCApproveFailed", "inputs": [] },
  { "type": "error", "name": "VotingEnded", "inputs": [] }
] as const

// ============================================
// Contract Addresses - Monad testnet
// ============================================
export const CONTRACT_ADDRESSES = {
  // deployed hook 
  NOVC_ANGEL_HOOK: "0x8f93D9b74E8034FfA21bF423A43aD0A67a48BfF0" as const,
  
  // Token addresses
  USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const,
  USDC_MONAD_TESTNET: "0x8699FC6ec5E9976fc5D6D3A8f23AAf8bA9ec0b65" as const,
  NATIVE_MON: "0x0000000000000000000000000000000000000000" as const,
  
  // Uniswap V4 contracts
  POOL_MANAGER: "0x451D64ab3b650040d2aE1886602b97ed6eDc643d" as const,
  POSITION_MANAGER: "0x3Bb14E3D0Cd50aBe3EdACa06d06c29C78676C31A" as const,
  UNIVERSAL_ROUTER: "0x1b7bFCd2870329B987191910D85c22C7287f3c22" as const,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const,
  
  // Network
  CHAIN_ID: 10143 as const,
  RPC_URL: "https://testnet-rpc.monad.xyz" as const
} as const;

// ============================================
// Pool Configuration
// ============================================
export const POOL_KEY = {
  currency0: CONTRACT_ADDRESSES.USDC_MONAD_TESTNET,
  currency1: CONTRACT_ADDRESSES.NATIVE_MON,
  fee: 3000,
  tickSpacing: 60,
  hooks: CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK
} as const;

export const POOL_ID = "0x4dcd2ab926bedf4668df25be63e75dbed286bdec1e591faa14fb7609517f3f76";

// ============================================
// Helper Functions
// ============================================
export function createHookContract(providerOrSigner: ethers.Provider | ethers.Signer) {
  return new ethers.Contract(
    CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK,
    NOVC_ANGEL_HOOK_ABI,
    providerOrSigner
  );
}

export function createUSDCContract(providerOrSigner: ethers.Provider | ethers.Signer) {
  return new ethers.Contract(
    CONTRACT_ADDRESSES.USDC_MONAD_TESTNET,
    ERC20_ABI,
    providerOrSigner
  );
}

export function createAuctionContract(auctionAddress: string, providerOrSigner: ethers.Provider | ethers.Signer) {
  return new ethers.Contract(
    auctionAddress,
    CCA_ABI,
    providerOrSigner
  );
}