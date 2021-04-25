const Token = artifacts.require('SampleERC721');
const Proxy = artifacts.require('Proxy');
const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');
const Market = artifacts.require('Market');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('NFT swap enabled check', async () => {
    let registryInstance;
    let instance;

    before(async () => {
      const proxy = await Proxy.new(c.zeroAddress);
      const token = await Token.new('Test Token', 'TST', '');
      const marketFactory = await MarketFactory.new();
      registryInstance = await TokenRegistry.new(proxy.address, marketFactory.address, '');
      const res = await registryInstance.createMarket(token.address, 0);
      const deployedMarketAddress = res.logs[0].args.market;
      instance = await Market.at(deployedMarketAddress);
      await registryInstance.setApprovalForAll(instance.address, true, {
        from: accounts[1],
      });
      await instance.purchaseTokens(0, c.unix2100, {
        value: web3.utils.toWei('2'),
      });
      await registryInstance.setApprovalForAll(instance.address, true);
    });

    it('The NFT Value should be 1', async () => {
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('1000'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      assert.equal(await instance.NFTValue(), web3.utils.toWei('1'));
      await instance.removeLiquidity(web3.utils.toWei('1'), 0, 0, 0, c.unix2100);
    });

    it('The NFT Value should be 10', async () => {
      await instance.addLiquidity(0, web3.utils.toWei('100'), web3.utils.toWei('1000'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      assert.equal((await instance.NFTValue()).toString(), web3.utils.toWei('10'));
      await instance.removeLiquidity(web3.utils.toWei('1'), 0, 0, 0, c.unix2100);
    });

    it('The NFT Value should be 0.1', async () => {
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('100'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      assert.equal((await instance.NFTValue()).toString(), web3.utils.toWei('0.1'));
      await instance.removeLiquidity(web3.utils.toWei('1'), 0, 0, 0, c.unix2100);
    });

    it('NFT Swap should be disabled if swap is not initialized', async () => {
      assert.equal(await instance.NFTSwapEnabled(), false);
    });

    it('NFT Swap should be disabled if liquidity is less than 10 times the NFT value', async () => {
      await instance.addLiquidity(0, web3.utils.toWei('1000'), web3.utils.toWei('200.000000000000001'), c.unix2100, {
        value: web3.utils.toWei('1'),
      });
      assert.equal(await instance.NFTSwapEnabled(), false);
    });

    it('NFT Swap should be enabled if liquidity is at least 10 times the NFT value', async () => {
      await instance.purchaseTokens(0, c.unix2100, {
        value: 10,
      });
      assert.equal(await instance.NFTSwapEnabled(), true);
    });
  });
});
