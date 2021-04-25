const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Swap sell tokens', async () => {
    let registryInstance;
    let instance;
    let ownerAddress = accounts[8];
    let bullTokenId;
    let bearTokenId;

    before(async () => {
      const token = await Token.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(ownerAddress, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      bullTokenId = await registryInstance.getTokenId(instance.address, c.tokenType.BULL);
      bearTokenId = await registryInstance.getTokenId(instance.address, c.tokenType.BEAR);
      await registryInstance.setApprovalForAll(instance.address, true, {
        from: accounts[1],
      });
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1'),
        from: accounts[1],
      });
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      await registryInstance.setApprovalForAll(instance.address, true);
    });

    it('should not be able to swap when no liquidity present', async () => {
      await truffleAssert.fails(
        instance.swapTokenToEth(c.tokenType.BULL, web3.utils.toWei('1'), 0, c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.reserveEmpty
      );
      await instance.addLiquidity(0, web3.utils.toWei('5000'), web3.utils.toWei('5000'), c.unix2100, {
        value: web3.utils.toWei('2'),
        from: accounts[1],
      });
    });

    it('should fail if deadline was reached', async () => {
      await truffleAssert.fails(
        instance.swapTokenToEth(c.tokenType.BULL, web3.utils.toWei('1'), 0, 0),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should fail if no Tokens were sent', async () => {
      await truffleAssert.fails(
        instance.swapTokenToEth(c.tokenType.BULL, 0, 0, c.unix2100),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should not be able to swap liquidity tokens', async () => {
      await truffleAssert.fails(
        instance.swapTokenToEth(c.tokenType.LIQUIDITY, web3.utils.toWei('1'), 0, c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.disallowLiquidity
      );
    });

    it('should fail if minimum tokens out not reached', async () => {
      await truffleAssert.fails(
        instance.swapTokenToEth(c.tokenType.BULL, web3.utils.toWei('1'), web3.utils.toWei('100'), c.unix2100),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should be able to swap bull tokens for eth', async () => {
      const tokenBalance = await registryInstance.balanceOf(accounts[0], bullTokenId);
      const ethBalance = await web3.eth.getBalance(accounts[0]);
      const res = await instance.swapTokenToEth(c.tokenType.BULL, c.afterFee5000Tokens, 0, c.unix2100, {
        gasPrice: 0,
      });
      assert.equal(
        tokenBalance.sub(await registryInstance.balanceOf(accounts[0], bullTokenId)).toString(),
        c.afterFee5000Tokens
      );
      assert.equal(((await web3.eth.getBalance(accounts[0])) - ethBalance).toString(), web3.utils.toWei('0.5'));
      assert.equal((await instance.ethReserve()).toString(), web3.utils.toWei('1.5'));
      await truffleAssert.eventEmitted(res, 'SwapTokenSell', (ev) => {
        return (
          ev.sender === accounts[0] &&
          ev.tokenType.toString() === c.tokenType.BULL.toString() &&
          ev.amountIn.toString() === c.afterFee5000Tokens &&
          ev.amountOut.toString() === web3.utils.toWei('0.5')
        );
      });
    });

    it('should be able to swap bear tokens for eth', async () => {
      const tokenBalance = await registryInstance.balanceOf(accounts[0], bearTokenId);
      const ethBalance = await web3.eth.getBalance(accounts[0]);
      const res = await instance.swapTokenToEth(c.tokenType.BEAR, c.afterFee5000Tokens, 0, c.unix2100, {
        gasPrice: 0,
      });
      assert.equal(
        tokenBalance.sub(await registryInstance.balanceOf(accounts[0], bearTokenId)).toString(),
        c.afterFee5000Tokens
      );
      const balanceDifference = web3.utils
        .toBN(await web3.eth.getBalance(accounts[0]))
        .sub(web3.utils.toBN(ethBalance))
        .toString();

      assert.equal(balanceDifference, '500250501002004008');
      assert.equal((await instance.ethReserve()).toString(), '999749498997995992');
      await truffleAssert.eventEmitted(res, 'SwapTokenSell', (ev) => {
        return (
          ev.sender === accounts[0] &&
          ev.tokenType.toString() === c.tokenType.BEAR.toString() &&
          ev.amountIn.toString() === c.afterFee5000Tokens &&
          ev.amountOut.toString() === balanceDifference
        );
      });
    });
  });
});
