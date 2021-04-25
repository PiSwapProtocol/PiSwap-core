const MarketFactory = artifacts.require('MarketFactory');

module.exports = function (deployer) {
  deployer.deploy(MarketFactory);
};
