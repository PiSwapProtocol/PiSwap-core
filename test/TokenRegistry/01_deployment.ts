import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TokenRegistry } from '../../typechain-types';
import { deployTokenRegistry } from '../utils';

describe('TokenRegistry', () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Test deployment', () => {
    let registry: TokenRegistry;
    before(async () => {
      registry = await deployTokenRegistry(accounts[0].address, accounts[1].address);
    });
    it('should set up the owner address correctly', async () => {
      expect(await registry.owner()).to.equal(accounts[0].address);
    });
    it('should set up the factory address correctly', async () => {
      expect(await registry.factory()).to.equal(accounts[1].address);
    });
  });
});
