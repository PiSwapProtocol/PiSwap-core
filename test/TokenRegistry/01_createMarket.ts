import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC721, Market, TokenRegistry, TokenRegistry__factory } from '../../typechain-types';
import {
  deployERC165,
  deployERC721,
  deployProxy,
  deployTokenRegistry,
  getMarketAddressFromEvent,
  getMarketByAddress,
  setupWithERC1155,
} from '../utils';
import c from '../constants';

describe('TokenRegistry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Creating markets', async () => {
    let registry: TokenRegistry;
    let market: Market;
    let ownerAddress: string;
    let token: ERC721;

    before(async () => {
      ownerAddress = accounts[8].address;
      token = await deployERC721();
      registry = await deployTokenRegistry(ownerAddress);
    });

    it('should create a new market', async () => {
      const tokenAddress = token.address;
      const tokenId = ethers.BigNumber.from(0);
      const tx = registry.createMarket(tokenAddress, tokenId);
      market = await getMarketByAddress(await getMarketAddressFromEvent(tx));
      await expect(tx).to.emit(registry, 'MarketCreated').withArgs(market.address, tokenAddress, tokenId);
      expect(await registry.markets(tokenAddress, 0)).to.equal(market.address);
      const nft = await registry.tokenData(market.address);
      expect(nft.NFTContract).to.equal(tokenAddress); // deep
      expect(nft.tokenId).to.equal(tokenId); // deep
    });

    it('deployed market contract should get owner address from factory', async () => {
      const registry = await TokenRegistry__factory.connect(await market.registry(), ethers.provider);
      expect(await registry.owner()).to.equal(ownerAddress);
    });

    it('deployed market should register ERC721 token', async () => {
      expect(await market.nftType()).to.equal(c.NFTType.ERC721);
    });

    it('deployed market should register ERC1155 token', async () => {
      const [_, market] = await setupWithERC1155(ownerAddress);
      expect(await market.nftType()).to.equal(c.NFTType.ERC1155);
    });

    it('should fail if contract does not implement ERC165', async () => {
      const token = await deployProxy();
      await expect(registry.createMarket(token.address, 0)).to.be.reverted;
    });

    it('should fail if contract has not registered an ERC165 interface for ERC721 or ERC1155', async () => {
      const token = await deployERC165();
      await expect(registry.createMarket(token.address, 0)).to.be.revertedWith(
        c.errorMessages.unsupportedSmartContract
      );
    });

    it('should not allow creating markets if a market already exists', async () => {
      await expect(registry.createMarket(token.address, 0)).to.be.revertedWith(c.errorMessages.marketAlreadyExists);
    });

    it('should not allow creating market for itself', async () => {
      await expect(registry.createMarket(registry.address, 0)).to.be.revertedWith(c.errorMessages.disallowContract);
    });
  });
});
