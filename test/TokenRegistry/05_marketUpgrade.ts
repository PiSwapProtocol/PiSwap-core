import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { IUpgradeTest, PiSwapRegistry } from '../../typechain-types';
import { deployERC721 } from '../utils';

describe('Registry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Upgrading markets', async () => {
    let registry: PiSwapRegistry;
    let market1: IUpgradeTest;
    let market2: IUpgradeTest;

    before(async () => {
      const token1 = await deployERC721();
      const token2 = await deployERC721();
      const mockMarket = (await (await ethers.getContractFactory('UpgradeTestA')).deploy()) as IUpgradeTest;

      const factory = await ethers.getContractFactory('PiSwapRegistry');
      registry = (await upgrades.deployProxy(factory, [accounts[0].address, mockMarket.address, ''])) as PiSwapRegistry;
      await registry.createMarket(token1.address, '0');
      market1 = await (
        await ethers.getContractFactory('UpgradeTestA')
      ).attach(await registry.markets(token1.address, '0'));
      await registry.createMarket(token2.address, '0');
      market2 = await (
        await ethers.getContractFactory('UpgradeTestA')
      ).attach(await registry.markets(token2.address, '0'));
    });

    it('should be able to upgrade market implementation', async () => {
      expect(await market1.test()).to.equal('1');
      expect(await market2.test()).to.equal('1');
      const newMockMarket = (await (await ethers.getContractFactory('UpgradeTestB')).deploy()) as IUpgradeTest;
      await registry.upgradeTo(newMockMarket.address);
      expect(await market1.test()).to.equal('2');
      expect(await market2.test()).to.equal('2');
    });
  });
});
