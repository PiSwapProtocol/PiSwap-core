import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  let p: PiSwap;
  let market: PiSwapMarket;
  let oracle: BigNumber[] = [];

  const oracleAvg = () => {
    if (oracle.length === 0) {
      return 0;
    }
    let total = ethers.BigNumber.from('0');
    for (let i = 0; i < oracle.length; i++) {
      total = total.add(oracle[i]);
    }
    return total.div(oracle.length);
  };

  const registerPrice = async () => {
    const bullReserve = await p.getReserve(market, 1);
    const bearReserve = await p.getReserve(market, 2);
    const nftValue = await p.nftValue(market, bullReserve, bearReserve);
    oracle.push(nftValue);
  };

  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[8].address);
    market = await p.deplyoMarketERC721();

    await p.weth.deposit({ value: ethers.utils.parseEther('200') });
    await p.weth.approve(market.address, ethers.constants.MaxUint256);

    await market.mint({
      amount: ethers.utils.parseEther('90'),
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });

    await market.addLiquidity({
      amountEth: ethers.utils.parseEther('4'),
      minLiquidity: 0,
      maxBull: ethers.utils.parseEther('500000'),
      maxBear: ethers.utils.parseEther('500000'),
      useWeth: true,
      to: accounts[0].address,
      deadline: c.unix2100,
      userData: [],
    });
  });

  describe('Oracle & swap enabled', async () => {
    it('should return calculated nft value if oracle is not initialized', async () => {
      expect(await market.nftValue()).to.equal(await p.nftValue(market));
    });
    it('should return value from oracle if initialized', async () => {
      await registerPrice();
      await market.swap({
        amount: ethers.utils.parseEther('1'),
        tokenIn: c.tokenType.ETH,
        tokenOut: c.tokenType.BULL,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      expect(await market.nftValue()).to.not.equal(await p.nftValue(market));
      expect(await market.nftValue()).to.equal(oracle[oracle.length - 1]);
      expect((await market.getOracleEntry(0)).price).to.equal(oracle[0]);
      expect(await market.nftValueAvg(oracle.length)).to.equal(oracleAvg());
    });

    it('eth => bear swap', async () => {
      await registerPrice();
      const tx = market.swap({
        amount: ethers.utils.parseEther('1'),
        tokenIn: c.tokenType.ETH,
        tokenOut: c.tokenType.BEAR,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx).to.emit(market, 'PriceRegistered');
      expect(await market.nftValue()).to.equal(oracle[oracle.length - 1]);
      expect(await market.nftValueAvg(oracle.length)).to.equal(oracleAvg());
    });

    it('bull => eth swap', async () => {
      await registerPrice();
      await market.swap({
        amount: ethers.utils.parseEther('100000'),
        tokenIn: c.tokenType.BULL,
        tokenOut: c.tokenType.ETH,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,

        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      expect(await market.nftValue()).to.equal(oracle[oracle.length - 1]);
      expect(await market.nftValueAvg(oracle.length)).to.equal(oracleAvg());
    });

    it('bear => eth swap', async () => {
      await registerPrice();
      await market.swap({
        amount: ethers.utils.parseEther('100000'),
        tokenIn: c.tokenType.BEAR,
        tokenOut: c.tokenType.ETH,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      expect(await market.nftValue()).to.equal(oracle[oracle.length - 1]);
      expect(await market.nftValueAvg(oracle.length)).to.equal(oracleAvg());
    });

    it('should register price before first transaction if multiple swaps performed in a single block', async () => {
      await registerPrice();
      await network.provider.request({
        method: 'evm_setAutomine',
        params: [false],
      });

      const tx1 = await market.swap({
        amount: ethers.utils.parseEther('100000'),
        tokenIn: c.tokenType.BULL,
        tokenOut: c.tokenType.BEAR,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });

      const tx2 = await market.swap({
        amount: ethers.utils.parseEther('100000'),
        tokenIn: c.tokenType.BEAR,
        tokenOut: c.tokenType.BULL,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      await network.provider.request({
        method: 'evm_mine',
        params: [],
      });
      await network.provider.request({
        method: 'evm_setAutomine',
        params: [true],
      });
      await network.provider.request({
        method: 'evm_mine',
        params: [],
      });
      await expect(tx1).to.emit(market, 'PriceRegistered');
      await expect(tx2).to.not.emit(market, 'PriceRegistered');
      expect(await market.nftValue()).to.equal(oracle[oracle.length - 1]);
      expect(await market.nftValueAvg(oracle.length)).to.equal(oracleAvg());
    });

    it('should revert if required oracle length not reached', async () => {
      await registerPrice();
      await market.swap({
        amount: ethers.utils.parseEther('10'),
        tokenIn: c.tokenType.ETH,
        tokenOut: c.tokenType.BULL,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      expect(await market.nftValue()).to.equal(oracle[oracle.length - 1]);
      expect(await market.nftValueAvg(oracle.length)).to.equal(oracleAvg());
      expect(await market.oracleLength()).to.equal(oracle.length);
      await expect(market.swapEnabled()).to.be.revertedWith('PiSwapMarket#oracle: NOT_INITIALIZED');
      await expect(market.nftValueAccumulated()).to.be.revertedWith('PiSwapMarket#oracle: NOT_INITIALIZED');
    });

    it('should return values if oracle is initialized', async () => {
      await p.registry.connect(accounts[8]).setOracleLength(6);
      expect(await market.swapEnabled()).to.be.true;
      expect(await market.nftValueAccumulated()).to.equal(oracleAvg());
    });

    it('swap should be disabled if nftValue exceeds locked eth', async () => {
      for (let i = 0; i < 6; i++) {
        await market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,

          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        });
      }
      expect(await market.swapEnabled()).to.be.false;
    });
  });
});
