const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Proxy = artifacts.require('Proxy');
const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Token purchase', async () => {
    let registryInstance;
    let instance;
    let ownerAddress = accounts[8];
    before(async () => {
      const token = await Token.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
    });

    it('should be able to purchase tokens', async () => {
      const ownerBalance = web3.utils.toBN(await web3.eth.getBalance(ownerAddress));
      const tokenIdBull = await registryInstance.getTokenId(instance.address, c.tokenType.BULL);
      const tokenIdBear = await registryInstance.getTokenId(instance.address, c.tokenType.BEAR);
      const res = await instance.purchaseTokens(0, c.unix2100, {
        value: c.afterFee1Eth,
        gasPrice: 0,
      });
      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBull)).toString(), c.tokensFor1Eth);
      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBear)).toString(), c.tokensFor1Eth);
      assert.equal(await web3.eth.getBalance(instance.address), web3.utils.toWei('1'));
      assert.equal((await registryInstance.totalSupply(tokenIdBull)).toString(), c.tokensFor1Eth);
      assert.equal((await registryInstance.totalSupply(tokenIdBear)).toString(), c.tokensFor1Eth);
      assert.equal(
        (await web3.eth.getBalance(ownerAddress)).toString(),
        ownerBalance.add(web3.utils.toBN(c.feeFor1Eth)).toString()
      );
      truffleAssert.eventEmitted(res, 'TokensPurchased');
    });

    it('should fail when sending 0 ETH', async () => {
      await truffleAssert.fails(
        instance.purchaseTokens(0, c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.notZero
      );
    });

    it('should fail if minimum amount was not reached', async () => {
      await truffleAssert.fails(
        instance.purchaseTokens(c.maxUint, c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.minAmount
      );
    });

    it('should fail if deadline was reached', async () => {
      await truffleAssert.fails(instance.purchaseTokens(0, 0), truffleAssert.ErrorType.REVERT, c.errorMessages.expired);
    });
  });
  describe('Token purchase without fees', () => {
    let registryInstance;
    let instance;
    let ownerAddress;
    before(async () => {
      const token = await Token.new('Test Token', 'TST', '');
      ownerAddress = (await Proxy.new(c.zeroAddress)).address;
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
    });

    it('should be able to purchase tokens', async () => {
      const tokenIdBull = await registryInstance.getTokenId(instance.address, c.tokenType.BULL);
      const tokenIdBear = await registryInstance.getTokenId(instance.address, c.tokenType.BEAR);
      const res = await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1'),
        gasPrice: 0,
      });
      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBull)).toString(), c.tokensFor1Eth);
      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBear)).toString(), c.tokensFor1Eth);
      assert.equal(await web3.eth.getBalance(instance.address), web3.utils.toWei('1'));
      assert.equal((await registryInstance.totalSupply(tokenIdBull)).toString(), c.tokensFor1Eth);
      assert.equal((await registryInstance.totalSupply(tokenIdBear)).toString(), c.tokensFor1Eth);
      assert.equal((await web3.eth.getBalance(ownerAddress)).toString(), '0');
      truffleAssert.eventEmitted(res, 'TokensPurchased');
    });
  });
});
