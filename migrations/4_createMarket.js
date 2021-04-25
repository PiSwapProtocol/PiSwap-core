const Token = artifacts.require('SampleERC721');
const TokenRegistry = artifacts.require('TokenRegistry');

module.exports = async (deployer) => {
  tokenInstance = await Token.new(
    'ETH diamond rainbow',
    'EDR',
    'https://ipfs.moralis.io:2053/ipfs/QmPoa3RCwtToRrvc37rcBwQMTwptnBqkYkzZWre9CeSkeX'
  );
  tokenRegistryInstance = await TokenRegistry.deployed();

  await tokenRegistryInstance.createMarket(tokenInstance.address, 0);
};
