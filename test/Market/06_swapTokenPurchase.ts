import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Swap purchase tokens', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    let bullTokenId: BigNumber;
    let bearTokenId: BigNumber;

    before(async () => {
      p = await PiSwap.create();
      market = await p.deplyoMarketERC721();
      bullTokenId = await p.registry.getTokenId(market.address, c.tokenType.BULL);
      bearTokenId = await p.registry.getTokenId(market.address, c.tokenType.BEAR);
      await p.registry.connect(accounts[1]).setApprovalForAll(market.address, true);
      await market.connect(accounts[1]).purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
    });

    it('should not be able to swap when no liquidity present', async () => {
      await expect(
        market.swapEthToToken(c.tokenType.BULL, 0, c.unix2100, {
          value: ethers.utils.parseEther('1'),
        })
      ).to.be.revertedWith(c.errorMessages.reserveEmpty);
      await market
        .connect(accounts[1])
        .addLiquidity(0, ethers.utils.parseEther('5000'), ethers.utils.parseEther('5000'), c.unix2100, {
          value: ethers.utils.parseEther('2'),
        });
    });

    it('should fail if deadline was reached', async () => {
      await expect(
        market.swapEthToToken(c.tokenType.BULL, 0, 0, {
          value: ethers.utils.parseEther('1'),
        })
      ).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should fail if no ETH is sent', async () => {
      await expect(market.swapEthToToken(c.tokenType.BULL, 0, c.unix2100)).to.be.reverted;
    });

    it('should not be able to swap liquidity tokens', async () => {
      await expect(
        market.swapEthToToken(c.tokenType.LIQUIDITY, 0, c.unix2100, {
          value: ethers.utils.parseEther('1'),
        })
      ).to.be.revertedWith(c.errorMessages.disallowLiquidity);
    });

    it('should fail if minimum tokens out not reached', async () => {
      await expect(
        market.swapEthToToken(c.tokenType.BULL, ethers.utils.parseEther('2500'), c.unix2100, {
          value: ethers.utils.parseEther('1'),
        })
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should be able to swap eth for bull tokens', async () => {
      const ethBalance = await ethers.provider.getBalance(accounts[0].address);
      const tx = market.swapEthToToken(c.tokenType.BULL, 0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
        gasPrice: 0,
      });
      await expect(tx)
        .to.emit(market, 'SwapTokenPurchase')
        .withArgs(accounts[0].address, c.tokenType.BULL, ethers.utils.parseEther('1'), '2496244366549824737105');

      expect(ethBalance.sub(await ethers.provider.getBalance(accounts[0].address))).to.equal(
        ethers.utils.parseEther('1')
      );
      expect(await p.registry.balanceOf(accounts[0].address, bullTokenId)).to.equal('2496244366549824737105');
      expect(await p.registry.balanceOf(market.address, bullTokenId)).to.equal('2503755633450175262895');
      expect(await p.registry.balanceOf(market.address, bearTokenId)).to.equal(ethers.utils.parseEther('5000'));
      expect(await market.ethReserve()).to.equal(ethers.utils.parseEther('3'));
    });

    it('should be able to swap eth for bear tokens', async () => {
      const ethBalance = await ethers.provider.getBalance(accounts[0].address);
      const tx = market.swapEthToToken(c.tokenType.BEAR, 0, c.unix2100, {
        value: ethers.utils.parseEther('1'),
        gasPrice: 0,
      });
      await expect(tx)
        .to.emit(market, 'SwapTokenPurchase')
        .withArgs(accounts[0].address, c.tokenType.BEAR, ethers.utils.parseEther('1'), '2494993744999381263456');
      expect(ethBalance.sub(await ethers.provider.getBalance(accounts[0].address))).to.equal(
        ethers.utils.parseEther('1')
      );
      expect(await p.registry.balanceOf(accounts[0].address, bearTokenId)).to.equal('2494993744999381263456');
      expect(await p.registry.balanceOf(market.address, bearTokenId)).to.equal('2505006255000618736544');
      expect(await market.ethReserve()).to.equal(ethers.utils.parseEther('4'));
    });
  });
});
