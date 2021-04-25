const TokenRegistry = artifacts.require('TokenRegistry');
const MarketFactory = artifacts.require('MarketFactory');

module.exports = async (deployer, network, accounts) => {
  const marketFactoryInstance = await MarketFactory.deployed();
  return deployer.deploy(TokenRegistry, accounts[0], marketFactoryInstance.address, '');
};
