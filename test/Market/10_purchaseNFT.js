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
  describe('NFT purchase: ERC721', async () => {
    let token;
    let registryInstance;
    let instance;

    before(async () => {
      const proxy = await Proxy.new(c.zeroAddress);
      token = await Token721.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(proxy.address, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('2'),
      });
      await registryInstance.setApprovalForAll(instance.address, true);
      await token.setApprovalForAll(instance.address, true);
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('200'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      await instance.sellNFT(web3.utils.toWei('0.2'), c.unix2100, 1);
    });

    it('should fail if NFT purchase expired', async () => {
      await truffleAssertions.fails(instance.buyNFT(0, 1), truffleAssertions.ErrorType.REVERT, c.errorMessages.expired);
    });

    it('should not be able to buy NFT if maximum amount of ETH is not met', async () => {
      await truffleAssertions.fails(
        instance.buyNFT(c.unix2100, 1, {
          value: web3.utils.toWei('0.19'),
        }),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should successfully buy NFT', async () => {
      assert.equal(await token.ownerOf(0), instance.address);
      const tokenBalance = web3.utils.toBN(await web3.eth.getBalance(instance.address));
      const res = await instance.buyNFT(c.unix2100, 1, {
        value: web3.utils.toWei('0.3'),
        gasPrice: 0,
      });
      assert.equal(await token.ownerOf(0), accounts[0]);
      const newTokenBalance = web3.utils.toBN(await web3.eth.getBalance(instance.address)).toString();
      assert.equal(newTokenBalance, tokenBalance.add(web3.utils.toBN(web3.utils.toWei('0.2'))).toString());
      await truffleAssertions.eventEmitted(res, 'NFTPurchase', (ev) => {
        return (
          ev.buyer === accounts[0] && ev.nftValue.toString() === web3.utils.toWei('0.2'), ev.amount.toString() === '1'
        );
      });
    });
  });

  describe('NFT sell: ERC1155', async () => {
    let token;
    let registryInstance;
    let instance;

    before(async () => {
      const proxy = await Proxy.new(c.zeroAddress);
      token = await Token1155.new();
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(proxy.address, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('4'),
      });
      await registryInstance.setApprovalForAll(instance.address, true);
      await token.setApprovalForAll(instance.address, true);
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('200'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      await instance.sellNFT(web3.utils.toWei('0.2'), c.unix2100, 2);
    });

    it('should fail if NFT purchase expired', async () => {
      await truffleAssertions.fails(instance.buyNFT(0, 2), truffleAssertions.ErrorType.REVERT, c.errorMessages.expired);
    });

    it('should not be able to buy 0 NFTs', async () => {
      await truffleAssertions.fails(
        instance.buyNFT(c.unix2100, 0, {
          value: web3.utils.toWei('0.39'),
        }),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.insufficientAmount
      );
    });

    it('should not be able to buy NFT if maximum amount of ETH is not met', async () => {
      await truffleAssertions.fails(
        instance.buyNFT(c.unix2100, 2, {
          value: web3.utils.toWei('0.39'),
        }),
        truffleAssertions.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should successfully buy NFT', async () => {
      assert.equal(await token.balanceOf(instance.address, 0), 2);
      const tokenBalance = web3.utils.toBN(await web3.eth.getBalance(instance.address));
      const res = await instance.buyNFT(c.unix2100, 2, {
        value: web3.utils.toWei('0.5'),
        gasPrice: 0,
      });
      assert.equal(await token.balanceOf(accounts[0], 0), 2);
      const newTokenBalance = web3.utils.toBN(await web3.eth.getBalance(instance.address)).toString();
      assert.equal(newTokenBalance, tokenBalance.add(web3.utils.toBN(web3.utils.toWei('0.4'))).toString());
      await truffleAssertions.eventEmitted(res, 'NFTPurchase', (ev) => {
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
        value: web3.utils.toWei('4'),
      });
      await instance.setUp1();
      await instance.setUp2();
      token.transferFrom(accounts[0], instance.address, 0);
      await instance.sellNFTsuccess();
    });

    it('should not be able buy NFT if another function was called in the same block by the same address', async () => {
      await truffleAssertions.fails(instance.buyNFT(), truffleAssertions.REVERT, c.errorMessages.flashloanProtection);
    });
    it('should not be able buy NFT if another function was called in the same block originating from the same address', async () => {
      await truffleAssertions.fails(instance.buyNFT_B(), truffleAssertions.REVERT, c.errorMessages.flashloanProtection);
    });
    it('should not fail', async () => {
      await truffleAssertions.passes(instance.buyNFTsuccess());
    });
  });
});
