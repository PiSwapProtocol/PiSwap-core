import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC721, PiSwapMarket, PiSwapRegistry__factory } from '../../typechain-types';
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
      const tokenAddress = token.address;
      const tokenId = ethers.BigNumber.from(0);
      const tx = p.registry.createMarket(tokenAddress, tokenId);
      market = await p.getMarket(await p.getMarketAddressFromEvent(tx));
      await expect(tx).to.emit(p.registry, 'MarketCreated').withArgs(market.address, tokenAddress, tokenId);
      expect(await p.registry.markets(tokenAddress, 0)).to.equal(market.address);
      const nft = await p.registry.nftInfo(market.address);
      expect(nft.tokenAddress).to.equal(tokenAddress);
      expect(nft.tokenId).to.equal(tokenId);
      expect(await p.registry.marketExists(token.address, 0)).to.be.true;
    });

    it('deployed market contract should get owner address from factory', async () => {
      const registry = await PiSwapRegistry__factory.connect(await market.registry(), ethers.provider);
      expect(await registry.owner()).to.equal(ownerAddress);
    });

    it('deployed market should register ERC721 token', async () => {
      expect((await market.nftData()).nftType).to.equal(c.NFTType.ERC721);
    });

    it('deployed market should register ERC1155 token', async () => {
      const market = await p.deplyoMarketERC1155();
      expect((await market.nftData()).nftType).to.equal(c.NFTType.ERC1155);
    });

    it('should fail if contract does not implement ERC165', async () => {
      const token = await (await ethers.getContractFactory('UpgradeTestA')).deploy();
      await expect(p.registry.createMarket(token.address, 0)).to.be.reverted;
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
  });
});
