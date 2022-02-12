import { ContractTransaction } from '@ethersproject/contracts';
import { BigNumber, Contract } from 'ethers';
import { ethers, upgrades } from 'hardhat';
import {
  ERC1155,
  ERC165,
  ERC721,
  IWETH,
  PiSwapMarket,
  PiSwapMarket__factory,
  PiSwapRegistry,
  ProxyTest,
} from '../typechain-types';
import { PiSwapRouter01 } from '../typechain-types/PiSwapRouter01';
import { WETH9 } from '../typechain-types/WETH9';

export class PiSwap {
  private chainId!: number;
  public owner!: string;
  public beneficiary!: string;
  public implementation!: string;
  public weth!: WETH9;
  public registry!: PiSwapRegistry;
  public router!: PiSwapRouter01;

  public static async create(owner?: string, implementation?: string): Promise<PiSwap> {
    const p = new PiSwap();
    await p.init(owner, implementation);
    return p;
  }

  private constructor() {}

  private async init(owner?: string, implementation?: string): Promise<void> {
    this.weth = (await (await ethers.getContractFactory('WETH9')).deploy()) as WETH9;
    this.chainId = await (await ethers.provider.getNetwork()).chainId;
    if (!owner) {
      this.owner = (await deployProxy()).address;
      this.beneficiary = this.owner;
    } else {
      this.owner = owner;
      this.beneficiary = owner;
    }
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
    return BigNumber.from(
      ethers.utils.solidityKeccak256(['uint256', 'address', 'uint8'], [this.chainId, market.address, id])
    );
  }

  public async depositedEth(market: PiSwapMarket): Promise<BigNumber> {
    const maxSupply = ethers.utils.parseEther('1000000');
    const totalSupply = await this.registry.totalSupply(this.getTokenId(market, 1));
    return maxSupply
      .mul(ethers.utils.parseEther('100'))
      .div(maxSupply.sub(totalSupply))
      .sub(ethers.utils.parseEther('100'));
  }

  public async totalSupply(depositedEth: BigNumber): Promise<BigNumber> {
    const maxSupply = ethers.utils.parseEther('1000000');
    return maxSupply.sub(
      maxSupply.mul(ethers.utils.parseEther('100')).div(depositedEth.add(ethers.utils.parseEther('100')))
    );
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
    const maxSupply = ethers.utils.parseEther('1000000');
    const currentEth = await this.depositedEth(market);
    const totalSupply = await this.registry.totalSupply(this.getTokenId(market, 1));
    return currentEth
      .mul(amountOut)
      .add(ethers.utils.parseEther('100').mul(amountOut))
      .add(currentEth.mul(totalSupply))
      .add(totalSupply.mul(ethers.utils.parseEther('100')))
      .sub(maxSupply.mul(currentEth))
      .div(maxSupply.sub(totalSupply).sub(amountOut));
  }
}

export const deployProxy = async (marketAddress?: string): Promise<ProxyTest> => {
  return (await ethers.getContractFactory('ProxyTest')).deploy(marketAddress ?? ethers.constants.AddressZero);
};

export const deployERC165 = async (): Promise<ERC165> => {
  return (await ethers.getContractFactory('SampleERC165')).deploy();
};
