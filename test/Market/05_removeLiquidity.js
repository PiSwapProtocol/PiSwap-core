const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Proxy = artifacts.require('Proxy');
const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Removing liquidity', async () => {
    let registryInstance;
    let instance;
    let ownerAddress = accounts[8];
    let bullTokenId;
    let bearTokenId;
    let LiquidityTokenId;
    let proxy;

    before(async () => {
      const token = await Token.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      proxy = await Proxy.new(instance.address);
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
      await proxy.purchase({ value: web3.utils.toWei('1.5') });
    });

    it('should fail if deadline was reached', async () => {
      await truffleAssert.fails(
        instance.removeLiquidity(1, web3.utils.toWei('1.5'), web3.utils.toWei('200'), web3.utils.toWei('1000'), 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should not be able to remove when liquidity supply is 0', async () => {
      await truffleAssert.fails(
        instance.removeLiquidity(
          0,
          web3.utils.toWei('1.5'),
          web3.utils.toWei('200'),
          web3.utils.toWei('1000'),
          c.unix2100
        ),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should be able to remove liquidity', async () => {
      await registryInstance.setApprovalForAll(instance.address, true);
      await registryInstance.setApprovalForAll(instance.address, true, { from: accounts[1] });
      await instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('1000'), c.unix2100, {
        value: web3.utils.toWei('1.5'),
        from: accounts[1],
      });
      await instance.addLiquidity(0, web3.utils.toWei('200'), web3.utils.toWei('1000'), c.unix2100, {
        value: web3.utils.toWei('1.5'),
      });
      const res = await instance.removeLiquidity(
        web3.utils.toWei('1.5'),
        web3.utils.toWei('1.5'),
        web3.utils.toWei('200'),
        web3.utils.toWei('1000'),
        c.unix2100,
        {
          from: accounts[1],
        }
      );

      assert.equal((await instance.ethReserve()).toString(), web3.utils.toWei('1.5'));
      assert.equal((await registryInstance.balanceOf(accounts[1], LiquidityTokenId)).toString(), '0');
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bullTokenId)).toString(),
        web3.utils.toWei('200')
      );
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bearTokenId)).toString(),
        web3.utils.toWei('1000')
      );
      truffleAssert.eventEmitted(res, 'LiquidityRemoved', (ev) => {
        return (
          ev.sender === accounts[1] &&
          ev.amountEth.toString() === web3.utils.toWei('1.5') &&
          ev.amountBull.toString() === web3.utils.toWei('200') &&
          ev.amountBear.toString() === web3.utils.toWei('1000')
        );
      });
    });

    it('should fail due to insufficient balance', async () => {
      await truffleAssert.fails(
        instance.removeLiquidity(
          web3.utils.toWei('1.5'),
          web3.utils.toWei('1.5'),
          web3.utils.toWei('200'),
          web3.utils.toWei('1000'),
          c.unix2100,
          { from: accounts[1] }
        ),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.burnInsufficientBalance
      );
    });

    it('should fail if min eth not reached', async () => {
      await truffleAssert.fails(
        instance.removeLiquidity(
          web3.utils.toWei('1.5'),
          web3.utils.toWei('1.6'),
          web3.utils.toWei('200'),
          web3.utils.toWei('1000'),
          c.unix2100
        ),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should fail if min bull tokens not reached', async () => {
      await truffleAssert.fails(
        instance.removeLiquidity(
          web3.utils.toWei('1.5'),
          web3.utils.toWei('1.5'),
          web3.utils.toWei('201'),
          web3.utils.toWei('1000'),
          c.unix2100
        ),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should fail if min bear tokens not reached', async () => {
      await truffleAssert.fails(
        instance.removeLiquidity(
          web3.utils.toWei('1.5'),
          web3.utils.toWei('1.5'),
          web3.utils.toWei('200'),
          web3.utils.toWei('1001'),
          c.unix2100
        ),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });
  });
});
