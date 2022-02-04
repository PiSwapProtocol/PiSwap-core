import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwapRegistry } from '../../typechain-types';
import c from '../constants';
import { deployTokenRegistry } from '../utils';

describe('Registry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('burning', async () => {
    let registry: PiSwapRegistry;
    before(async () => {
      registry = await deployTokenRegistry(accounts[0].address);
    });
    it('should not be able to burn tokens from non market accounts', async () => {
      await expect(registry.burn(accounts[1].address, 1, c.tokenType.BULL)).to.be.revertedWith(
        c.errorMessages.onlyMarkets
      );
    });
  });
});
