import { ethers, network, upgrades } from 'hardhat';

let registryAddress: string;
if (network.name === 'rinkeby') {
  registryAddress = '0x15db2Ec270863a12d20bAad32a87B14d7E512E6B';
} else {
  throw new Error('unsupported network');
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log('Upgrading contract with account:', deployer.address);
  const market = await (await ethers.getContractFactory('PiSwapMarket')).deploy();
  const registry = await ethers.getContractAt('PiSwapRegistry', registryAddress, deployer);
  const tx = await registry.upgradeTo(market.address);
  console.log(tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
