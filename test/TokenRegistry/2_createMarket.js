const Token = artifacts.require('SampleERC721');
const Token1155 = artifacts.require('SampleERC1155');
const ERC165 = artifacts.require('SampleERC165');
const EmptyContract = artifacts.require('EmptyContract');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('TokenRegistry', async (accounts) => {
  describe('Creating markets', async () => {
    let instance;
    let marketAddress;
    let ownerAddress;
    let token;

    before(async () => {
      ownerAddress = accounts[8];
      token = await Token.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      instance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
    });

    it('should create a new market', async () => {
      const tokenAddress = token.address;
      const tokenId = web3.utils.toBN(0);
      await truffleAssert.eventEmitted(await instance.createMarket(tokenAddress, tokenId), 'MarketCreated', (ev) => {
        marketAddress = ev.market;
        return tokenAddress === ev.NFTContract && tokenId.eq(ev.tokenId);
      });
      assert.equal(await instance.markets(tokenAddress, 0), marketAddress);
      const nft = await instance.tokenData(marketAddress);
      assert.deepEqual(nft.NFTContract, tokenAddress);
      assert.deepEqual(nft.tokenId, tokenId);
    });

    it('deployed market contract should get owner address from factory', async () => {
      const marketInstance = await Market.at(marketAddress);
      const registry = await TokenRegistry.at(await marketInstance.registry());
      assert.equal(await registry.owner(), ownerAddress);
    });

    it('deployed market should register ERC721 token', async () => {
      const marketInstance = await Market.at(marketAddress);
      assert.equal(await marketInstance.nftType(), c.NFTType.ERC721);
    });

    it('deployed market should register ERC1155 token', async () => {
      const token = await Token1155.new();
      const marketFactory = await MarketFactory.new();
      const instance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
      const tx = await instance.createMarket(token.address, 0);
      const marketAddress = tx.logs[0].args.market;
      const marketInstance = await Market.at(marketAddress);
      assert.equal(await marketInstance.nftType(), c.NFTType.ERC1155);
    });

    it('should fail if contract does not implement ERC165', async () => {
      const token = await EmptyContract.new();
      await truffleAssert.fails(instance.createMarket(token.address, 0), truffleAssert.ErrorType.REVERT);
    });

    it('should fail if contract has not registered an ERC165 interface for ERC721 or ERC1155', async () => {
      const token = await ERC165.new();
      await truffleAssert.fails(
        instance.createMarket(token.address, 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.unsupportedSmartContract
      );
    });

    it('should not allow creating markets if a market already exists', async () => {
      await truffleAssert.fails(
        instance.createMarket(token.address, 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.marketAlreadyExists
      );
    });

    it('should not allow creating market for itself', async () => {
      await truffleAssert.fails(
        instance.createMarket(instance.address, 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.disallowContract
      );
    });
  });
});
