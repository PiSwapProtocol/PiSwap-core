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

    await p.weth.deposit({ value: ethers.utils.parseEther('10') });
    await p.weth.approve(p.router.address, ethers.constants.MaxUint256);
    await p.registry.setApprovalForAll(p.router.address, true);
    await p.router.mint(
      market.address,
      {
        amount: ethers.utils.parseEther('1.5'),
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      },
      true
    );

    await p.weth.connect(accounts[1]).deposit({ value: ethers.utils.parseEther('10') });
    await p.weth.connect(accounts[1]).approve(p.router.address, ethers.constants.MaxUint256);
    await p.registry.connect(accounts[1]).setApprovalForAll(p.router.address, true);

    await p.router.connect(accounts[1]).mint(
      market.address,
      {
        amount: ethers.utils.parseEther('1.5'),
        kind: c.swapKind.GIVEN_IN,
        to: accounts[1].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      },
      true
    );
  });

  describe('Removing liquidity', async () => {
    it('should fail if deadline was reached', async () => {
      await expect(
        p.router.removeLiquidity(market.address, {
          amountLiquidity: 0,
          minEth: 0,
          minBull: 0,
          minBear: 0,
          to: accounts[0].address,
          deadline: 0,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#removeLiquidity: EXPIRED');
    });

    it('should not be able to remove when liquidity supply is 0', async () => {
      await expect(
        market.removeLiquidity({
          amountLiquidity: 0,
          minEth: 0,
          minBull: 0,
          minBear: 0,
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.reverted;
    });

    it('should be able to remove liquidity', async () => {
      await p.router.addLiquidity(
        market.address,
        {
          amountEth: ethers.utils.parseEther('1.5'),
          minLiquidity: '0',
          maxBull: ethers.utils.parseEther('200'),
          maxBear: ethers.utils.parseEther('1000'),
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );
      await p.router.connect(accounts[1]).addLiquidity(
        market.address,
        {
          amountEth: ethers.utils.parseEther('1.5'),
          minLiquidity: '0',
          maxBull: ethers.utils.parseEther('200'),
          maxBear: ethers.utils.parseEther('1000'),
          to: accounts[1].address,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      const tx = p.router.connect(accounts[1]).removeLiquidity(market.address, {
        amountLiquidity: ethers.utils.parseEther('1.5'),
        minEth: ethers.utils.parseEther('1.5'),
        minBull: ethers.utils.parseEther('200'),
        minBear: ethers.utils.parseEther('1000'),
        to: accounts[1].address,
        deadline: c.unix2100,
        userData: [],
      });
      await expect(tx)
        .to.emit(market, 'LiquidityRemoved')
        .withArgs(
          p.router.address,
          accounts[1].address,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000')
        );
      await expect(tx)
        .to.emit(p.router, 'LiquidityRemoved')
        .withArgs(
          market.address,
          accounts[1].address,
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('1.5'),
          ethers.utils.parseEther('200'),
          ethers.utils.parseEther('1000')
        );
      expect(await market.getReserve(c.tokenType.ETH)).to.equal(ethers.utils.parseEther('1.5'));
      expect(await market.getReserve(c.tokenType.BULL)).to.equal(ethers.utils.parseEther('200'));
      expect(await market.getReserve(c.tokenType.BEAR)).to.equal(ethers.utils.parseEther('1000'));
      expect(await p.registry.balanceOf(accounts[1].address, LiquidityTokenId)).to.equal('0');
    });

    it('should fail due to insufficient balance', async () => {
      await expect(
        p.router.connect(accounts[1]).removeLiquidity(market.address, {
          amountLiquidity: ethers.utils.parseEther('1.5'),
          minEth: ethers.utils.parseEther('1.5'),
          minBull: ethers.utils.parseEther('200'),
          minBear: ethers.utils.parseEther('1000'),
          to: accounts[1].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('ERC1155: insufficient balance for transfer');
    });

    it('should fail if min eth not reached', async () => {
      await expect(
        p.router.removeLiquidity(market.address, {
          amountLiquidity: ethers.utils.parseEther('1.5'),
          minEth: ethers.utils.parseEther('1.51'),
          minBull: ethers.utils.parseEther('200'),
          minBear: ethers.utils.parseEther('1000'),
          to: accounts[1].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#removeLiquidity: SLIPPAGE');
    });

    it('should fail if min bull tokens not reached', async () => {
      await expect(
        p.router.removeLiquidity(market.address, {
          amountLiquidity: ethers.utils.parseEther('1.5'),
          minEth: ethers.utils.parseEther('1.5'),
          minBull: ethers.utils.parseEther('201'),
          minBear: ethers.utils.parseEther('1000'),
          to: accounts[1].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#removeLiquidity: SLIPPAGE');
    });

    it('should fail if min bear tokens not reached', async () => {
      await expect(
        p.router.removeLiquidity(market.address, {
          amountLiquidity: ethers.utils.parseEther('1.5'),
          minEth: ethers.utils.parseEther('1.5'),
          minBull: ethers.utils.parseEther('200'),
          minBear: ethers.utils.parseEther('1001'),
          to: accounts[1].address,
          deadline: c.unix2100,
          userData: [],
        })
      ).to.be.revertedWith('PiSwapMarket#removeLiquidity: SLIPPAGE');
    });
  });
});
