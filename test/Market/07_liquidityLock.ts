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
  let liquidityId: BigNumber;

  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[8].address);
    market = await p.deplyoMarketERC721();
    liquidityId = p.getTokenId(market, c.tokenType.LIQUIDITY);
    await p.weth.deposit({ value: ethers.utils.parseEther('10') });
    await p.weth.approve(p.router.address, ethers.constants.MaxUint256);
    await p.registry.setApprovalForAll(p.router.address, true);

    await p.router.mint(
      market.address,
      {
        amount: ethers.utils.parseEther('1'),
        kind: c.swapKind.GIVEN_IN,
        to: accounts[0].address,
        slippage: 0,
        deadline: c.unix2100,
        userData: [],
      },
      true
    );
    await p.router.addLiquidity(
      market.address,
      {
        amountEth: ethers.utils.parseEther('4'),
        minLiquidity: 0,
        maxBull: ethers.utils.parseEther('5000'),
        maxBear: ethers.utils.parseEther('5000'),
        to: accounts[0].address,
        deadline: c.unix2100,
        userData: [],
      },
      true
    );
  });

  describe('Liquidity Lock', async () => {
    it('should lock liquidity on eth => bull swap', async () => {
      const { reserveIn } = await p.getSwapReserves(market, c.tokenType.ETH, c.tokenType.BEAR);
      const liquiditySupply = await p.registry.totalSupply(liquidityId);

      const tx = p.router.swap(
        market.address,
        {
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      const mintedLiquidity = await p.mintedLiquidity(market, c.tokenType.BEAR, reserveIn, liquiditySupply);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, ethers.constants.AddressZero, market.address, liquidityId, mintedLiquidity);
    });

    it('should lock liquidity on eth => bear swap', async () => {
      const { reserveIn } = await p.getSwapReserves(market, c.tokenType.ETH, c.tokenType.BULL);
      const liquiditySupply = await p.registry.totalSupply(liquidityId);

      const tx = p.router.swap(
        market.address,
        {
          amount: ethers.utils.parseEther('1'),
          tokenIn: c.tokenType.ETH,
          tokenOut: c.tokenType.BEAR,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      const mintedLiquidity = await p.mintedLiquidity(market, c.tokenType.BULL, reserveIn, liquiditySupply);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, ethers.constants.AddressZero, market.address, liquidityId, mintedLiquidity);
    });

    it('should lock liquidity on bull => eth swap', async () => {
      const { reserveIn } = await p.getSwapReserves(market, c.tokenType.ETH, c.tokenType.BEAR);
      const liquiditySupply = await p.registry.totalSupply(liquidityId);

      const tx = p.router.swap(
        market.address,
        {
          amount: ethers.utils.parseEther('1000'),
          tokenIn: c.tokenType.BULL,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      const mintedLiquidity = await p.mintedLiquidity(market, c.tokenType.BEAR, reserveIn, liquiditySupply);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, ethers.constants.AddressZero, market.address, liquidityId, mintedLiquidity);
    });

    it('should lock liquidity on bear => eth swap', async () => {
      const { reserveIn } = await p.getSwapReserves(market, c.tokenType.ETH, c.tokenType.BULL);
      const liquiditySupply = await p.registry.totalSupply(liquidityId);

      const tx = p.router.swap(
        market.address,
        {
          amount: ethers.utils.parseEther('1000'),
          tokenIn: c.tokenType.BEAR,
          tokenOut: c.tokenType.ETH,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      const mintedLiquidity = await p.mintedLiquidity(market, c.tokenType.BULL, reserveIn, liquiditySupply);
      await expect(tx)
        .to.emit(p.registry, 'TransferSingle')
        .withArgs(market.address, ethers.constants.AddressZero, market.address, liquidityId, mintedLiquidity);
    });

    it('should not lock liquidity on bull => bear swap', async () => {
      const liquiditySupply = await p.registry.totalSupply(liquidityId);

      await p.router.swap(
        market.address,
        {
          amount: ethers.utils.parseEther('1000'),
          tokenIn: c.tokenType.BULL,
          tokenOut: c.tokenType.BEAR,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      expect(await p.registry.totalSupply(liquidityId)).to.equal(liquiditySupply);
    });

    it('should not lock liquidity on bear => bull swap', async () => {
      const liquiditySupply = await p.registry.totalSupply(liquidityId);

      await p.router.swap(
        market.address,
        {
          amount: ethers.utils.parseEther('1000'),
          tokenIn: c.tokenType.BEAR,
          tokenOut: c.tokenType.BULL,
          kind: c.swapKind.GIVEN_IN,
          to: accounts[0].address,
          slippage: 0,
          deadline: c.unix2100,
          userData: [],
        },
        true
      );

      expect(await p.registry.totalSupply(liquidityId)).to.equal(liquiditySupply);
    });
  });
});
