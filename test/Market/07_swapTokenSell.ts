import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwapMarket, PiSwapRegistry } from '../../typechain-types';
import c from '../constants';
import { setupWithERC721 } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Swap sell tokens', async () => {
    let registry: PiSwapRegistry;
    let market: PiSwapMarket;
    let bullTokenId: BigNumber;
    let bearTokenId: BigNumber;

    before(async () => {
      [registry, market] = await setupWithERC721();
      bullTokenId = await registry.getTokenId(market.address, c.tokenType.BULL);
      bearTokenId = await registry.getTokenId(market.address, c.tokenType.BEAR);
      await registry.connect(accounts[1]).setApprovalForAll(market.address, true);
      await market.connect(accounts[1]).purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      await registry.setApprovalForAll(market.address, true);
    });

    it('should not be able to swap when no liquidity present', async () => {
      await expect(
        market.swapTokenToEth(c.tokenType.BULL, ethers.utils.parseEther('1'), 0, c.unix2100)
      ).to.be.revertedWith(c.errorMessages.reserveEmpty);
      await market
        .connect(accounts[1])
        .addLiquidity(0, ethers.utils.parseEther('5000'), ethers.utils.parseEther('5000'), c.unix2100, {
          value: ethers.utils.parseEther('2'),
        });
    });

    it('should fail if deadline was reached', async () => {
      await expect(market.swapTokenToEth(c.tokenType.BULL, ethers.utils.parseEther('1'), 0, 0)).to.be.revertedWith(
        c.errorMessages.expired
      );
    });

    it('should fail if no Tokens were sent', async () => {
      await expect(market.swapTokenToEth(c.tokenType.BULL, 0, 0, c.unix2100)).to.be.reverted;
    });

    it('should not be able to swap liquidity tokens', async () => {
      await expect(
        market.swapTokenToEth(c.tokenType.LIQUIDITY, ethers.utils.parseEther('1'), 0, c.unix2100)
      ).to.be.revertedWith(c.errorMessages.disallowLiquidity);
    });

    it('should fail if minimum tokens out not reached', async () => {
      await expect(
        market.swapTokenToEth(
          c.tokenType.BULL,
          ethers.utils.parseEther('1'),
          ethers.utils.parseEther('100'),
          c.unix2100
        )
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should be able to swap bull tokens for eth', async () => {
      const tokenBalance = await registry.balanceOf(accounts[0].address, bullTokenId);
      const ethBalance = await ethers.provider.getBalance(accounts[0].address);
      const tx = market.swapTokenToEth(c.tokenType.BULL, c.afterFee5000Tokens, 0, c.unix2100, {
        gasPrice: 0,
      });
      await expect(tx)
        .to.emit(market, 'SwapTokenSell')
        .withArgs(accounts[0].address, c.tokenType.BULL, c.afterFee5000Tokens, ethers.utils.parseEther('0.5'));
      expect(tokenBalance.sub(await registry.balanceOf(accounts[0].address, bullTokenId))).to.equal(
        c.afterFee5000Tokens
      );
      expect((await ethers.provider.getBalance(accounts[0].address)).sub(ethBalance)).to.equal(
        ethers.utils.parseEther('0.5')
      );
      expect(await market.ethReserve()).to.equal(ethers.utils.parseEther('1.5'));
    });

    it('should be able to swap bear tokens for eth', async () => {
      const tokenBalance = await registry.balanceOf(accounts[0].address, bearTokenId);
      const ethBalance = await ethers.provider.getBalance(accounts[0].address);
      const tx = market.swapTokenToEth(c.tokenType.BEAR, c.afterFee5000Tokens, 0, c.unix2100, {
        gasPrice: 0,
      });
      await (await tx).wait();
      const balanceDifference = (await ethers.provider.getBalance(accounts[0].address)).sub(ethBalance);
      await expect(tx)
        .to.emit(market, 'SwapTokenSell')
        .withArgs(accounts[0].address, c.tokenType.BEAR, c.afterFee5000Tokens, balanceDifference);
      expect(tokenBalance.sub(await registry.balanceOf(accounts[0].address, bearTokenId))).to.equal(
        c.afterFee5000Tokens
      );
      expect(balanceDifference).to.equal('500250501002004008');
      expect(await market.ethReserve()).to.equal('999749498997995992');
    });
  });
});
