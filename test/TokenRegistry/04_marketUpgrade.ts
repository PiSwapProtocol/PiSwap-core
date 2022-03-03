import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { IUpgradeTest } from '../../typechain-types';
import { PiSwap } from '../utils';

describe('Registry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Upgrading markets', async () => {
    let p: PiSwap;
    let market1: IUpgradeTest;
    let market2: IUpgradeTest;

    before(async () => {
      const mockMarket = (await (await ethers.getContractFactory('UpgradeTestA')).deploy()) as IUpgradeTest;
      p = await PiSwap.create(accounts[0].address, mockMarket.address);
      const token1 = await p.deployERC721();
      const token2 = await p.deployERC721();

      await p.registry.createMarket(token1.address, '0');
      market1 = await (
        await ethers.getContractFactory('UpgradeTestA')
      ).attach(await p.registry.getMarketForNFT(token1.address, '0'));
      await p.registry.createMarket(token2.address, '0');
      market2 = await (
        await ethers.getContractFactory('UpgradeTestA')
      ).attach(await p.registry.getMarketForNFT(token2.address, '0'));
    });

    it('should be able to upgrade market implementation', async () => {
      expect(await market1.test()).to.equal('1');
      expect(await market2.test()).to.equal('1');
      const newMockMarket = (await (await ethers.getContractFactory('UpgradeTestB')).deploy()) as IUpgradeTest;
      await p.registry.upgradeTo(newMockMarket.address);
      expect(await market1.test()).to.equal('2');
      expect(await market2.test()).to.equal('2');
    });
  });
});
