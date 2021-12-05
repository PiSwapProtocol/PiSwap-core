import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TokenRegistry } from '../../typechain-types';
import c from '../constants';
import { deployTokenRegistry } from '../utils';

describe('TokenRegistry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('minting', async () => {
    let registry: TokenRegistry;
    before(async () => {
      registry = await deployTokenRegistry(accounts[0].address, accounts[1].address);
    });
    it('should not be able to mint tokens from non market accounts', async () => {
      await expect(registry.mint(accounts[1].address, 1, c.tokenType.BULL)).to.be.revertedWith(
        c.errorMessages.onlyMarkets
      );
    });
  });
});
