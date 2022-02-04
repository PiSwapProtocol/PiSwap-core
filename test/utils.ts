import { ContractTransaction } from '@ethersproject/contracts';
import { ethers, upgrades } from 'hardhat';
import { ERC1155, ERC165, ERC721, Market, Market__factory, Proxy, TokenRegistry } from '../typechain-types';

export const setupWithERC721 = async (ownerAddress?: string): Promise<[TokenRegistry, Market, ERC721]> => {
  const token = await deployERC721();
  return setup(token, ownerAddress) as Promise<[TokenRegistry, Market, ERC721]>;
};

export const setupWithERC1155 = async (ownerAddress?: string): Promise<[TokenRegistry, Market, ERC1155]> => {
  const token = await deployERC1155();
  return setup(token, ownerAddress) as Promise<[TokenRegistry, Market, ERC1155]>;
};

export const setup = async (
  token: ERC721 | ERC1155,
  ownerAddress?: string
): Promise<[TokenRegistry, Market, ERC721 | ERC1155]> => {
  const registry = await deployTokenRegistry(ownerAddress);
  const marketAddress = await getMarketAddressFromEvent(registry.createMarket(token.address, 0));
  const market = await getMarketByAddress(marketAddress);
  return [registry, market, token];
};

export const deployTokenRegistry = async (ownerAddress?: string, implementation?: string): Promise<TokenRegistry> => {
  if (!ownerAddress) {
    ownerAddress = (await deployProxy()).address;
  }
  if (!implementation) {
    implementation = (await (await ethers.getContractFactory('Market')).deploy()).address;
  }
  const factory = await ethers.getContractFactory('TokenRegistry');
  return upgrades.deployProxy(factory, [ownerAddress, implementation, '']) as Promise<TokenRegistry>;
};

export const deployProxy = async (marketAddress?: string): Promise<Proxy> => {
  return (await ethers.getContractFactory('Proxy')).deploy(marketAddress ?? ethers.constants.AddressZero);
};

export const deployERC165 = async (): Promise<ERC165> => {
  return (await ethers.getContractFactory('SampleERC165')).deploy();
};

export const deployERC721 = async (): Promise<ERC721> => {
  return (await ethers.getContractFactory('SampleERC721')).deploy('Test Token', 'TST', '');
};

export const deployERC1155 = async (): Promise<ERC1155> => {
  return (await ethers.getContractFactory('SampleERC1155')).deploy();
};

export const getMarketByAddress = async (address: string): Promise<Market> => {
  return Market__factory.connect(address, ethers.provider.getSigner());
};

export const getMarketAddressFromEvent = async (tx: Promise<ContractTransaction>): Promise<string> => {
  const receipt = await (await tx).wait();
  return receipt.events![0].args!.market;
};
