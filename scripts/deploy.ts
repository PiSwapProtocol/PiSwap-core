import { ethers, network, upgrades } from 'hardhat';

let WETH: string;
if (network.name === 'mainnet') {
  WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
} else if (network.name === 'rinkeby') {
  WETH = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
} else {
  throw new Error('unsupported network');
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);
  const market = await (await ethers.getContractFactory('PiSwapMarket')).deploy();
  const factory = await ethers.getContractFactory('PiSwapRegistry');
  const contract = await upgrades.deployProxy(factory, [deployer.address, deployer.address, market.address, WETH, '']);
  console.log('Contract address:', contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
