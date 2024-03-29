import { ContractTransaction } from '@ethersproject/contracts';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import {
  BeaconProxyOptimized__factory,
  BeaconUpgradeable__factory,
  ERC1155,
  ERC165,
  ERC721,
  PiSwapMarket,
  PiSwapMarket__factory,
  PiSwapRegistry,
  WETH9,
} from '../typechain-types';

const ONE = ethers.utils.parseEther('1');

export class PiSwap {
  private maxSupply = ethers.utils.parseEther('1000000000');
  private stretchFactor = ethers.utils.parseEther('10000');
  private chainId!: number;
  public owner!: string;
  public beneficiary!: string;
  public implementation!: string;
  public weth!: WETH9;
  public registry!: PiSwapRegistry;

  public static async create(owner: string, implementation?: string): Promise<PiSwap> {
    const p = new PiSwap();
    await p.init(owner, implementation);
    return p;
  }

  private constructor() {}

  private async init(owner: string, implementation?: string): Promise<void> {
    this.weth = (await (await ethers.getContractFactory('WETH9')).deploy()) as WETH9;
    this.chainId = await (await ethers.provider.getNetwork()).chainId;
    this.owner = owner;
    this.beneficiary = owner;
    if (!implementation) {
      this.implementation = (await (await ethers.getContractFactory('PiSwapMarket')).deploy()).address;
    } else {
      this.implementation = implementation;
    }

    const factory = await ethers.getContractFactory('PiSwapRegistry');
    this.registry = (await upgrades.deployProxy(factory, [
      this.owner,
      this.beneficiary,
      this.implementation,
      this.weth.address,
      '',
    ])) as PiSwapRegistry;
  }

  public async deplyoMarketERC721(nft?: { address: string; tokenId: string }): Promise<PiSwapMarket> {
    if (nft === undefined) {
      nft = {
        address: await (await (await ethers.getContractFactory('MockERC721')).deploy('Test Token', 'TST', '')).address,
        tokenId: '0',
      };
    }
    return this.deployMarket(nft);
  }

  public async deplyoMarketERC1155(nft?: { address: string; tokenId: string }): Promise<PiSwapMarket> {
    if (nft === undefined) {
      nft = {
        address: await (await (await ethers.getContractFactory('MockERC1155')).deploy()).address,
        tokenId: '0',
      };
    }
    return this.deployMarket(nft);
  }

  public async getMarketAddress(address: string, tokenId: BigNumberish): Promise<string> {
    const salt = ethers.utils.solidityKeccak256(['address', 'uint256', 'uint256'], [address, tokenId, this.chainId]);
    const marketAddress = await ethers.utils.getCreate2Address(
      this.registry.address,
      salt,
      ethers.utils.keccak256(BeaconProxyOptimized__factory.bytecode)
    );
    return marketAddress;
  }

  public async deployMarket(nft: { address: string; tokenId: string }): Promise<PiSwapMarket> {
    await this.registry.createMarket(nft.address, nft.tokenId);
    return this.getMarket(await this.getMarketAddress(nft.address, nft.tokenId));
  }

  public async deployERC721(): Promise<ERC721> {
    return (await ethers.getContractFactory('MockERC721')).deploy('Test Token', 'TST', '');
  }

  public async deployERC1155(): Promise<ERC1155> {
    return (await ethers.getContractFactory('MockERC1155')).deploy();
  }

  public async getERC721(address: string): Promise<ERC721> {
    return (await ethers.getContractFactory('MockERC721')).connect(ethers.provider.getSigner()).attach(address);
  }
  public async getERC1155(address: string): Promise<ERC1155> {
    return (await ethers.getContractFactory('MockERC1155')).connect(ethers.provider.getSigner()).attach(address);
  }

  public async getMarket(address: string): Promise<PiSwapMarket> {
    return PiSwapMarket__factory.connect(address, ethers.provider.getSigner());
  }

  public getTokenId(market: PiSwapMarket, id: number): BigNumber {
    if (id === 0) {
      return ethers.BigNumber.from('0');
    }
    return BigNumber.from(
      ethers.utils.solidityKeccak256(['uint256', 'address', 'uint8'], [this.chainId, market.address, id])
    );
  }

  public async depositedEth(market: PiSwapMarket, totalSupply?: BigNumber): Promise<BigNumber> {
    totalSupply = totalSupply ?? (await this.registry.totalSupply(this.getTokenId(market, 1)));
    const numerator = this.maxSupply.mul(this.stretchFactor).sub('1');
    const denominator = this.maxSupply.sub(totalSupply!);
    return numerator.div(denominator).add('1').sub(this.stretchFactor);
  }

  public async totalSupply(depositedEth: BigNumber): Promise<BigNumber> {
    const numerator = this.maxSupply.mul(this.stretchFactor).sub('1');
    const denominator = depositedEth.add(this.stretchFactor);
    return this.maxSupply.sub(numerator.div(denominator).add('1'));
  }

  public async getReserve(market: PiSwapMarket, tokenType: number): Promise<BigNumber> {
    let reserve = await this.registry.balanceOf(market.address, this.getTokenId(market, tokenType));
    if (tokenType === 0) {
      reserve = reserve.sub(await market.depositedEth());
    }
    return reserve;
  }

  public async getSwapReserves(
    market: PiSwapMarket,
    tokenIn: number,
    tokenOut: number
  ): Promise<{ reserveIn: BigNumber; reserveOut: BigNumber }> {
    let reserveIn = await this.getReserve(market, tokenIn);
    let reserveOut = await this.getReserve(market, tokenOut);
    if (tokenIn === 0) {
      const otherReserve = await this.getReserve(market, tokenOut === 1 ? 2 : 1);
      reserveIn = reserveIn.mul(otherReserve).div(reserveOut.add(otherReserve));
    } else if (tokenOut === 0) {
      const otherReserve = await this.getReserve(market, tokenIn === 1 ? 2 : 1);
      reserveOut = reserveOut.mul(otherReserve).div(reserveIn.add(otherReserve));
    }
    return { reserveIn, reserveOut };
  }

  public async mintOutGivenInWithFee(
    market: PiSwapMarket,
    amountIn: BigNumber
  ): Promise<{ amountOut: BigNumber; fee: BigNumber }> {
    const fee = amountIn.mul(await this.registry.fee()).div('10000');
    const amountInWithFee = amountIn.sub(fee);
    return {
      amountOut: await this.mintOutGivenIn(market, amountInWithFee),
      fee,
    };
  }

  public async mintOutGivenIn(market: PiSwapMarket, amountIn: BigNumber): Promise<BigNumber> {
    const currentEth = await this.depositedEth(market);
    const totalSupply = await this.registry.totalSupply(this.getTokenId(market, 1));
    const supplyAfterMint = await this.totalSupply(currentEth.add(amountIn));
    return supplyAfterMint.sub(totalSupply);
  }

  public async mintInGivenOutWithFee(
    market: PiSwapMarket,
    amountOut: BigNumber
  ): Promise<{ amountIn: BigNumber; fee: BigNumber }> {
    const amountInWithoutFee = await this.mintInGivenOut(market, amountOut);
    const amountIn = amountInWithoutFee.mul('10000').div(BigNumber.from('10000').sub(await this.registry.fee()));
    const fee = amountIn.sub(amountInWithoutFee);
    return { amountIn, fee };
  }

  public async mintInGivenOut(market: PiSwapMarket, amountOut: BigNumber): Promise<BigNumber> {
    const currentEth = await this.depositedEth(market);
    const totalSupply = await this.registry.totalSupply(this.getTokenId(market, 1));
    const numerator = currentEth
      .mul(amountOut)
      .add(this.stretchFactor.mul(amountOut))
      .add(currentEth.mul(totalSupply))
      .add(totalSupply.mul(this.stretchFactor))
      .sub(this.maxSupply.mul(currentEth))
      .sub(1);
    const denominator = this.maxSupply.sub(totalSupply).sub(amountOut);
    return numerator.div(denominator).add('1');
  }

  public async burnOutGivenInWithFee(
    market: PiSwapMarket,
    amountIn: BigNumber
  ): Promise<{ amountOut: BigNumber; fee: BigNumber }> {
    const amountOutWithoutFee = await this.burnOutGivenIn(market, amountIn);
    const fee = amountOutWithoutFee.mul(await this.registry.fee()).div('10000');
    return {
      amountOut: amountOutWithoutFee.sub(fee),
      fee,
    };
  }

  public async burnOutGivenIn(market: PiSwapMarket, amountIn: BigNumber): Promise<BigNumber> {
    const currentEth = await this.depositedEth(market);
    const totalSupply = await this.registry.totalSupply(this.getTokenId(market, 1));
    const ethAfterBurn = await this.depositedEth(market, totalSupply.sub(amountIn));
    return currentEth.sub(ethAfterBurn);
  }

  public async burnInGivenOutWithFee(
    market: PiSwapMarket,
    amountOut: BigNumber
  ): Promise<{ amountIn: BigNumber; fee: BigNumber }> {
    const amountOutWithFee = amountOut.mul('10000').div(BigNumber.from('10000').sub(await this.registry.fee()));
    const fee = amountOutWithFee.sub(amountOut);
    return {
      amountIn: await this.burnInGivenOut(market, amountOutWithFee),
      fee,
    };
  }

  public async burnInGivenOut(market: PiSwapMarket, amountOut: BigNumber): Promise<BigNumber> {
    const totalSupply = await this.registry.totalSupply(this.getTokenId(market, 1));
    const numerator = amountOut.mul(this.maxSupply.sub(totalSupply).pow('2')).sub('1');
    const denominator = this.maxSupply
      .mul(this.stretchFactor)
      .add(amountOut.mul(totalSupply))
      .sub(this.maxSupply.mul(amountOut));
    return numerator.div(denominator).add('1');
  }

  public async swapOutGivenIn(
    market: PiSwapMarket,
    amountIn: BigNumber,
    tokenIn: number,
    tokenOut: number
  ): Promise<BigNumber> {
    const { reserveIn, reserveOut } = await this.getSwapReserves(market, tokenIn, tokenOut);
    const amountInWithFee = amountIn.mul(reserveIn).div(amountIn.add(reserveIn));
    return reserveOut.mul(amountInWithFee).div(reserveIn.add(amountInWithFee));
  }

  public async swapInGivenOut(
    market: PiSwapMarket,
    amountOut: BigNumber,
    tokenIn: number,
    tokenOut: number
  ): Promise<BigNumber> {
    const { reserveIn, reserveOut } = await this.getSwapReserves(market, tokenIn, tokenOut);
    const amountInWithoutFee = reserveIn.mul(amountOut).div(reserveOut.sub(amountOut));
    return amountInWithoutFee.mul(reserveIn).div(reserveIn.sub(amountInWithoutFee));
  }

  public async mintedLiquidity(
    market: PiSwapMarket,
    nonTradedToken: number,
    reserveBefore: BigNumber,
    liquiditySupplyBefore: BigNumber
  ): Promise<BigNumber> {
    const { reserveIn } = await this.getSwapReserves(market, 0, nonTradedToken);
    const adjustedReserve = reserveBefore.add(reserveIn.sub(reserveBefore).div(2));
    const impact = reserveIn.mul(ONE).div(adjustedReserve).sub(ONE);
    return liquiditySupplyBefore.mul(impact).div(ONE);
  }

  public async lockedEth(market: PiSwapMarket): Promise<BigNumber> {
    const lockedLiquidity = (await this.getReserve(market, 3))
      .mul(ONE)
      .div(await this.registry.totalSupply(this.getTokenId(market, 3)));
    const { reserveIn, reserveOut } = await this.getSwapReserves(market, 0, 1);
    const ethReserve = reserveIn.mul(lockedLiquidity).div(ONE);
    const tokenReserve = reserveOut.mul(lockedLiquidity).div(ONE);
    const numerator = ethReserve
      .mul(tokenReserve.pow('2'))
      .add(this.maxSupply.mul(sqrt(this.maxSupply.mul(this.stretchFactor).mul(ethReserve).mul(tokenReserve))))
      .sub(this.maxSupply.mul(ethReserve).mul(tokenReserve))
      .sub(this.maxSupply.mul(this.stretchFactor).mul(tokenReserve));
    const denominator = this.maxSupply.mul(this.stretchFactor).sub(tokenReserve.mul(ethReserve));
    return this.depositedEth(market, tokenReserve.add(numerator.div(denominator)));
  }

  public async nftValue(market: PiSwapMarket, bullReserve?: BigNumber, bearReserve?: BigNumber): Promise<BigNumber> {
    bullReserve = bullReserve ?? (await this.getReserve(market, 1));
    bearReserve = bearReserve ?? (await this.getReserve(market, 2));
    return bearReserve.mul(ONE).div(bullReserve).pow('2').div(ONE);
  }
}

export const deployERC165 = async (): Promise<ERC165> => {
  return (await ethers.getContractFactory('MockERC165')).deploy();
};

function sqrt(y: BigNumber) {
  let z = ethers.BigNumber.from('0');
  if (y.gt('3')) {
    z = y;
    let x = y.div('2').add('1');
    while (x.lt(z)) {
      z = x;
      x = y.div(x).add(x).div('2');
    }
  } else if (!y.isZero()) {
    z = ethers.BigNumber.from('1');
  }
  return z;
}
