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
  let LiquidityTokenId: BigNumber;

  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[8].address);
    market = await p.deplyoMarketERC721();
    LiquidityTokenId = p.getTokenId(market, c.tokenType.LIQUIDITY);

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

    await p.weth.connect(accounts[1]).deposit({ value: ethers.utils.parseEther('100') });
    await p.weth.connect(accounts[1]).approve(market.address, ethers.constants.MaxUint256);

    await market.connect(accounts[1]).mint({
      amount: ethers.utils.parseEther('95'),
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[1].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
  });

  describe('Adding liquidity', async () => {
    it('should fail if deadline was reached', async () => {
      await expect(
        market.addLiquidity({
          amountEth: '1',
          minLiquidity: '0',
          maxBull: ethers.constants.MaxUint256,
          maxBear: ethers.constants.MaxUint256,
          useWeth: true,
          to: accounts[0].address,
          deadline: 0,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#addLiquidity: EXPIRED');
    });

    it('should not be able to provide 0 ETH liquidity', async () => {
      await expect(
        market.addLiquidity({
          amountEth: '0',
          minLiquidity: '0',
          maxBull: '1',
          maxBear: '1',
          useWeth: true,
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#addLiquidity: INSUFFICIENT_AMOUNT');
    });

    it('should not be able to provide 0 bull tokens', async () => {
      await expect(
        market.addLiquidity({
          amountEth: '1',
          minLiquidity: '0',
          maxBull: '0',
          maxBear: '1',
          useWeth: true,
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#addLiquidity: INSUFFICIENT_AMOUNT');
    });

    it('should not be able to provide 0 bear tokens', async () => {
      await expect(
        market.addLiquidity({
          amountEth: '1',
          minLiquidity: '0',
          maxBull: '1',
          maxBear: '0',
          useWeth: true,
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#addLiquidity: INSUFFICIENT_AMOUNT');
    });

    it('should be able to provide initial liquidity', async () => {
      const tx = market.addLiquidity({
        amountEth: ethers.utils.parseEther('1.5'),
        minLiquidity: '0',
        maxBull: ethers.utils.parseEther('200'),
        maxBear: ethers.utils.parseEther('1000'),
        useWeth: true,
        to: accounts[0].address,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx)
        .to.emit(market, 'LiquidityAdded')
        .withArgs(
          accounts[0].address,
          accounts[0].address,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000')
        );
      /* It's emitting the `LiquidityAdded` event from the `PiSwapMarket` contract. */
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(
          market.address,
          ethers.constants.AddressZero,
          accounts[0].address,
          LiquidityTokenId,
          ethers.utils.parseEther('1.5')
        );
      expect(await market.getReserve(c.tokenType.ETH)).to.be.equal(ethers.utils.parseEther('1.5'));
      expect(await market.getReserve(c.tokenType.BULL)).to.be.equal(ethers.utils.parseEther('200'));
      expect(await market.getReserve(c.tokenType.BEAR)).to.be.equal(ethers.utils.parseEther('1000'));
      expect(await p.registry.balanceOf(accounts[0].address, LiquidityTokenId)).to.be.equal(
        ethers.utils.parseEther('1.5')
      );
    });

    it('should fail if min liquidity not reached', async () => {
      const tx = market.addLiquidity({
        amountEth: ethers.utils.parseEther('1.51'),
        minLiquidity: '0',
        maxBull: ethers.utils.parseEther('200'),
        maxBear: ethers.utils.parseEther('1000'),
        useWeth: true,

        to: accounts[0].address,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx).to.be.revertedWith('PiSwapMarket#addLiquidity: SLIPPAGE');
    });

    it('should fail if max bull tokens not reached', async () => {
      const tx = market.addLiquidity({
        amountEth: ethers.utils.parseEther('1.5'),
        minLiquidity: '0',
        maxBull: ethers.utils.parseEther('199'),
        maxBear: ethers.utils.parseEther('1000'),
        useWeth: true,

        to: accounts[0].address,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx).to.be.revertedWith('PiSwapMarket#addLiquidity: SLIPPAGE');
    });

    it('should fail if max bear tokens not reached', async () => {
      const tx = market.addLiquidity({
        amountEth: ethers.utils.parseEther('1.5'),
        minLiquidity: '0',
        maxBull: ethers.utils.parseEther('200'),
        maxBear: ethers.utils.parseEther('999'),
        useWeth: true,

        to: accounts[0].address,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx).to.be.revertedWith('PiSwapMarket#addLiquidity: SLIPPAGE');
    });

    it('should be able to provide additional liquidity', async () => {
      const tx = market.connect(accounts[1]).addLiquidity({
        amountEth: ethers.utils.parseEther('3'),
        minLiquidity: ethers.utils.parseEther('3'),
        maxBull: ethers.utils.parseEther('400'),
        maxBear: ethers.utils.parseEther('2000'),
        useWeth: true,
        to: accounts[1].address,
        deadline: c.unix2100,
        userData: [],
      });

      await expect(tx)
        .to.emit(market, 'LiquidityAdded')
        .withArgs(
          accounts[1].address,
          accounts[1].address,
          ethers.utils.parseEther('3'),
          ethers.utils.parseEther('3'),
          ethers.utils.parseEther('400'),
          ethers.utils.parseEther('2000')
        );
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(
          market.address,
          ethers.constants.AddressZero,
          accounts[1].address,
          LiquidityTokenId,
          ethers.utils.parseEther('3')
        );
      expect(await market.getReserve(c.tokenType.ETH)).to.be.equal(ethers.utils.parseEther('4.5'));
      expect(await market.getReserve(c.tokenType.BULL)).to.be.equal(ethers.utils.parseEther('600'));
      expect(await market.getReserve(c.tokenType.BEAR)).to.be.equal(ethers.utils.parseEther('3000'));
      expect(await p.registry.balanceOf(accounts[1].address, LiquidityTokenId)).to.be.equal(
        ethers.utils.parseEther('3')
      );
    });
  });
});
