import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { deployProxy, PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Token redemption', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    let ownerAddress: string;
    before(async () => {
      ownerAddress = accounts[8].address;
      p = await PiSwap.create(ownerAddress);
      market = await p.deplyoMarketERC721();
    });

    it('should be able to redeem tokens', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: c.afterFee1Eth,
      });
      const balance = await ethers.provider.getBalance(accounts[0].address);
      const ownerBalance = await ethers.provider.getBalance(ownerAddress);
      const tokenIdBull = p.getTokenId(market, c.tokenType.BULL);
      const tokenIdBear = p.getTokenId(market, c.tokenType.BEAR);
      const tx = market.redeemTokens(c.tokensFor1Eth, 0, c.unix2100, {
        gasPrice: 0,
      });
      await expect(tx).to.emit(market, 'TokensRedeemed');
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBull)).to.equal('0');
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBear)).to.equal('0');
      expect(await ethers.provider.getBalance(accounts[0].address)).to.equal(
        balance.add(ethers.utils.parseEther('0.997'))
      );
      expect(await ethers.provider.getBalance(market.address)).to.equal('0');
      expect(await p.registry.totalSupply(tokenIdBull)).to.equal('0');
      expect(await p.registry.totalSupply(tokenIdBear)).to.equal('0');
      expect(await ethers.provider.getBalance(ownerAddress)).to.equal(
        ownerBalance.add(ethers.utils.parseEther('0.003'))
      );
    });

    it('should fail when redeeming a larger amount than the total supply', async () => {
      await expect(market.redeemTokens('1', 0, c.unix2100, { from: accounts[2].address })).to.be.reverted;
    });

    it('should fail when having an insufficient balance', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: c.afterFee1Eth,
      });
      await expect(market.redeemTokens('1', 0, c.unix2100, { from: accounts[2].address })).to.be.reverted;
      await market.redeemTokens(c.tokensFor1Eth, 0, c.unix2100);
      const bullId = await market.getTokenId(c.tokenType.BULL);
      const bearId = await market.getTokenId(c.tokenType.BEAR);
      expect(await p.registry.totalSupply(bullId)).to.equal('0');
      expect(await p.registry.totalSupply(bearId)).to.equal('0');
    });

    it('should not be able to redeem 0 tokens', async () => {
      await expect(market.redeemTokens('0', 0, c.unix2100)).to.be.revertedWith(c.errorMessages.notZero);
    });

    it('should fail if minimum amount was not reached', async () => {
      await expect(market.redeemTokens('0', c.maxUint, c.unix2100)).to.be.revertedWith(c.errorMessages.minAmount);
    });

    it('should fail if deadline was reached', async () => {
      await expect(market.redeemTokens('0', 0, 0)).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should fail if ETH transfer fails', async () => {
      const proxy = await deployProxy(market.address);
      await proxy.purchase({ value: c.afterFee1Eth });
      await expect(proxy.redeem(c.tokensFor1Eth)).to.be.revertedWith(c.errorMessages.transferFailed);
    });
  });

  describe('Token redemption without fees', () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    before(async () => {
      p = await PiSwap.create();
      market = await p.deplyoMarketERC721();
    });

    it('should be able to redeem tokens', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      const balance = await ethers.provider.getBalance(accounts[0].address);
      const tokenIdBull = p.getTokenId(market, c.tokenType.BULL);
      const tokenIdBear = p.getTokenId(market, c.tokenType.BEAR);
      const tx = market.redeemTokens(c.tokensFor1Eth, 0, c.unix2100, {
        gasPrice: 0,
      });
      await expect(tx).to.emit(market, 'TokensRedeemed');
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBull)).to.equal('0');
      expect(await p.registry.balanceOf(accounts[0].address, tokenIdBear)).to.equal('0');
      expect(await ethers.provider.getBalance(accounts[0].address)).to.equal(balance.add(ethers.utils.parseEther('1')));
      expect(await ethers.provider.getBalance(market.address)).to.equal('0');
      expect(await p.registry.totalSupply(tokenIdBull)).to.equal('0');
      expect(await p.registry.totalSupply(tokenIdBear)).to.equal('0');
      expect(await ethers.provider.getBalance(p.beneficiary)).to.equal('0');
    });
  });
});
