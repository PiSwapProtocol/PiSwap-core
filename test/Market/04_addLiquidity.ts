import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Market, TokenRegistry } from '../../typechain-types';
import c from '../constants';
import { setupWithERC721 } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Adding liquidity', async () => {
    let registry: TokenRegistry;
    let market: Market;
    let bullTokenId: BigNumber;
    let bearTokenId: BigNumber;
    let LiquidityTokenId: BigNumber;

    before(async () => {
      [registry, market] = await setupWithERC721();
      bullTokenId = await registry.getTokenId(market.address, c.tokenType.BULL);
      bearTokenId = await registry.getTokenId(market.address, c.tokenType.BEAR);
      LiquidityTokenId = await registry.getTokenId(market.address, c.tokenType.LIQUIDITY);
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.5'),
      });
      await market.connect(accounts[1]).purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.5'),
      });
    });

    it('should fail if deadline was reached', async () => {
      await expect(
        market.addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('1000'), 0)
      ).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should not be able to provide 0 ETH liquidity', async () => {
      await expect(market.addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('1000'), c.unix2100))
        .to.be.reverted;
    });

    it('should not be able to provide 0 bull tokens', async () => {
      await expect(
        market.addLiquidity(0, 0, ethers.utils.parseEther('1000'), c.unix2100, {
          value: 1,
        })
      ).to.be.reverted;
    });

    it('should not be able to provide 0 bear tokens', async () => {
      await expect(
        market.addLiquidity(0, ethers.utils.parseEther('200'), 0, c.unix2100, {
          value: 1,
        })
      ).to.be.reverted;
    });

    it('should fail if contract is not approved as operator', async () => {
      await expect(
        market.addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('1000'), c.unix2100, {
          value: ethers.utils.parseEther('1.5'),
        })
      ).to.be.revertedWith(c.errorMessages.approval);
    });

    it('should be able to provide initial liquidity', async () => {
      await registry.setApprovalForAll(market.address, true);
      const tx = market.addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('1000'), c.unix2100, {
        value: ethers.utils.parseEther('1.5'),
      });
      await expect(tx)
        .to.emit(market, 'LiquidityAdded')
        .withArgs(
          accounts[0].address,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000')
        );
      expect(await market.ethReserve()).to.be.equal(ethers.utils.parseEther('1.5'));
      expect(await registry.balanceOf(accounts[0].address, LiquidityTokenId)).to.be.equal(
        ethers.utils.parseEther('1.5')
      );
      expect(await registry.balanceOf(market.address, bullTokenId)).to.be.equal(ethers.utils.parseEther('200'));
      expect(await registry.balanceOf(market.address, bearTokenId)).to.be.equal(ethers.utils.parseEther('1000'));
    });

    it('should fail if min liquidity not reached', async () => {
      await expect(
        market.addLiquidity(
          ethers.utils.parseEther('2'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000'),
          c.unix2100,
          {
            value: ethers.utils.parseEther('1.5'),
          }
        )
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should fail if max bull tokens not reached', async () => {
      await expect(
        market.addLiquidity(0, ethers.utils.parseEther('100'), ethers.utils.parseEther('1000'), c.unix2100, {
          value: ethers.utils.parseEther('1.5'),
        })
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should fail if max bear tokens not reached', async () => {
      await expect(
        market.addLiquidity(0, ethers.utils.parseEther('200'), ethers.utils.parseEther('900'), c.unix2100, {
          value: ethers.utils.parseEther('1.5'),
        })
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should be able to provide additional liquidity', async () => {
      await registry.connect(accounts[1]).setApprovalForAll(market.address, true);
      const tx = market
        .connect(accounts[1])
        .addLiquidity(0, ethers.utils.parseEther('400'), ethers.utils.parseEther('2000'), c.unix2100, {
          value: ethers.utils.parseEther('3'),
        });
      await expect(tx)
        .to.emit(market, 'LiquidityAdded')
        .withArgs(
          accounts[1].address,
          ethers.utils.parseEther('3'),
          ethers.utils.parseEther('400'),
          ethers.utils.parseEther('2000')
        );
      expect(await market.ethReserve()).to.equal(ethers.utils.parseEther('4.5'));
      expect(await registry.balanceOf(accounts[1].address, LiquidityTokenId)).to.equal(ethers.utils.parseEther('3'));
      expect(await registry.balanceOf(market.address, bullTokenId)).to.equal(ethers.utils.parseEther('600'));
      expect(await registry.balanceOf(market.address, bearTokenId)).to.equal(ethers.utils.parseEther('3000'));
    });
  });
});
