import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PiSwapMarket } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  let p: PiSwap;
  let market: PiSwapMarket;
  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[8].address);
    market = await p.deplyoMarketERC721();
    await p.weth.deposit({ value: ethers.utils.parseEther('10') });
    await p.weth.approve(p.router.address, ethers.constants.MaxUint256);
    await p.registry.setApprovalForAll(p.router.address, true);
    await p.router.mint(
      market.address,
      {
        amount: ethers.utils.parseEther('10'),
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      },
      true
    );
  });

  describe('Token burn', async () => {
    it('amount in and out should match for both swap kinds', async () => {
      const amountOut = ethers.utils.parseEther('1.183045295037582417');
      const amountInCalculated = await market.burnInGivenOut(amountOut);
      const amountOutCalculated = await market.burnOutGivenIn(amountInCalculated);
      expect(await p.burnOutGivenIn(market, amountInCalculated)).to.equal(amountOutCalculated);
      expect(await p.burnInGivenOut(market, amountOut)).to.equal(amountInCalculated);
      expect(amountOut).to.equal(amountOutCalculated);
    });

    it('should be able to burn tokens given amount in', async () => {
      const amountIn = ethers.utils.parseEther('1000');
      const { amountOut, fee } = await p.burnOutGivenInWithFee(market, amountIn);
      const tx = p.router.burn(market.address, {
        amount: amountIn,
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx).to.emit(market, 'Burned').withArgs(p.router.address, accounts[0].address, amountIn, amountOut);
      await expect(tx).to.emit(p.router, 'Burned').withArgs(market.address, accounts[0].address, amountIn, amountOut);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, market.address, await p.registry.beneficiary(), '0', fee);
    });

    it('should be able to burn tokens given amount out', async () => {
      const amountOut = ethers.utils.parseEther('1');
      const { amountIn, fee } = await p.burnInGivenOutWithFee(market, amountOut);

      const tx = p.router.burn(market.address, {
        amount: amountOut,
        kind: c.swapKind.GIVEN_OUT,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx).to.emit(market, 'Burned').withArgs(p.router.address, accounts[0].address, amountIn, amountOut);
      await expect(tx).to.emit(p.router, 'Burned').withArgs(market.address, accounts[0].address, amountIn, amountOut);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, market.address, await p.registry.beneficiary(), '0', fee);
    });

    it('should fail when burning a larger amount than the total supply', async () => {
      const supply = await p.registry.balanceOf(accounts[0].address, p.getTokenId(market, 1));
      await expect(market.burnOutGivenIn(supply.add(1))).to.be.revertedWith('PiSwapMarket#burn: AMOUNT_EXCEEDS_SUPPLY');
      const depositedEth = await market.depositedEth();
      await expect(market.burnInGivenOut(depositedEth.add(1))).to.be.revertedWith(
        'PiSwapMarket#burn: AMOUNT_EXCEEDS_SUPPLY'
      );
    });

    it('should not be able to burn 0 tokens', async () => {
      await expect(
        market.burn({
          amount: 0,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#burn: AMOUNT_ZERO');
    });

    it('should fail if minimum amount was not reached', async () => {
      const tx1 = p.router.burn(market.address, {
        amount: ethers.utils.parseEther('1000'),
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });
      const tx2 = p.router.burn(market.address, {
        amount: ethers.utils.parseEther('1'),
        kind: c.swapKind.GIVEN_OUT,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx1).to.be.revertedWith('PiSwapMarket#burn: SLIPPAGE');
      await expect(tx2).to.be.revertedWith('PiSwapMarket#burn: SLIPPAGE');
    });

    it('should fail if deadline was reached', async () => {
      const tx = p.router.burn(market.address, {
        amount: ethers.utils.parseEther('1000'),
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: 0,
        deadline: 0,
        userData: [],
      });
      await expect(tx).to.be.revertedWith('PiSwapMarket#burn: EXPIRED');
    });
  });

  describe('Token burn without fees', () => {
    before(async () => {
      await p.registry.connect(accounts[8]).setFee(0);
    });

    it('should be able to burn tokens given amount in', async () => {
      const amountIn = ethers.utils.parseEther('1000');
      const amountOut = await p.burnOutGivenIn(market, amountIn);
      const tx = p.router.burn(market.address, {
        amount: amountIn,
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx).to.emit(market, 'Burned').withArgs(p.router.address, accounts[0].address, amountIn, amountOut);
      await expect(tx).to.emit(p.router, 'Burned').withArgs(market.address, accounts[0].address, amountIn, amountOut);
    });

    it('should be able to burn tokens given amount out', async () => {
      const amountOut = ethers.utils.parseEther('1');
      const amountIn = await p.burnInGivenOut(market, amountOut);

      const tx = p.router.burn(market.address, {
        amount: amountOut,
        kind: c.swapKind.GIVEN_OUT,
        to: accounts[0].address,
        slippage: ethers.constants.MaxUint256,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx).to.emit(market, 'Burned').withArgs(p.router.address, accounts[0].address, amountIn, amountOut);
      await expect(tx).to.emit(p.router, 'Burned').withArgs(market.address, accounts[0].address, amountIn, amountOut);
    });
  });
});
