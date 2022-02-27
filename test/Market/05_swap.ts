import { BigNumber } from '@ethersproject/bignumber';
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
    await p.weth.deposit({ value: ethers.utils.parseEther('100') });
    await p.weth.approve(market.address, ethers.constants.MaxUint256);

    await market.mint({
      amount: ethers.utils.parseEther('95'),
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
  });

  it('should not be able to swap when no liquidity present', async () => {
    await expect(
      market.swap({
        amount: ethers.utils.parseEther('1'),
        tokenIn: c.tokenType.ETH,
        tokenOut: c.tokenType.BULL,
        kind: c.swapKind.GIVEN_IN,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      })
    ).to.be.revertedWith('PiSwapMarket#swap: NOT_INITIALIZED');
    await expect(
      market.swap({
        amount: ethers.utils.parseEther('1'),
        tokenIn: c.tokenType.ETH,
        tokenOut: c.tokenType.BULL,
        kind: c.swapKind.GIVEN_OUT,
        useWeth: true,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      })
    ).to.be.revertedWith('PiSwapMarket#swap: NOT_INITIALIZED');
  });

  describe('Swap tokens', async () => {
    before(async () => {
      await market.addLiquidity({
        amountEth: ethers.utils.parseEther('4'),
        minLiquidity: 0,
        maxBull: ethers.utils.parseEther('5000'),
        maxBear: ethers.utils.parseEther('5000'),
        useWeth: true,
        to: accounts[0].address,
        deadline: c.unix2100,
        userData: [],
      });
    });

    it('should fail if deadline was reached', async () => {
      await expect(
        market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: 0,
          deadline: 0,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: EXPIRED');
    });

    it('amount should not be zero', async () => {
      await expect(
        market.swap({
          amount: 0,
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: AMOUNT_ZERO');
    });

    it('should not be able to swap liquidity tokens', async () => {
      await expect(
        market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.LIQUIDITY,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: LIQUIDITY_TOKEN_SWAP');
      await expect(
        market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.LIQUIDITY,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: LIQUIDITY_TOKEN_SWAP');
    });

    it('should not be able to swap equal tokens', async () => {
      await expect(
        market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: EQUAL_TOKEN_IN_OUT');
    });

    it('should fail if minimum tokens out not reached', async () => {
      await expect(
        market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: ethers.constants.MaxUint256,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: SLIPPAGE');
      await expect(
        market.swap({
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#swap: SLIPPAGE');
    });

    describe('Swap out given in', () => {
      it('should be able to swap eth for bull tokens', async () => {
        const amountIn = ethers.utils.parseEther('0.1');
        const amountOut = await p.swapOutGivenIn(market, amountIn, c.tokenType.ETH, c.tokenType.BULL);
        const tx = market.swap({
          amount: amountIn,
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountOut,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.ETH, c.tokenType.BULL, amountIn, amountOut);
      });

      it('should be able to swap eth for bear tokens', async () => {
        const amountIn = ethers.utils.parseEther('0.1');
        const amountOut = await p.swapOutGivenIn(market, amountIn, c.tokenType.ETH, c.tokenType.BEAR);
        const tx = market.swap({
          amount: amountIn,
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BEAR,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountOut,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.ETH, c.tokenType.BEAR, amountIn, amountOut);
      });

      it('should be able to swap bull tokens for eth', async () => {
        const amountIn = ethers.utils.parseEther('100');
        const amountOut = await p.swapOutGivenIn(market, amountIn, c.tokenType.BULL, c.tokenType.ETH);
        const tx = market.swap({
          amount: amountIn,
          tokenIn: c.tokenType.BULL,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountOut,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BULL, c.tokenType.ETH, amountIn, amountOut);
      });

      it('should be able to swap bear tokens for eth', async () => {
        const amountIn = ethers.utils.parseEther('100');
        const amountOut = await p.swapOutGivenIn(market, amountIn, c.tokenType.BEAR, c.tokenType.ETH);
        const tx = market.swap({
          amount: amountIn,
          tokenIn: c.tokenType.BEAR,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountOut,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BEAR, c.tokenType.ETH, amountIn, amountOut);
      });
      it('should be able to swap bull tokens for bear tokens', async () => {
        const amountIn = ethers.utils.parseEther('100');
        const amountOut = await p.swapOutGivenIn(market, amountIn, c.tokenType.BULL, c.tokenType.BEAR);
        const tx = market.swap({
          amount: amountIn,
          tokenIn: c.tokenType.BULL,
          tokenOut: c.tokenType.BEAR,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountOut,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BULL, c.tokenType.BEAR, amountIn, amountOut);
      });
      it('should be able to swap bear tokens for bull tokens', async () => {
        const amountIn = ethers.utils.parseEther('100');
        const amountOut = await p.swapOutGivenIn(market, amountIn, c.tokenType.BEAR, c.tokenType.BULL);
        const tx = market.swap({
          amount: amountIn,
          tokenIn: c.tokenType.BEAR,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountOut,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BEAR, c.tokenType.BULL, amountIn, amountOut);
      });
    });

    describe('Swap in given out', () => {
      it('should not be able to set out greater or equal to reserve', async () => {
        await expect(
          market.swap({
            amount: ethers.utils.parseEther('5000'),
            tokenIn: c.tokenType.ETH,
            tokenOut: c.tokenType.BULL,
            kind: c.swapKind.GIVEN_OUT,
            useWeth: true,
            to: accounts[0].address,
            slippage: 0,
            deadline: c.unix2100,
            userData: [],
          })
        ).to.be.revertedWith('PiSwapMarket#swap: MAX_OUT');
      });

      it('amountIn without fee should not exceed reserve in size', async () => {
        const { reserveIn, reserveOut } = await p.getSwapReserves(market, c.tokenType.ETH, c.tokenType.BULL);
        const amountOut = reserveOut.mul(reserveIn).div(reserveIn.mul(2));
        await expect(
          market.swap({
            amount: amountOut,
            tokenIn: c.tokenType.ETH,
            tokenOut: c.tokenType.BULL,
            kind: c.swapKind.GIVEN_OUT,
            useWeth: true,
            to: accounts[0].address,
            slippage: ethers.constants.MaxUint256,
            deadline: c.unix2100,
            userData: [],
          })
        ).to.be.revertedWith('PiSwapMarket#swap: MAX_IN');
      });

      it('should be able to swap eth for bull tokens', async () => {
        const amountOut = ethers.utils.parseEther('100');
        const amountIn = await p.swapInGivenOut(market, amountOut, c.tokenType.ETH, c.tokenType.BULL);
        const tx = market.swap({
          amount: amountOut,
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountIn,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.ETH, c.tokenType.BULL, amountIn, amountOut);
      });

      it('should be able to swap eth for bear tokens', async () => {
        const amountOut = ethers.utils.parseEther('100');
        const amountIn = await p.swapInGivenOut(market, amountOut, c.tokenType.ETH, c.tokenType.BEAR);
        const tx = market.swap({
          amount: amountOut,
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BEAR,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountIn,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.ETH, c.tokenType.BEAR, amountIn, amountOut);
      });

      it('should be able to swap bull tokens for eth', async () => {
        const amountOut = ethers.utils.parseEther('0.1');
        const amountIn = await p.swapInGivenOut(market, amountOut, c.tokenType.BULL, c.tokenType.ETH);
        const tx = market.swap({
          amount: amountOut,
          tokenIn: c.tokenType.BULL,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountIn,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BULL, c.tokenType.ETH, amountIn, amountOut);
      });

      it('should be able to swap bear tokens for eth', async () => {
        const amountOut = ethers.utils.parseEther('0.1');
        const amountIn = await p.swapInGivenOut(market, amountOut, c.tokenType.BEAR, c.tokenType.ETH);
        const tx = market.swap({
          amount: amountOut,
          tokenIn: c.tokenType.BEAR,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountIn,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BEAR, c.tokenType.ETH, amountIn, amountOut);
      });

      it('should be able to swap bull tokens for bear tokens', async () => {
        const amountOut = ethers.utils.parseEther('100');
        const amountIn = await p.swapInGivenOut(market, amountOut, c.tokenType.BULL, c.tokenType.BEAR);
        const tx = market.swap({
          amount: amountOut,
          tokenIn: c.tokenType.BULL,
          tokenOut: c.tokenType.BEAR,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountIn,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BULL, c.tokenType.BEAR, amountIn, amountOut);
      });

      it('should be able to swap bear tokens for bull tokens', async () => {
        const amountOut = ethers.utils.parseEther('100');
        const amountIn = await p.swapInGivenOut(market, amountOut, c.tokenType.BEAR, c.tokenType.BULL);
        const tx = market.swap({
          amount: amountOut,
          tokenIn: c.tokenType.BEAR,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_OUT,
          useWeth: true,
          to: accounts[0].address,
          slippage: amountIn,
          deadline: c.unix2100,
          userData: [],
        });
        await expect(tx)
          .to.emit(market, 'Swapped')
          .withArgs(accounts[0].address, accounts[0].address, c.tokenType.BEAR, c.tokenType.BULL, amountIn, amountOut);
      });
    });
  });
});
