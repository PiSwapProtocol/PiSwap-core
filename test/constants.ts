import { ethers } from 'hardhat';

const afterFee1Eth = ethers.utils.parseEther('1').mul(1000).div(997);

export default {
  errorMessages: {
    marketAlreadyExists: 'Market already exists',
    disallowContract: 'Cannot create market for this contract',
    onlyMarkets: 'Only callable by markets',
    transferFailed: 'Transfer failed',
    approval: 'ERC1155: caller is not owner nor approved',
    notZero: "Amount can't be zero",
    expired: 'expired',
    minAmount: 'Minimum amount not reached',
    slippage: 'Slippage',
    disallowLiquidity: 'Cannot swap liquidity token',
    reserveEmpty: 'Reserve empty',
    unsupportedSmartContract: 'Unsupported smart contract',
    insufficientAmount: 'Insufficient amount',
    insufficientLiquidity: 'Insufficient liquidity',
    swappingNotEnabled: 'NFT swapping not enabled',
    burnInsufficientBalance: 'ERC1155: burn amount exceeds balance',
  },
  tokenType: {
    ETH: 0,
    BULL: 1,
    BEAR: 2,
    LIQUIDITY: 3,
  },
  NFTType: {
    ERC721: 0,
    ERC1155: 1,
  },
  swapKind: {
    GIVEN_IN: 0,
    GIVEN_OUT: 1,
  },
  after1Eth: '9900990099009900990100',
  afterFee1Eth,
  afterFee5000Tokens: '5015045135406218655968',
  feeFor1Eth: afterFee1Eth.sub(ethers.utils.parseEther('1')),
  tokensFor1Eth: '9900990099009900990100',
  zeroAddress: '0x0000000000000000000000000000000000000000',
  maxUint: ethers.constants.MaxUint256.toString(),
  unix2100: 4102444800,
};
