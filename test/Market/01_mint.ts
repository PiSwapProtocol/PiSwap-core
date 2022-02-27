import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { before } from 'mocha';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  let p: PiSwap;
  let market: PiSwapMarket;
  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[8].address);
    market = await p.deplyoMarketERC721();
    await p.weth.deposit({ value: ethers.utils.parseEther('100') });
    await p.weth.approve(market.address, ethers.constants.MaxUint256);
  });

  describe('Token mint', async () => {
    let amountIn1 = ethers.BigNumber.from('0');
    let amountOut1 = ethers.BigNumber.from('0');

    it('amount in and out should match for both swap kinds', async () => {
      const amountIn = ethers.utils.parseEther('0.892748923748972389');
      const amountOutCalculated = await market.mintOutGivenIn(amountIn);
      const amountInCalculated = await market.mintInGivenOut(amountOutCalculated);
      expect(await p.mintOutGivenIn(market, amountIn)).to.equal(amountOutCalculated);
      expect(await p.mintInGivenOut(market, amountOutCalculated)).to.equal(amountIn);
      expect(amountIn).to.equal(amountInCalculated);
    });

    it('due to precision limitations, calculated amount out should be greater or equal to desired amount out', async () => {
      const amountOut = ethers.utils.parseEther('153671.183045295037582417');
      const amountInCalculated = await market.mintInGivenOut(amountOut);
      const amountOutCalculated = await market.mintOutGivenIn(amountInCalculated);
      expect(await p.mintInGivenOut(market, amountOut)).to.equal(amountInCalculated);
      expect(await p.mintOutGivenIn(market, amountInCalculated)).to.equal(amountOutCalculated);
      expect(amountOutCalculated.gte(amountOut)).to.be.true;
    });

    it('should be able to mint tokens given amount in', async () => {
      const amountIn = ethers.utils.parseEther('1');
      const tokenIdBull = p.getTokenId(market, c.tokenType.BULL);
      const tokenIdBear = p.getTokenId(market, c.tokenType.BEAR);
      const { amountOut, fee } = await p.mintOutGivenInWithFee(market, amountIn);
      amountIn1 = amountIn1.add(amountIn.sub(fee));
      amountOut1 = amountOut1.add(amountOut);
      const tx = market.mint({
        amount: amountIn,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx)
        .to.emit(market, 'Minted')
        .withArgs(accounts[0].address, accounts[0].address, amountIn, amountOut);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, market.address, ethers.constants.AddressZero, '0', fee);
      await expect(tx)
        .to.emit(p.weth, 'Transfer')
        .withArgs(p.registry.address, await p.registry.beneficiary(), fee);

      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBull)).to.equal(amountOut);
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBear)).to.equal(amountOut);
      expect(await market.depositedEth()).to.equal(amountIn.sub(fee));
      expect(await p.registry.totalSupply(tokenIdBull)).to.equal(amountOut);
      expect(await p.registry.totalSupply(tokenIdBear)).to.equal(await p.registry.totalSupply(tokenIdBull));
    });

    it('should be able to mint tokens given amount out', async () => {
      const amountOut = ethers.utils.parseEther('1000');
      const { amountIn, fee } = await p.mintInGivenOutWithFee(market, amountOut);
      amountIn1 = amountIn1.add(amountIn.sub(fee));
      amountOut1 = amountOut1.add(amountOut);

      const tx = market.mint({
        amount: amountOut,
        kind: c.swapKind.GIVEN_OUT,
        useWeth: true,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx)
        .to.emit(market, 'Minted')
        .withArgs(accounts[0].address, accounts[0].address, amountIn, amountOut);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, market.address, ethers.constants.AddressZero, '0', fee);
      await expect(tx)
        .to.emit(p.weth, 'Transfer')
        .withArgs(p.registry.address, await p.registry.beneficiary(), fee);
    });

    it('should revert when sending 0 ETH', async () => {
      const tx1 = market.mint({
        amount: '0',
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });

      const tx2 = market.mint({
        amount: '0',
        kind: c.swapKind.GIVEN_OUT,
        useWeth: true,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx1).to.be.revertedWith('PiSwapMarket#onERC1155Received: AMOUNT_ZERO');
      await expect(tx2).to.be.reverted;
    });

    it('should fail if minimum amount was not reached', async () => {
      const tx1 = market.mint({
        amount: ethers.utils.parseEther('1'),
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });

      const tx2 = market.mint({
        amount: ethers.utils.parseEther('1'),
        kind: c.swapKind.GIVEN_OUT,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx1).to.be.revertedWith('PiSwapMarket#mint: SLIPPAGE');
      await expect(tx2).to.be.revertedWith('PiSwapMarket#mint: SLIPPAGE');
    });

    it('should fail if deadline was reached', async () => {
      const tx = market.mint({
        amount: ethers.utils.parseEther('1'),
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: 0,
        userData: [],
      });

      await expect(tx).to.be.revertedWith('PiSwapMarket#mint: EXPIRED');
    });
  });
  describe('Token mint without fees', () => {
    before(async () => {
      await p.registry.connect(accounts[8]).setFee(0);
    });

    it('should be able to mint tokens given amount in without fees', async () => {
      const amountIn = ethers.utils.parseEther('1');
      const amountOut = await p.mintOutGivenIn(market, amountIn);

      const tx = market.mint({
        amount: amountIn,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx)
        .to.emit(market, 'Minted')
        .withArgs(accounts[0].address, accounts[0].address, amountIn, amountOut);
    });

    it('should be able to mint tokens given out without fee', async () => {
      const amountOut = ethers.utils.parseEther('1000');
      const amountIn = await p.mintInGivenOut(market, amountOut);

      const tx = market.mint({
        amount: amountOut,
        kind: c.swapKind.GIVEN_OUT,
        useWeth: true,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx)
        .to.emit(market, 'Minted')
        .withArgs(accounts[0].address, accounts[0].address, amountIn, amountOut);
    });
  });
});
