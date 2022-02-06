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

  describe('NFT swap enabled check', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;

    before(async () => {
      p = await PiSwap.create();
      market = await p.deplyoMarketERC721();
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('2'),
      });
    });

    it('The NFT Value should be 1', async () => {
      await market.addLiquidity(0, ethers.utils.parseEther('1000'), ethers.utils.parseEther('1000'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      expect(await market.NFTValue()).to.equal(ethers.utils.parseEther('1'));
      await market.removeLiquidity(ethers.utils.parseEther('1'), 0, 0, 0, c.unix2100);
    });

    it('The NFT Value should be 10', async () => {
      await market.addLiquidity(0, ethers.utils.parseEther('100'), ethers.utils.parseEther('1000'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      expect(await market.NFTValue()).to.equal(ethers.utils.parseEther('10'));
      await market.removeLiquidity(ethers.utils.parseEther('1'), 0, 0, 0, c.unix2100);
    });

    it('The NFT Value should be 0.1', async () => {
      await market.addLiquidity(0, ethers.utils.parseEther('1000'), ethers.utils.parseEther('100'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      expect(await market.NFTValue()).to.equal(ethers.utils.parseEther('0.1'));
      await market.removeLiquidity(ethers.utils.parseEther('1'), 0, 0, 0, c.unix2100);
    });

    it('NFT Swap should be disabled if swap is not initialized', async () => {
      expect(await market.NFTSwapEnabled()).to.be.false;
    });

    it('NFT Swap should be disabled if liquidity is less than 10 times the NFT value', async () => {
      await market.addLiquidity(
        0,
        ethers.utils.parseEther('1000'),
        ethers.utils.parseEther('200.000000000000001'),
        c.unix2100,
        {
          value: ethers.utils.parseEther('1'),
        }
      );
      expect(await market.NFTSwapEnabled()).to.be.false;
    });

    it('NFT Swap should be enabled if liquidity is at least 10 times the NFT value', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: 10,
      });
      expect(await market.NFTSwapEnabled()).to.be.true;
    });
  });
});
