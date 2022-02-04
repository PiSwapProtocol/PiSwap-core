import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC1155, ERC721, PiSwapMarket, PiSwapRegistry } from '../../typechain-types';
import c from '../constants';
import { setupWithERC1155, setupWithERC721 } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('NFT purchase: ERC721', async () => {
    let token: ERC721;
    let registry: PiSwapRegistry;
    let market: PiSwapMarket;

    before(async () => {
      [registry, market, token] = await setupWithERC721();
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('2'),
      });
      await registry.setApprovalForAll(market.address, true);
      await token.setApprovalForAll(market.address, true);
      await market.addLiquidity(0, ethers.utils.parseEther('1000'), ethers.utils.parseEther('200'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      await market.sellNFT(ethers.utils.parseEther('0.2'), c.unix2100, 1);
    });

    it('should fail if NFT purchase expired', async () => {
      await expect(market.buyNFT(0, 1)).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should not be able to buy NFT if maximum amount of ETH is not met', async () => {
      await expect(
        market.buyNFT(c.unix2100, 1, {
          value: ethers.utils.parseEther('0.19'),
        })
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should successfully buy NFT', async () => {
      expect(await token.ownerOf(0)).to.equal(market.address);
      const tokenBalance = await ethers.provider.getBalance(market.address);
      const tx = market.buyNFT(c.unix2100, 1, {
        value: ethers.utils.parseEther('0.3'),
        gasPrice: 0,
      });
      await expect(tx)
        .to.emit(market, 'NFTPurchase')
        .withArgs(accounts[0].address, ethers.utils.parseEther('0.2'), '1');
      expect(await token.ownerOf(0)).to.equal(accounts[0].address);
      const newTokenBalance = await ethers.provider.getBalance(market.address);
      expect(newTokenBalance).to.equal(tokenBalance.add(ethers.utils.parseEther('0.2')));
    });
  });

  describe('NFT sell: ERC1155', async () => {
    let token: ERC1155;
    let registry: PiSwapRegistry;
    let market: PiSwapMarket;

    before(async () => {
      [registry, market, token] = await setupWithERC1155();
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('4'),
      });
      await registry.setApprovalForAll(market.address, true);
      await token.setApprovalForAll(market.address, true);
      await market.addLiquidity(0, ethers.utils.parseEther('1000'), ethers.utils.parseEther('200'), c.unix2100, {
        value: ethers.utils.parseEther('1'),
      });
      await market.sellNFT(ethers.utils.parseEther('0.2'), c.unix2100, 2);
    });

    it('should fail if NFT purchase expired', async () => {
      await expect(market.buyNFT(0, 2)).to.be.revertedWith(c.errorMessages.expired);
    });

    it('should not be able to buy 0 NFTs', async () => {
      await expect(
        market.buyNFT(c.unix2100, 0, {
          value: ethers.utils.parseEther('0.39'),
        })
      ).to.be.revertedWith(c.errorMessages.insufficientAmount);
    });

    it('should not be able to buy NFT if maximum amount of ETH is not met', async () => {
      await expect(
        market.buyNFT(c.unix2100, 2, {
          value: ethers.utils.parseEther('0.39'),
        })
      ).to.be.revertedWith(c.errorMessages.slippage);
    });

    it('should successfully buy NFT', async () => {
      expect(await token.balanceOf(market.address, 0)).to.equal(2);
      const tokenBalance = await ethers.provider.getBalance(market.address);
      const tx = market.buyNFT(c.unix2100, 2, {
        value: ethers.utils.parseEther('0.5'),
        gasPrice: 0,
      });
      await expect(tx)
        .to.emit(market, 'NFTPurchase')
        .withArgs(accounts[0].address, ethers.utils.parseEther('0.2'), '2');
      expect(await token.balanceOf(accounts[0].address, 0)).to.equal(2);
      const newTokenBalance = await ethers.provider.getBalance(market.address);
      expect(newTokenBalance).to.equal(tokenBalance.add(ethers.utils.parseEther('0.4')));
    });
  });
});
