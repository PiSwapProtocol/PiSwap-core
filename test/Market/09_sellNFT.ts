import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC1155, ERC721, PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('NFT sell: ERC721', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    let token: ERC721;

    before(async () => {
      p = await PiSwap.create();
      token = await p.deployERC721();
      market = await p.deployMarket({ address: token.address, tokenId: '0' });
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.999999999999999999'),
      });
      await token.setApprovalForAll(market.address, true);
    });

    it('should fail if NFT sell expired', async () => {
      await expect(market.sellNFT(0, 0, 1)).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should not be able to sell NFT if bull/bear swap not initialized', async () => {
      await expect(market.sellNFT(0, c.unix2100, 1)).to.be.revertedWith(c.errorMessages.reserveEmpty);
    });

    it('should fail if NFT swapping is not enabled', async () => {
      await market.addLiquidity(0, ethers.utils.parseEther('1000'), ethers.utils.parseEther('200'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });

      await expect(market.sellNFT(0, c.unix2100, 1)).to.be.revertedWith(c.errorMessages.swappingNotEnabled);
    });

    it('should not be able to sell NFT if minimum amount of ETH is not met', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('0.000000000000000001'),
      });

      await expect(market.sellNFT(ethers.utils.parseEther('0.20000000000000001'), c.unix2100, 1)).to.be.revertedWith(
        c.errorMessages.slippage
      );
    });

    it('should successfully sell NFT', async () => {
      const tx = market.sellNFT(ethers.utils.parseEther('0.2'), c.unix2100, 1);
      await expect(tx).to.emit(market, 'NFTSell').withArgs(accounts[0].address, ethers.utils.parseEther('0.2'), '1');
    });
  });

  describe('NFT sell: ERC1155', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    let token: ERC1155;

    before(async () => {
      p = await PiSwap.create();
      token = await p.deployERC1155();
      market = await p.deployMarket({ address: token.address, tokenId: '0' });
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.999999999999999999'),
      });
      await token.setApprovalForAll(market.address, true);
    });

    it('should fail if NFT sell expired', async () => {
      await expect(market.sellNFT(0, 0, 1)).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should not be able to sell NFT if bull/bear swap not initialized', async () => {
      await expect(market.sellNFT(0, c.unix2100, 1)).to.be.revertedWith(c.errorMessages.reserveEmpty);
    });

    it('should fail if NFT swapping is not enabled', async () => {
      await market.addLiquidity(0, ethers.utils.parseEther('1000'), ethers.utils.parseEther('200'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });

      await expect(market.sellNFT(0, c.unix2100, 1)).to.be.revertedWith(c.errorMessages.swappingNotEnabled);
    });

    it('should not be able to sell NFT if minimum amount of ETH is not met', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('0.000000000000000001'),
      });

      await expect(market.sellNFT(ethers.utils.parseEther('0.20000000000000001'), c.unix2100, 1)).to.be.revertedWith(
        c.errorMessages.slippage
      );
    });

    it('should fail if amount is set to 0', async () => {
      await expect(market.sellNFT(ethers.utils.parseEther('0.2'), c.unix2100, 0)).to.be.revertedWith(
        c.errorMessages.insufficientAmount
      );
    });

    it('should not be able to sell NFT in case of insufficient liquidity', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.999999999999999999'),
      });
      await expect(market.sellNFT(ethers.utils.parseEther('0.2'), c.unix2100, 2)).to.be.revertedWith(
        c.errorMessages.insufficientLiquidity
      );
    });

    it('should successfully sell NFT', async () => {
      await market.purchaseTokens(0, c.unix2100, {
        value: 1,
      });

      const tx = market.sellNFT(ethers.utils.parseEther('0.2'), c.unix2100, 2);
      await expect(tx).to.emit(market, 'NFTSell').withArgs(accounts[0].address, ethers.utils.parseEther('0.2'), '2');
    });
  });
});
