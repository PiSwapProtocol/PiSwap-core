import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { before } from 'mocha';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Token purchase', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    let ownerAddress: string;
    before(async () => {
      ownerAddress = accounts[8].address;
      p = await PiSwap.create(ownerAddress);
      market = await p.deplyoMarketERC721();
    });

    it('should be able to purchase tokens', async () => {
      const ownerBalance = await ethers.provider.getBalance(ownerAddress);
      const tokenIdBull = await p.registry.getTokenId(market.address, c.tokenType.BULL);
      const tokenIdBear = await p.registry.getTokenId(market.address, c.tokenType.BEAR);
      const tx = market.purchaseTokens(0, c.unix2100, {
        value: c.afterFee1Eth,
        gasPrice: 0,
      });
      await expect(tx).to.emit(market, 'TokensPurchased');
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBull)).to.equal(c.tokensFor1Eth);
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBear)).to.equal(c.tokensFor1Eth);
      expect(await ethers.provider.getBalance(market.address)).to.equal(ethers.utils.parseEther('1'));
      expect(await p.registry.totalSupply(tokenIdBull)).to.equal(c.tokensFor1Eth);
      expect(await p.registry.totalSupply(tokenIdBear)).to.equal(c.tokensFor1Eth);
      expect(await ethers.provider.getBalance(ownerAddress)).to.equal(ownerBalance.add(c.feeFor1Eth));
    });

    it('should fail when sending 0 ETH', async () => {
      await expect(market.purchaseTokens(0, c.unix2100)).to.be.revertedWith(c.errorMessages.notZero);
    });

    it('should fail if minimum amount was not reached', async () => {
      await expect(market.purchaseTokens(c.maxUint, c.unix2100)).to.be.revertedWith(c.errorMessages.minAmount);
    });

    it('should fail if deadline was reached', async () => {
      await expect(market.purchaseTokens(0, 0)).to.be.revertedWith(c.errorMessages.expired);
    });
  });
  describe('Token purchase without fees', () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    before(async () => {
      p = await PiSwap.create();
      market = await p.deplyoMarketERC721();
    });

    it('should be able to purchase tokens', async () => {
      const tokenIdBull = await p.registry.getTokenId(market.address, c.tokenType.BULL);
      const tokenIdBear = await p.registry.getTokenId(market.address, c.tokenType.BEAR);
      const tx = await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
        gasPrice: 0,
      });
      await expect(tx).to.emit(market, 'TokensPurchased');
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBull)).to.equal(c.tokensFor1Eth);
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBear)).to.equal(c.tokensFor1Eth);
      expect(await ethers.provider.getBalance(market.address)).to.equal(ethers.utils.parseEther('1'));
      expect(await p.registry.totalSupply(tokenIdBull)).to.equal(c.tokensFor1Eth);
      expect(await p.registry.totalSupply(tokenIdBear)).to.equal(c.tokensFor1Eth);
      expect(await ethers.provider.getBalance(p.beneficiary)).to.equal('0');
    });
  });
});
