import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Market, ProxyTest, TokenRegistry } from '../../typechain-types';
import c from '../constants';
import { deployProxy, setupWithERC721 } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Removing liquidity', async () => {
    let registry: TokenRegistry;
    let market: Market;
    let bullTokenId: BigNumber;
    let bearTokenId: BigNumber;
    let LiquidityTokenId: BigNumber;
    let proxy: ProxyTest;

    before(async () => {
      [registry, market] = await setupWithERC721();
      proxy = await deployProxy(market.address);
      bullTokenId = await registry.getTokenId(market.address, c.tokenType.BULL);
      bearTokenId = await registry.getTokenId(market.address, c.tokenType.BEAR);
      LiquidityTokenId = await registry.getTokenId(market.address, c.tokenType.LIQUIDITY);
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.5'),
      });
      await market.connect(accounts[1]).purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.5'),
      });
      await proxy.purchase({ value: ethers.utils.parseEther('1.5') });
    });

    it('should fail if deadline was reached', async () => {
      await expect(
        market.removeLiquidity(
          1,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000'),
          0
        )
      ).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should not be able to remove when liquidity supply is 0', async () => {
      await expect(
        market.removeLiquidity(
          0,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000'),
          c.unix2100
        )
      ).to.be.reverted;
    });

    it('should be able to remove liquidity', async () => {
      await registry.setApprovalForAll(market.address, true);
      await registry.connect(accounts[1]).setApprovalForAll(market.address, true);
      await market
        .connect(accounts[1])
        .addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('1000'), c.unix2100, {
          value: ethers.utils.parseEther('1.5'),
        });
      await market.addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('1000'), c.unix2100, {
        value: ethers.utils.parseEther('1.5'),
      });
      const tx = market
        .connect(accounts[1])
        .removeLiquidity(
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000'),
          c.unix2100
        );
      await expect(tx)
        .to.emit(market, 'LiquidityRemoved')
        .withArgs(
          accounts[1].address,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000')
        );
      expect(await market.ethReserve()).to.equal(ethers.utils.parseEther('1.5'));
      expect(await registry.balanceOf(accounts[1].address, LiquidityTokenId)).to.equal('0');
      expect(await registry.balanceOf(market.address, bullTokenId)).to.equal(ethers.utils.parseEther('200'));
      expect(await registry.balanceOf(market.address, bearTokenId)).to.equal(ethers.utils.parseEther('1000'));
    });

    it('should fail due to insufficient balance', async () => {
      await expect(
        market
          .connect(accounts[1])
          .removeLiquidity(
            ethers.utils.parseEther('1.5'),
            ethers.utils.parseEther('1.5'),
            ethers.utils.parseEther('200'),
            ethers.utils.parseEther('1000'),
            c.unix2100
          )
      ).to.be.revertedWith(c.errorMessages.burnInsufficientBalance);
    });

    it('should fail if min eth not reached', async () => {
      await expect(
        market.removeLiquidity(
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.6'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000'),
          c.unix2100
        )
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should fail if min bull tokens not reached', async () => {
      await expect(
        market.removeLiquidity(
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('201'),
          ethers.utils.parseEther('1000'),
          c.unix2100
        )
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should fail if min bear tokens not reached', async () => {
      await expect(
        market.removeLiquidity(
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1001'),
          c.unix2100
        )
      ).to.be.revertedWith(c.errorMessages.slippage);
    });
  });
});
