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

  describe('Administration', async () => {
    it('only owner should be able to administer contract', async () => {
      await expect(p.registry.connect(accounts[1]).setBeneficiary(accounts[1].address)).to.be.revertedWith(
        'Owned: ONLY_OWNER'
      );
      await expect(p.registry.connect(accounts[1]).setFee(0)).to.be.revertedWith('Owned: ONLY_OWNER');
      await expect(p.registry.connect(accounts[1]).setOracleLength(1)).to.be.revertedWith('Owned: ONLY_OWNER');
      await expect(p.registry.connect(accounts[1]).setURI('test')).to.be.revertedWith('Owned: ONLY_OWNER');
    });

    describe('Beneficiary', async () => {
      it('should be able to update beneficiary', async () => {
        await expect(p.registry.setBeneficiary(accounts[1].address))
          .to.emit(p.registry, 'BeneficiaryUpdated')
          .withArgs(accounts[0].address, accounts[1].address);
      });
    });
    describe('Fee', async () => {
      it('fee should not exceed 2%', async () => {
        await expect(p.registry.setFee(201)).to.be.reverted;
      });
      it('should be able to update fee', async () => {
        await expect(p.registry.setFee(200)).to.emit(p.registry, 'FeeUpdated').withArgs(50, 200);
      });
    });
    describe('Oracle length', async () => {
      it('oracle length should not be less than 5', async () => {
        await expect(p.registry.setOracleLength(4)).to.be.reverted;
      });
      it('should be able to update oracle length', async () => {
        await expect(p.registry.setOracleLength(5)).to.emit(p.registry, 'OracleLengthUpdated').withArgs(60, 5);
      });
    });
    describe('Set URI', async () => {
      it('should be able to update URI', async () => {
        await p.registry.setURI('test');
      });
    });
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
