import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Registry', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });

  describe('Minting / Burning', async () => {
    let p: PiSwap;
    before(async () => {
      p = await PiSwap.create(accounts[0].address);
    });
    it('should not be able to mint tokens from non market accounts', async () => {
      await expect(p.registry.mint(accounts[1].address, 1, c.tokenType.BULL)).to.be.revertedWith(
        'PiSwapRegistry#mint/burn: ONLY_MARKET'
      );
    });
    it('should not be able to burn tokens from non market accounts', async () => {
      await expect(p.registry.burn(accounts[1].address, 1, c.tokenType.BULL)).to.be.revertedWith(
        'PiSwapRegistry#mint/burn: ONLY_MARKET'
      );
    });
  });
});
