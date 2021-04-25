const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Swap purchase tokens', async () => {
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
      await registryInstance.setApprovalForAll(instance.address, true, { from: accounts[1] });
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('1'),
        from: accounts[1],
      });
    });

    it('should not be able to swap when no liquidity present', async () => {
      await truffleAssert.fails(
        instance.swapEthToToken(c.tokenType.BULL, 0, c.unix2100, {
          value: web3.utils.toWei('1'),
        }),
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
        instance.swapEthToToken(c.tokenType.BULL, 0, 0, {
          value: web3.utils.toWei('1'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.expired
      );
    });

    it('should fail if no ETH is sent', async () => {
      await truffleAssert.fails(
        instance.swapEthToToken(c.tokenType.BULL, 0, c.unix2100),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should not be able to swap liquidity tokens', async () => {
      await truffleAssert.fails(
        instance.swapEthToToken(c.tokenType.LIQUIDITY, 0, c.unix2100, {
          value: web3.utils.toWei('1'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.disallowLiquidity
      );
    });

    it('should fail if minimum tokens out not reached', async () => {
      await truffleAssert.fails(
        instance.swapEthToToken(c.tokenType.BULL, web3.utils.toWei('2500'), c.unix2100, {
          value: web3.utils.toWei('1'),
        }),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.slippage
      );
    });

    it('should be able to swap eth for bull tokens', async () => {
      const ethBalance = await web3.eth.getBalance(accounts[0]);
      const res = await instance.swapEthToToken(c.tokenType.BULL, 0, c.unix2100, {
        value: web3.utils.toWei('1'),
        gasPrice: 0,
      });
      assert.equal(ethBalance - (await web3.eth.getBalance(accounts[0])), web3.utils.toWei('1'));
      assert.equal((await registryInstance.balanceOf(accounts[0], bullTokenId)).toString(), '2496244366549824737105');
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bullTokenId)).toString(),
        '2503755633450175262895'
      );
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bearTokenId)).toString(),
        web3.utils.toWei('5000')
      );
      assert.equal((await instance.ethReserve()).toString(), web3.utils.toWei('3'));
      await truffleAssert.eventEmitted(res, 'SwapTokenPurchase', (ev) => {
        return (
          ev.sender === accounts[0] &&
          ev.tokenType.toString() === c.tokenType.BULL.toString() &&
          ev.amountIn.toString() === web3.utils.toWei('1') &&
          ev.amountOut.toString() === '2496244366549824737105'
        );
      });
    });

    it('should be able to swap eth for bear tokens', async () => {
      const ethBalance = await web3.eth.getBalance(accounts[0]);
      const res = await instance.swapEthToToken(c.tokenType.BEAR, 0, c.unix2100, {
        value: web3.utils.toWei('1'),
        gasPrice: 0,
      });
      assert.equal(ethBalance - (await web3.eth.getBalance(accounts[0])), web3.utils.toWei('1'));
      assert.equal((await registryInstance.balanceOf(accounts[0], bearTokenId)).toString(), '2494993744999381263456');
      assert.equal(
        (await registryInstance.balanceOf(instance.address, bearTokenId)).toString(),
        '2505006255000618736544'
      );
      assert.equal((await instance.ethReserve()).toString(), web3.utils.toWei('4'));
      await truffleAssert.eventEmitted(res, 'SwapTokenPurchase', (ev) => {
        return (
          ev.sender === accounts[0] &&
          ev.tokenType.toString() === c.tokenType.BEAR.toString() &&
          ev.amountIn.toString() === web3.utils.toWei('1') &&
          ev.amountOut.toString() === '2494993744999381263456'
        );
      });
    });
  });
});
