import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC1155, ERC721, FlashloanAttackA, Market, TokenRegistry } from '../../typechain-types';
import c from '../constants';
import { deployFlashloan, deployProxy, setupWithERC1155, setupWithERC721 } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('NFT sell: ERC721', async () => {
    let registry: TokenRegistry;
    let market: Market;
    let token: ERC721;

    before(async () => {
      [registry, market, token] = await setupWithERC721();
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.999999999999999999'),
      });
      await registry.setApprovalForAll(market.address, true);
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
    let registry: TokenRegistry;
    let market: Market;
    let token: ERC1155;

    before(async () => {
      [registry, market, token] = await setupWithERC1155();
      await market.purchaseTokens(0, c.unix2100, {
        value: ethers.utils.parseEther('1.999999999999999999'),
      });
      await registry.setApprovalForAll(market.address, true);
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

  describe('Flashloan protection', async () => {
    let registry: TokenRegistry;
    let market: Market;
    let token: ERC721;
    let flashloan: FlashloanAttackA;

    before(async () => {
      [registry, market, token] = await setupWithERC721();
      flashloan = await deployFlashloan(registry.address, market.address, ethers.utils.parseEther('3.1'));
      await flashloan.setUp1();
      await flashloan.setUp2();
      await token.transferFrom(accounts[0].address, flashloan.address, 0);
    });

    it('should not be able sell NFT if another function was called in the same block by the same address', async () => {
      await expect(flashloan.sellNFT()).to.be.revertedWith(c.errorMessages.flashloanProtection);
    });
    it('should not be able sell NFT if another function was called in the same block originating from the same address', async () => {
      await expect(flashloan.sellNFT_B()).to.be.revertedWith(c.errorMessages.flashloanProtection);
    });
    it('should not fail', async () => {
      await flashloan.sellNFTsuccess();
    });
  });
});
