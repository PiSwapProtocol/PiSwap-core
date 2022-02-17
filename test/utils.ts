import { ContractTransaction } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import { ERC1155, ERC165, ERC721, PiSwapMarket, PiSwapMarket__factory, PiSwapRegistry } from '../typechain-types';
import { PiSwapRouter01 } from '../typechain-types/PiSwapRouter01';
import { WETH9 } from '../typechain-types/WETH9';

export class PiSwap {
  private maxSupply = ethers.utils.parseEther('1000000');
  private chainId!: number;
  public owner!: string;
  public beneficiary!: string;
  public implementation!: string;
  public weth!: WETH9;
  public registry!: PiSwapRegistry;
  public router!: PiSwapRouter01;

  public static async create(owner: string, implementation?: string): Promise<PiSwap> {
    const p = new PiSwap();
    await p.init(owner, implementation);
    return p;
  }

  private constructor() {}

  private async init(owner: string, implementation?: string): Promise<void> {
    this.weth = (await (await ethers.getContractFactory('WETH9')).deploy()) as WETH9;
    this.chainId = await (await ethers.provider.getNetwork()).chainId;
    // if (!owner) {
    //   this.owner = (await deployProxy()).address;
    //   this.beneficiary = this.owner;
    // } else {
    this.owner = owner;
    this.beneficiary = owner;
    // }
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

    this.router = (await (
      await ethers.getContractFactory('PiSwapRouter01')
    ).deploy(this.registry.address)) as PiSwapRouter01;
  }

  public async deplyoMarketERC721(nft?: { address: string; tokenId: string }): Promise<PiSwapMarket> {
    if (nft === undefined) {
      nft = {
        address: await (
          await (await ethers.getContractFactory('SampleERC721')).deploy('Test Token', 'TST', '')
        ).address,
        tokenId: '0',
      };
    }
    return this.deployMarket(nft);
  }

  public async deplyoMarketERC1155(nft?: { address: string; tokenId: string }): Promise<PiSwapMarket> {
    if (nft === undefined) {
      nft = {
        address: await (await (await ethers.getContractFactory('SampleERC1155')).deploy()).address,
        tokenId: '0',
      };
    }
    return this.deployMarket(nft);
  }

  public async deployMarket(nft: { address: string; tokenId: string }): Promise<PiSwapMarket> {
    const marketAddress = await this.getMarketAddressFromEvent(this.registry.createMarket(nft.address, nft.tokenId));
    return this.getMarket(marketAddress);
  }

  public async deployERC721(): Promise<ERC721> {
    return (await ethers.getContractFactory('SampleERC721')).deploy('Test Token', 'TST', '');
  }

  public async deployERC1155(): Promise<ERC1155> {
    return (await ethers.getContractFactory('SampleERC1155')).deploy();
  }

  public async getMarket(address: string): Promise<PiSwapMarket> {
    return PiSwapMarket__factory.connect(address, ethers.provider.getSigner());
  }

  public async getMarketAddressFromEvent(tx: Promise<ContractTransaction>): Promise<string> {
    const receipt = await (await tx).wait();
    return receipt.events![0].args!.market;
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
    const numerator = this.maxSupply.mul(ethers.utils.parseEther('100')).sub('1');
    const denominator = this.maxSupply.sub(totalSupply);
    return numerator.div(denominator).add('1').sub(ethers.utils.parseEther('100'));
  }

  public async totalSupply(depositedEth: BigNumber): Promise<BigNumber> {
    const numerator = this.maxSupply.mul(ethers.utils.parseEther('100')).sub('1');
    const denominator = depositedEth.add(ethers.utils.parseEther('100'));
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
      .add(ethers.utils.parseEther('100').mul(amountOut))
      .add(currentEth.mul(totalSupply))
      .add(totalSupply.mul(ethers.utils.parseEther('100')))
      .sub(this.maxSupply.mul(currentEth));
    const denominator = this.maxSupply.sub(totalSupply).sub(amountOut);
    return numerator.div(denominator).add(1);
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
      .mul(ethers.utils.parseEther('100'))
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
}

// export const deployProxy = async (marketAddress?: string): Promise<ProxyTest> => {
//   return (await ethers.getContractFactory('ProxyTest')).deploy(marketAddress ?? ethers.constants.AddressZero);
// };

export const deployERC165 = async (): Promise<ERC165> => {
  return (await ethers.getContractFactory('SampleERC165')).deploy();
};
