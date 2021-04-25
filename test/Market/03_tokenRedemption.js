const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const Proxy = artifacts.require('Proxy');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Token redemption', async () => {
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

    it('should be able to redeem tokens', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: c.afterFee1Eth,
      });
      const balance = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
      const ownerBalance = web3.utils.toBN(await web3.eth.getBalance(ownerAddress));
      const tokenIdBull = await registryInstance.getTokenId(instance.address, c.tokenType.BULL);
      const tokenIdBear = await registryInstance.getTokenId(instance.address, c.tokenType.BEAR);
      const res = await instance.redeemTokens(c.tokensFor1Eth, 0, c.unix2100, {
        gasPrice: 0,
      });

      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBull)).toString(), '0');
      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBear)).toString(), '0');
      assert.equal(
        await web3.eth.getBalance(accounts[0]),
        balance.add(web3.utils.toBN(web3.utils.toWei('0.997'))).toString()
      );
      assert.equal(await web3.eth.getBalance(instance.address), '0');
      assert.equal(await registryInstance.totalSupply(tokenIdBull), '0');
      assert.equal(await registryInstance.totalSupply(tokenIdBear), '0');
      assert.equal(
        (await web3.eth.getBalance(ownerAddress)).toString(),
        ownerBalance.add(web3.utils.toBN(web3.utils.toWei('0.003'))).toString()
      );
      truffleAssert.eventEmitted(res, 'TokensRedeemed');
    });

    it('should fail when redeeming a larger amount than the total supply', async () => {
      await truffleAssert.fails(
        instance.redeemTokens('1', 0, c.unix2100, { from: accounts[2] }),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should fail when having an insufficient balance', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: c.afterFee1Eth,
      });
      await truffleAssert.fails(
        instance.redeemTokens('1', 0, c.unix2100, { from: accounts[2] }),
        truffleAssert.ErrorType.REVERT
      );
      await instance.redeemTokens(c.tokensFor1Eth, 0, c.unix2100);
      assert.equal(
        (await registryInstance.getTotalSupply(instance.address, c.tokenType.BULL)).toString(),
        '0',
        'total supply should be 0 after test'
      );
      assert.equal(
        (await registryInstance.getTotalSupply(instance.address, c.tokenType.BEAR)).toString(),
        '0',
        'total supply should be 0 after test'
      );
    });

    it('should not be able to redeem 0 tokens', async () => {
      await truffleAssert.fails(
        instance.redeemTokens('0', 0, c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.notZero
      );
    });

    it('should fail if minimum amount was not reached', async () => {
      await truffleAssert.fails(
        instance.redeemTokens('0', c.maxUint, c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.minAmount
      );
    });

    it('should fail if deadline was reached', async () => {
      await truffleAssert.fails(
        instance.redeemTokens('0', 0, 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should fail if ETH transfer fails', async () => {
      const proxy = await Proxy.new(instance.address);
      await proxy.purchase({ value: c.afterFee1Eth });
      await truffleAssert.fails(
        proxy.redeem(c.tokensFor1Eth),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.transferFailed
      );
    });
  });

  describe('Token redemption without fees', () => {
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

    it('should be able to redeem tokens', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      const balance = web3.utils.toBN(await web3.eth.getBalance(accounts[0]));
      const tokenIdBull = await registryInstance.getTokenId(instance.address, c.tokenType.BULL);
      const tokenIdBear = await registryInstance.getTokenId(instance.address, c.tokenType.BEAR);
      const res = await instance.redeemTokens(c.tokensFor1Eth, 0, c.unix2100, {
        gasPrice: 0,
      });

      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBull)).toString(), '0');
      assert.equal((await registryInstance.balanceOf(accounts[0], tokenIdBear)).toString(), '0');
      assert.equal(
        await web3.eth.getBalance(accounts[0]),
        balance.add(web3.utils.toBN(web3.utils.toWei('1'))).toString()
      );
      assert.equal(await web3.eth.getBalance(instance.address), '0');
      assert.equal(await registryInstance.totalSupply(tokenIdBull), '0');
      assert.equal(await registryInstance.totalSupply(tokenIdBear), '0');
      assert.equal((await web3.eth.getBalance(ownerAddress)).toString(), '0');
      truffleAssert.eventEmitted(res, 'TokensRedeemed');
    });
  });
});
