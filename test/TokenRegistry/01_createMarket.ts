import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC721, MockERC1155, MockERC1155Royalty, PiSwapMarket, PiSwapRegistry__factory } from '../../typechain-types';
import c from '../constants';
import { deployERC165, PiSwap } from '../utils';

describe('Registry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Creating markets', async () => {
    let p: PiSwap;
    let market: PiSwapMarket;
    let ownerAddress: string;
    let token: ERC721;

    before(async () => {
      ownerAddress = accounts[8].address;
      p = await PiSwap.create(ownerAddress);
      token = await p.deployERC721();
    });

    it('should create a new market', async () => {
      expect(await p.registry.marketExists(token.address, 0)).to.be.false;
      await expect(p.registry.getMarketForNFT(token.address, 0)).to.be.revertedWith(
        'PiSwapRegistry#getMarketForNFT: MARKET_DOES_NOT_EXIST'
      );
      const tokenAddress = token.address;
      const tokenId = ethers.BigNumber.from(0);
      const tx = p.registry.createMarket(tokenAddress, tokenId);
      market = await p.getMarket(await p.getMarketAddressFromEvent(tx));
      await expect(tx).to.emit(p.registry, 'MarketCreated').withArgs(market.address, tokenAddress, tokenId);
      expect(await p.registry.getMarketForNFT(tokenAddress, 0)).to.equal(market.address);
      expect(await p.registry.marketExists(token.address, 0)).to.be.true;
    });

    it('deployed market contract should get owner address from factory', async () => {
      const registry = await PiSwapRegistry__factory.connect(await market.registry(), ethers.provider);
      expect(await registry.owner()).to.equal(ownerAddress);
    });

    it('deployed market should register ERC721 token', async () => {
      expect((await market.underlyingNFT()).nftType).to.equal(c.NFTType.ERC721);
    });

    it('deployed market should register ERC1155 token', async () => {
      const market = await p.deplyoMarketERC1155();
      expect((await market.underlyingNFT()).nftType).to.equal(c.NFTType.ERC1155);
    });

    it('should fail if trying to create market for an EOA', async () => {
      await expect(p.registry.createMarket(ethers.constants.AddressZero, 0)).to.be.revertedWith(
        'Transaction reverted: function returned an unexpected amount of data'
      );
    });

    it('should fail if contract does not implement ERC165', async () => {
      const token = await (await ethers.getContractFactory('UpgradeTestA')).deploy();
      await expect(p.registry.createMarket(token.address, 0)).to.be.revertedWith(
        "Transaction reverted: function selector was not recognized and there's no fallback function"
      );
    });

    it('should fail if contract has not registered an ERC165 interface for ERC721 or ERC1155', async () => {
      const token = await deployERC165();
      await expect(p.registry.createMarket(token.address, 0)).to.be.revertedWith(
        'PiSwapRegistry#createMarket: UNSUPPORTED_CONTRACT'
      );
    });

    it('should not allow creating markets if a market already exists', async () => {
      await expect(p.registry.createMarket(token.address, 0)).to.be.revertedWith(
        'PiSwapRegistry#createMarket: MARKET_EXISTS'
      );
    });

    it('should not allow creating market for itself', async () => {
      await expect(p.registry.createMarket(p.registry.address, 0)).to.be.revertedWith(
        'PiSwapRegistry#createMarket: INVALID'
      );
    });

    it('should not allow creating market for non existent ERC721 NFT', async () => {
      await expect(p.registry.createMarket(token.address, 2)).to.be.revertedWith(
        'ERC721: owner query for nonexistent token'
      );
    });

    describe('ERC1155', async () => {
      let erc1155_1: MockERC1155;
      let erc1155_2: MockERC1155Royalty;

      before(async () => {
        erc1155_1 = await (await ethers.getContractFactory('MockERC1155')).deploy();
        erc1155_2 = await (await ethers.getContractFactory('MockERC1155Royalty')).deploy();
      });

      it('should not be able to deploy market for ERC1155 implementing total supply if NFT does not exist', async () => {
        await expect(p.registry.createMarket(erc1155_2.address, 2)).to.be.revertedWith(
          'PiSwapRegistry#createMarket: NON_EXISTENT_NFT'
        );
      });

      it('should be able to deploy market for ERC1155 implementing total supply if NFT exists', async () => {
        await expect(p.registry.createMarket(erc1155_2.address, 1)).to.emit(p.registry, 'MarketCreated');
      });

      it('should be able to create a market for any ERC1155 that does not implement total supply', async () => {
        await expect(p.registry.createMarket(erc1155_1.address, 2)).to.emit(p.registry, 'MarketCreated');
      });
    });
  });
});
