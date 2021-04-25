const Token721 = artifacts.require('SampleERC721');
const Token1155 = artifacts.require('SampleERC1155');
const Proxy = artifacts.require('Proxy');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const FlashloanAttack = artifacts.require('FlashloanAttackA');
const truffleAssertions = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('NFT sell: ERC721', async () => {
    let registryInstance;
    let instance;

    before(async () => {
      const proxy = await Proxy.new(c.zeroAddress);
      const token = await Token721.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(proxy.address, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1.999999999999999999'),
      });
      await registryInstance.setApprovalForAll(instance.address, true);
      await token.setApprovalForAll(instance.address, true);
    });

    it('should fail if NFT sell expired', async () => {
      await truffleAssertions.fails(
        instance.sellNFT(0, 0, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should not be able to sell NFT if bull/bear swap not initialized', async () => {
      await truffleAssertions.fails(
        instance.sellNFT(0, c.unix2100, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.reserveEmpty
      );
    });

    it('should fail if NFT swapping is not enabled', async () => {
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('200'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });

      await truffleAssertions.fails(
        instance.sellNFT(0, c.unix2100, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.swappingNotEnabled
      );
    });

    it('should not be able to sell NFT if minimum amount of ETH is not met', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('0.000000000000000001'),
      });

      await truffleAssertions.fails(
        instance.sellNFT(web3.utils.toWei('0.20000000000000001'), c.unix2100, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should successfully sell NFT', async () => {
      const res = await instance.sellNFT(web3.utils.toWei('0.2'), c.unix2100, 1);

      await truffleAssertions.eventEmitted(res, 'NFTSell', (ev) => {
        return (
          ev.seller === accounts[0] && ev.nftValue.toString() === web3.utils.toWei('0.2'), ev.amount.toString() === '1'
        );
      });
    });
  });

  describe('NFT sell: ERC1155', async () => {
    let registryInstance;
    let instance;

    before(async () => {
      const proxy = await Proxy.new(c.zeroAddress);
      const token = await Token1155.new();
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(proxy.address, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1.999999999999999999'),
      });
      await registryInstance.setApprovalForAll(instance.address, true);
      await token.setApprovalForAll(instance.address, true);
    });

    it('should fail if NFT sell expired', async () => {
      await truffleAssertions.fails(
        instance.sellNFT(0, 0, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should not be able to sell NFT if bull/bear swap not initialized', async () => {
      await truffleAssertions.fails(
        instance.sellNFT(0, c.unix2100, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.reserveEmpty
      );
    });

    it('should fail if NFT swapping is not enabled', async () => {
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('200'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });

      await truffleAssertions.fails(
        instance.sellNFT(0, c.unix2100, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.swappingNotEnabled
      );
    });

    it('should not be able to sell NFT if minimum amount of ETH is not met', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('0.000000000000000001'),
      });

      await truffleAssertions.fails(
        instance.sellNFT(web3.utils.toWei('0.20000000000000001'), c.unix2100, 1),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should fail if amount is set to 0', async () => {
      await truffleAssertions.fails(
        instance.sellNFT(web3.utils.toWei('0.2'), c.unix2100, 0),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.insufficientAmount
      );
    });

    it('should not be able to sell NFT in case of insufficient liquidity', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1.999999999999999999'),
      });
      await truffleAssertions.fails(
        instance.sellNFT(web3.utils.toWei('0.2'), c.unix2100, 2),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.insufficientLiquidity
      );
    });

    it('should successfully sell NFT', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: 1,
      });

      const res = await instance.sellNFT(web3.utils.toWei('0.2'), c.unix2100, 2);

      await truffleAssertions.eventEmitted(res, 'NFTSell', (ev) => {
        return (
          ev.buyer === accounts[0] && ev.nftValue.toString() === web3.utils.toWei('0.2'), ev.amount.toString() === '2'
        );
      });
    });
  });
  describe('Flashloan protection', async () => {
    let registryInstance;
    let deployedMarketAddress;
    let instance;

    before(async () => {
      const proxy = await Proxy.new(c.zeroAddress);
      const token = await Token721.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(proxy.address, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      deployedMarketAddress = res.logs[0].args.market;
      instance = await FlashloanAttack.new(registryInstance.address, deployedMarketAddress, {
        value: web3.utils.toWei('3.1'),
      });
      await instance.setUp1();
      await instance.setUp2();
      token.transferFrom(accounts[0], instance.address, 0);
    });

    it('should not be able sell NFT if another function was called in the same block by the same address', async () => {
      await truffleAssertions.fails(instance.sellNFT(), truffleAssertions.REVERT, c.errorMessages.flashloanProtection);
    });
    it('should not be able sell NFT if another function was called in the same block originating from the same address', async () => {
      await truffleAssertions.fails(
        instance.sellNFT_B(),
        truffleAssertions.REVERT,
        c.errorMessages.flashloanProtection
      );
    });
    it('should not fail', async () => {
      await truffleAssertions.passes(instance.sellNFTsuccess());
    });
  });
});
