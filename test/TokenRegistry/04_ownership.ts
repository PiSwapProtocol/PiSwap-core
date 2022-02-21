import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwap } from '../utils';

describe('Registry', () => {
  let accounts: SignerWithAddress[];
  let p: PiSwap;

  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[0].address);
  });

  describe('Ownership', async () => {
    it('only owner should be able to propose a new owner', async () => {
      await expect(p.registry.connect(accounts[1]).proposeOwner(accounts[1].address)).to.be.revertedWith(
        'Owned: ONLY_OWNER'
      );
    });

    it('owner should be able to propose a new owner', async () => {
      await expect(p.registry.proposeOwner(accounts[1].address))
        .to.emit(p.registry, 'OwnershipProposed')
        .withArgs(accounts[0].address, accounts[1].address);
    });

    it('only proposed owner should be able to claim ownership', async () => {
      expect(await p.registry.owner()).to.equal(accounts[0].address);
      await expect(p.registry.claimOwnership()).to.be.reverted;
      await expect(p.registry.connect(accounts[2]).claimOwnership()).to.be.reverted;
      await expect(p.registry.connect(accounts[1]).claimOwnership())
        .to.emit(p.registry, 'OwnershipTransferred')
        .withArgs(accounts[0].address, accounts[1].address);
      expect(await p.registry.owner()).to.equal(accounts[1].address);
    });
  });
});
