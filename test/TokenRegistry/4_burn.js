const TokenRegistry = artifacts.require('TokenRegistry');
const truffleAssert = require('truffle-assertions');
const c = require('../constants');

contract('TokenRegistry', async (accounts) => {
  describe('burning', async () => {
    let instance;
    before(async () => {
      instance = await TokenRegistry.new(accounts[0], accounts[1], '');
    });
    it('should not be able to burn tokens from non market accounts', async () => {
      await truffleAssert.fails(
        instance.burn(accounts[1], 1, c.tokenType.BULL),
        truffleAssert.ErrorType.REVERT,
        c.errorMessages.onlyMarkets
      );
    });
  });
});
