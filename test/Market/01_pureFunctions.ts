import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  describe('Pure functions', async () => {
    let market: PiSwapMarket;
    before(async () => {
      const p = await PiSwap.create(ethers.constants.AddressZero);
      market = await p.deplyoMarketERC721();
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
