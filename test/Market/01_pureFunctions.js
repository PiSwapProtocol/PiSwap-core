const Market = artifacts.require('Market');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('Market', async (accounts) => {
  describe('Pure functions', async () => {
    let instance;
    before(async () => {
      instance = await Market.new(accounts[0], 0, accounts[7], 0);
    });

    it('max supply should be 1,000,000 tokens', async () => {
      assert.equal(await instance.MAX_SUPPLY(), web3.utils.toWei('1000000'));
    });

    it('should return the correct token supply for deposited ETH', async () => {
      assert.equal((await instance.tokenFormula(0)).toString(), '0');
      assert.equal((await instance.tokenFormula(web3.utils.toWei('1'))).toString(), c.after1Eth);
      assert.equal((await instance.tokenFormula(web3.utils.toWei('100'))).toString(), web3.utils.toWei('500000'));
    });

    it('token formula safe math checks: addition overflow', async () => {
      await truffleAssert.fails(instance.tokenFormula(c.maxUint), truffleAssert.ErrorType.REVERT);
    });

    it('should return the correct deposited ETH supply for a token supply', async () => {
      assert.equal((await instance.inverseTokenFormula(0)).toString(), '0');
      assert.equal((await instance.inverseTokenFormula(c.after1Eth)).toString(), web3.utils.toWei('1'));
      assert.equal(
        (await instance.inverseTokenFormula(web3.utils.toWei('500000'))).toString(),
        web3.utils.toWei('100')
      );
    });

    it('inverse token formula safe math checks: division by zero, subtraction overflow', async () => {
      await truffleAssert.fails(
        instance.inverseTokenFormula(web3.utils.toWei('1000000')),
        truffleAssert.ErrorType.REVERT
      );
      await truffleAssert.fails(
        instance.inverseTokenFormula(web3.utils.toWei('1000000') + 1),
        truffleAssert.ErrorType.REVERT
      );
    });

    it('should calculate the correct token id', async () => {
      assert.equal(
        (await instance.getTokenId(c.tokenType.BULL)).toString(),
        web3.utils.hexToNumberString(
          await web3.utils.soliditySha3(
            {
              type: 'address',
              value: instance.address.substring(2),
            },
            { type: 'uint8', value: 0 }
          )
        )
      );
    });
  });
});
