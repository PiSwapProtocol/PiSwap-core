import { ContractTransaction } from '@ethersproject/contracts';
import { ethers, upgrades } from 'hardhat';
import {
  ERC1155,
  ERC165,
  ERC721,
  PiSwapMarket,
  PiSwapMarket__factory,
  PiSwapRegistry,
  ProxyTest,
} from '../typechain-types';

export class PiSwap {
  private weth = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  public owner!: string;
  public beneficiary!: string;
  public implementation!: string;
  public registry!: PiSwapRegistry;

  public static async create(owner?: string, implementation?: string): Promise<PiSwap> {
    const p = new PiSwap();
    await p.init(owner, implementation);
    return p;
  }

  private constructor() {}

  private async init(owner?: string, implementation?: string): Promise<void> {
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
      this.weth,
      '',
    ])) as PiSwapRegistry;
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
}

export const deployProxy = async (marketAddress?: string): Promise<ProxyTest> => {
  return (await ethers.getContractFactory('ProxyTest')).deploy(marketAddress ?? ethers.constants.AddressZero);
};

export const deployERC165 = async (): Promise<ERC165> => {
  return (await ethers.getContractFactory('SampleERC165')).deploy();
};
