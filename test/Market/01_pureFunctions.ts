import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Market } from '../../typechain-types';
import c from '../constants';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  before(async () => {
    accounts = await ethers.getSigners();
  });
  describe('Pure functions', async () => {
    let market: Market;
    before(async () => {
      const factory = await ethers.getContractFactory('Market');
      market = await factory.deploy(accounts[0].address, 0, accounts[7].address, 0);
    });

    it('max supply should be 1,000,000 tokens', async () => {
      expect(await market.MAX_SUPPLY()).to.equal(ethers.utils.parseEther('1000000'));
    });

    it('should return the correct token supply for deposited ETH', async () => {
      expect(await market.tokenFormula(0)).to.equal('0');
      expect(await market.tokenFormula(ethers.utils.parseEther('1'))).to.equal(c.after1Eth);
      expect(await market.tokenFormula(ethers.utils.parseEther('100'))).to.equal(ethers.utils.parseEther('500000'));
    });

    it('token formula safe math checks: addition overflow', async () => {
      await expect(market.tokenFormula(c.maxUint)).to.be.reverted;
    });

    it('should return the correct deposited ETH supply for a token supply', async () => {
      expect(await market.inverseTokenFormula(0)).to.equal('0');
      expect(await market.inverseTokenFormula(c.after1Eth)).to.equal(ethers.utils.parseEther('1'));
      expect(await market.inverseTokenFormula(ethers.utils.parseEther('500000'))).to.equal(
        ethers.utils.parseEther('100')
      );
    });

    it('inverse token formula safe math checks: division by zero, subtraction overflow', async () => {
      await expect(market.inverseTokenFormula(ethers.utils.parseEther('1000000'))).to.be.reverted;
      await expect(market.inverseTokenFormula(ethers.utils.parseEther('1000000').add(1))).to.be.reverted;
    });

    it('should calculate the correct token id', async () => {
      expect(await market.getTokenId(c.tokenType.BULL)).to.equal(
        ethers.BigNumber.from(ethers.utils.solidityKeccak256(['address', 'uint8'], [market.address, 0]))
      );
    });
  });
});
