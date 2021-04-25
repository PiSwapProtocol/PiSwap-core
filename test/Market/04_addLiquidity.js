const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Adding liquidity', async () => {
    let registryInstance;
    let instance;
    let ownerAddress = accounts[8];
    let bullTokenId;
    let bearTokenId;
    let LiquidityTokenId;

    before(async () => {
      const token = await Token.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      bullTokenId = await registryInstance.getTokenId(instance.address, c.tokenType.BULL);
      bearTokenId = await registryInstance.getTokenId(instance.address, c.tokenType.BEAR);
      LiquidityTokenId = await registryInstance.getTokenId(instance.address, c.tokenType.LIQUIDITY);
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1.5'),
      });
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1.5'),
        from: accounts[1],
      });
    });

    it('should fail if deadline was reached', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('1000'), 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should not be able to provide 0 ETH liquidity', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('1000'), c.unix2100),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should not be able to provide 0 bull tokens', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, 0, web3.utils.toWei('1000'), c.unix2100, {
          value: 1,
        }),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should not be able to provide 0 bear tokens', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, web3.utils.toWei('200'), 0, c.unix2100, {
          value: 1,
        }),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should fail if contract is not approved as operator', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('1000'), c.unix2100, {
          value: web3.utils.toWei('1.5'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.approval
      );
    });

    it('should be able to provide initial liquidity', async () => {
      await registryInstance.setApprovalForAll(instance.address, true);
      const res = await instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('1000'), c.unix2100, {
        value: web3.utils.toWei('1.5'),
      });
      assert.equal((await instance.ethReserve()).toString(), web3.utils.toWei('1.5'));
      assert.equal(
        (await registryInstance.balanceOf(accounts[0], LiquidityTokenId)).toString(),
        web3.utils.toWei('1.5')
      );
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bullTokenId)).toString(),
        web3.utils.toWei('200')
      );
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bearTokenId)).toString(),
        web3.utils.toWei('1000')
      );
      truffleAssert.eventEmitted(res, 'LiquidityAdded', (ev) => {
        return (
          ev.sender === accounts[0] &&
          ev.amountEth.toString() === web3.utils.toWei('1.5') &&
          ev.amountBull.toString() === web3.utils.toWei('200') &&
          ev.amountBear.toString() === web3.utils.toWei('1000')
        );
      });
    });

    it('should fail if min liquidity not reached', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(web3.utils.toWei('2'), web3.utils.toWei('200'), web3.utils.toWei('1000'), c.unix2100, {
          value: web3.utils.toWei('1.5'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should fail if max bull tokens not reached', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, web3.utils.toWei('100'), web3.utils.toWei('1000'), c.unix2100, {
          value: web3.utils.toWei('1.5'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should fail if max bear tokens not reached', async () => {
      await truffleAssert.fails(
        instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('900'), c.unix2100, {
          value: web3.utils.toWei('1.5'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should be able to provide additional liquidity', async () => {
      await registryInstance.setApprovalForAll(instance.address, true, {
        from: accounts[1],
      });
      const res = await instance.addLiquidity(0, web3.utils.toWei('400'), web3.utils.toWei('2000'), c.unix2100, {
        value: web3.utils.toWei('3'),
        from: accounts[1],
      });
      assert.equal((await instance.ethReserve()).toString(), web3.utils.toWei('4.5'));
      assert.equal((await registryInstance.balanceOf(accounts[1], LiquidityTokenId)).toString(), web3.utils.toWei('3'));
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bullTokenId)).toString(),
        web3.utils.toWei('600')
      );
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bearTokenId)).toString(),
        web3.utils.toWei('3000')
      );
      truffleAssert.eventEmitted(res, 'LiquidityAdded', (ev) => {
        return (
          ev.sender === accounts[1] &&
          ev.amountEth.toString() === web3.utils.toWei('3') &&
          ev.amountBull.toString() === web3.utils.toWei('400') &&
          ev.amountBear.toString() === web3.utils.toWei('2000')
        );
      });
    });
  });
});
