const TokenRegistry = artifacts.require('TokenRegistry');

contract('TokenRegistry', (accounts) => {
  describe('Test deployment', () => {
    let instance;
    before(async () => {
      instance = await TokenRegistry.new(accounts[0], accounts[1], '');
    });
    it('should set up the owner address correctly', async () => {
      assert.equal(await instance.owner(), accounts[0]);
    });
    it('should set up the factory address correctly', async () => {
      assert.equal(await instance.factory(), accounts[1]);
    });
  });
});
