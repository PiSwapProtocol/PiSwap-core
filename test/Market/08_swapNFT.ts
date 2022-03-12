import { BigNumber } from '@ethersproject/bignumber';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC1155, ERC721, PiSwapMarket, MockERC1155Royalty, MockERC721Royalty } from '../../typechain-types';
import c from '../constants';
import { PiSwap } from '../utils';

describe('Market', async () => {
  let accounts: SignerWithAddress[];
  let p: PiSwap;

  const setup = async (market: PiSwapMarket) => {
    await p.weth.deposit({ value: ethers.utils.parseEther('200') });
    await p.weth.approve(p.registry.address, ethers.constants.MaxUint256);
    await p.weth.approve(market.address, ethers.constants.MaxUint256);
    await p.registry.connect(accounts[8]).setOracleLength(7);
    await p.registry.deposit(ethers.utils.parseEther('10'));

    await market.mint({
      amount: ethers.utils.parseEther('90'),
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });

    await market.addLiquidity({
      amountEth: ethers.utils.parseEther('4'),
      minLiquidity: 0,
      maxBull: ethers.utils.parseEther('500000'),
      maxBear: ethers.utils.parseEther('500000'),
      useWeth: true,
      to: accounts[0].address,
      deadline: c.unix2100,
      userData: [],
    });

    await market.swap({
      amount: ethers.utils.parseEther('1'),
      tokenIn: c.tokenType.ETH,
      tokenOut: c.tokenType.BULL,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
    await market.swap({
      amount: ethers.utils.parseEther('1'),
      tokenIn: c.tokenType.ETH,
      tokenOut: c.tokenType.BEAR,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
    await market.swap({
      amount: ethers.utils.parseEther('100000'),
      tokenIn: c.tokenType.BULL,
      tokenOut: c.tokenType.ETH,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
    await market.swap({
      amount: ethers.utils.parseEther('100000'),
      tokenIn: c.tokenType.BEAR,
      tokenOut: c.tokenType.ETH,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });

    await market.swap({
      amount: ethers.utils.parseEther('100000'),
      tokenIn: c.tokenType.BULL,
      tokenOut: c.tokenType.BEAR,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
    await market.swap({
      amount: ethers.utils.parseEther('100000'),
      tokenIn: c.tokenType.BEAR,
      tokenOut: c.tokenType.BULL,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });

    await market.swap({
      amount: ethers.utils.parseEther('10'),
      tokenIn: c.tokenType.ETH,
      tokenOut: c.tokenType.BULL,
      kind: c.swapKind.GIVEN_IN,
      useWeth: true,
      to: accounts[0].address,
      slippage: 0,
      deadline: c.unix2100,
      userData: [],
    });
  };

  before(async () => {
    accounts = await ethers.getSigners();
    p = await PiSwap.create(accounts[8].address);
  });
  describe('Swap NFTs', async () => {
    describe('ERC721', async () => {
      let lockedEth: BigNumber;
      let nftValue: BigNumber;
      let erc721: ERC721;
      let market: PiSwapMarket;

      before(async () => {
        market = await p.deplyoMarketERC721();
        erc721 = await p.getERC721((await market.underlyingNFT()).tokenAddress);
        await erc721.setApprovalForAll(market.address, true);
        await setup(market);
      });

      describe('Sell', async () => {
        it('should be able to swap NFTs', async () => {
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
          expect(await market.swapEnabled()).to.be.true;
        });

        it('should revert if transaction expired', async () => {
          const tx = market.sellNFT({
            amount: 1,
            slippage: 0,
            useWeth: false,
            to: accounts[0].address,
            deadline: 0,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: EXPIRED');
        });
        it('should revert if invalid amount provided', async () => {
          const tx = market.sellNFT({
            amount: 0,
            slippage: 0,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: INVALID_AMOUNT');
        });
        it('should revert if NFT value is less than slippage', async () => {
          const tx = market.sellNFT({
            amount: 1,
            slippage: nftValue.add(1),
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: SLIPPAGE');
        });
        it('should be able to sell NFT', async () => {
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.sellNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.emit(market, 'NFTSold').withArgs(accounts[0].address, accounts[0].address, nftValue, 1);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              market.address,
              accounts[0].address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue
            );
          await expect(tx).to.emit(erc721, 'Transfer').withArgs(accounts[0].address, market.address, 0);
          await expect(tx).to.not.emit(market, 'RoyaltyPaid');
          expect(await market.lockedEth()).to.equal(lockedEth.sub(nftValue));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });

        it('should revert if market has insufficient liquidity', async () => {
          const tx = market.sellNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: INSUFFICIENT_LIQUIDITY');
        });
      });
      describe('Buy', async () => {
        it('should revert if transaction expires', async () => {
          const tx = market.buyNFT({
            amount: 1,
            slippage: ethers.constants.MaxUint256,
            useWeth: false,
            to: accounts[0].address,
            deadline: 0,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#buyNFT: EXPIRED');
        });
        it('should revert if slippage is more than NFT value', async () => {
          const tx = market.buyNFT({
            amount: 1,
            slippage: nftValue.sub(1),
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#buyNFT: SLIPPAGE');
        });
        it('should revert on invalid amount', async () => {
          const tx = market.buyNFT({
            amount: 2,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#buyNFT: INVALID_AMOUNT');
        });
        it('should be able to buy NFT with market profit', async () => {
          // last trade was a buy, so this will still increase the NFT price
          await market.swap({
            amount: ethers.utils.parseEther('300000'),
            tokenIn: c.tokenType.BULL,
            tokenOut: c.tokenType.ETH,
            kind: c.swapKind.GIVEN_IN,
            useWeth: false,
            to: accounts[0].address,
            slippage: 0,
            deadline: c.unix2100,
            userData: [],
          });
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.buyNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx)
            .to.emit(market, 'NFTPurchased')
            .withArgs(accounts[0].address, accounts[0].address, nftValue, 1);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              accounts[0].address,
              market.address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue
            );
          await expect(tx).to.emit(erc721, 'Transfer').withArgs(market.address, accounts[0].address, 0);
          expect(await market.lockedEth()).to.equal(lockedEth.add(nftValue));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });
        it('should be able to buy NFT with market loss', async () => {
          await market.sellNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          // register price change
          await market.swap({
            amount: ethers.utils.parseEther('400000'),
            tokenIn: c.tokenType.BULL,
            tokenOut: c.tokenType.ETH,
            kind: c.swapKind.GIVEN_IN,
            useWeth: false,
            to: accounts[0].address,
            slippage: 0,
            deadline: c.unix2100,
            userData: [],
          });
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.buyNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx)
            .to.emit(market, 'NFTPurchased')
            .withArgs(accounts[0].address, accounts[0].address, nftValue, 1);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              accounts[0].address,
              market.address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue
            );
          await expect(tx).to.emit(erc721, 'Transfer').withArgs(market.address, accounts[0].address, 0);
          expect(await market.lockedEth()).to.equal(lockedEth.add(nftValue));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });
      });
    });

    describe('ERC1155', async () => {
      let lockedEth: BigNumber;
      let nftValue: BigNumber;
      let erc1155: ERC1155;
      let market: PiSwapMarket;

      before(async () => {
        market = await p.deplyoMarketERC1155();
        erc1155 = await p.getERC1155((await market.underlyingNFT()).tokenAddress);
        await erc1155.setApprovalForAll(market.address, true);
        await setup(market);
      });

      describe('Sell', async () => {
        it('should be able to swap NFTs', async () => {
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
          expect(await market.swapEnabled()).to.be.true;
        });

        it('should revert if transaction expired', async () => {
          const tx = market.sellNFT({
            amount: 1,
            slippage: 0,
            useWeth: false,
            to: accounts[0].address,
            deadline: 0,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: EXPIRED');
        });
        it('should revert if invalid amount provided', async () => {
          const tx = market.sellNFT({
            amount: 0,
            slippage: 0,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: INVALID_AMOUNT');
        });
        it('should revert if NFT value is less than slippage', async () => {
          const tx = market.sellNFT({
            amount: 1,
            slippage: nftValue.add(1),
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: SLIPPAGE');
        });
        it('should be able to sell NFT', async () => {
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.sellNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.emit(market, 'NFTSold').withArgs(accounts[0].address, accounts[0].address, nftValue, 1);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              market.address,
              accounts[0].address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue
            );
          await expect(tx)
            .to.emit(erc1155, 'TransferSingle')
            .withArgs(market.address, accounts[0].address, market.address, 0, 1);
          expect(await market.lockedEth()).to.equal(lockedEth.sub(nftValue));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });

        it('should revert if market has insufficient liquidity', async () => {
          const tx = market.sellNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#sellNFT: INSUFFICIENT_LIQUIDITY');
        });
      });
      describe('Buy', async () => {
        it('should revert if transaction expires', async () => {
          const tx = market.buyNFT({
            amount: 1,
            slippage: ethers.constants.MaxUint256,
            useWeth: false,
            to: accounts[0].address,
            deadline: 0,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#buyNFT: EXPIRED');
        });
        it('should revert if slippage is more than NFT value', async () => {
          const tx = market.buyNFT({
            amount: 1,
            slippage: nftValue.sub(1),
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#buyNFT: SLIPPAGE');
        });
        it('should revert on invalid amount', async () => {
          const tx = market.buyNFT({
            amount: 0,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.be.revertedWith('PiSwapMarket#onERC1155Received: AMOUNT_ZERO');
        });
        it('should be able to buy NFT with market profit', async () => {
          // last trade was a buy, so this will still increase the NFT price
          await market.swap({
            amount: ethers.utils.parseEther('300000'),
            tokenIn: c.tokenType.BULL,
            tokenOut: c.tokenType.ETH,
            kind: c.swapKind.GIVEN_IN,
            useWeth: false,
            to: accounts[0].address,
            slippage: 0,
            deadline: c.unix2100,
            userData: [],
          });
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.buyNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx)
            .to.emit(market, 'NFTPurchased')
            .withArgs(accounts[0].address, accounts[0].address, nftValue, 1);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              accounts[0].address,
              market.address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue
            );
          await expect(tx)
            .to.emit(erc1155, 'TransferSingle')
            .withArgs(market.address, market.address, accounts[0].address, 0, 1);
          await expect(tx).to.not.emit(market, 'RoyaltyPaid');
          expect(await market.lockedEth()).to.equal(lockedEth.add(nftValue));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });
        it('should be able to buy NFT with market loss', async () => {
          await market.sellNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          // register price change
          await market.swap({
            amount: ethers.utils.parseEther('400000'),
            tokenIn: c.tokenType.BULL,
            tokenOut: c.tokenType.ETH,
            kind: c.swapKind.GIVEN_IN,
            useWeth: false,
            to: accounts[0].address,
            slippage: 0,
            deadline: c.unix2100,
            userData: [],
          });
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.buyNFT({
            amount: 1,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx)
            .to.emit(market, 'NFTPurchased')
            .withArgs(accounts[0].address, accounts[0].address, nftValue, 1);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              accounts[0].address,
              market.address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue
            );
          await expect(tx)
            .to.emit(erc1155, 'TransferSingle')
            .withArgs(market.address, market.address, accounts[0].address, 0, 1);
          expect(await market.lockedEth()).to.equal(lockedEth.add(nftValue));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });
      });
      describe('Swap multiple NFTs', async () => {
        before(async () => {
          lockedEth = await market.lockedEth();
          nftValue = await market.nftValueAccumulated();
        });
        it('should be able to sell multiple NFTs', async () => {
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.sellNFT({
            amount: 2,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx).to.emit(market, 'NFTSold').withArgs(accounts[0].address, accounts[0].address, nftValue, 2);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              market.address,
              accounts[0].address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue.mul(2)
            );
          await expect(tx)
            .to.emit(erc1155, 'TransferSingle')
            .withArgs(market.address, accounts[0].address, market.address, 0, 2);
          expect(await market.lockedEth()).to.equal(lockedEth.sub(nftValue.mul(2)));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });
        it('should be able to buy multiple NFTs', async () => {
          const reserveBefore = await market.getReserve(c.tokenType.ETH);
          const tx = market.buyNFT({
            amount: 2,
            slippage: nftValue,
            useWeth: false,
            to: accounts[0].address,
            deadline: c.unix2100,
            userData: [],
          });
          await expect(tx)
            .to.emit(market, 'NFTPurchased')
            .withArgs(accounts[0].address, accounts[0].address, nftValue, 2);
          await expect(tx)
            .to.emit(p.registry, 'TransferSingle')
            .withArgs(
              market.address,
              accounts[0].address,
              market.address,
              p.getTokenId(market, c.tokenType.ETH),
              nftValue.mul(2)
            );
          await expect(tx)
            .to.emit(erc1155, 'TransferSingle')
            .withArgs(market.address, market.address, accounts[0].address, 0, 2);
          // expect(await market.lockedEth()).to.equal(lockedEth.add(nftValue.mul(2)));
          expect(await market.getReserve(c.tokenType.ETH)).to.equal(reserveBefore);
        });
      });
    });

    describe('Royalty', async () => {
      let erc721: MockERC721Royalty;
      let erc1155: MockERC1155Royalty;
      let market721: PiSwapMarket;
      let market1155: PiSwapMarket;

      before(async () => {
        erc721 = await (await ethers.getContractFactory('MockERC721Royalty')).deploy('Test Token', 'TST', '');
        erc1155 = await (await ethers.getContractFactory('MockERC1155Royalty')).deploy();
        market721 = await p.deployMarket({ address: erc721.address, tokenId: '0' });
        market1155 = await p.deployMarket({ address: erc1155.address, tokenId: '0' });
        await erc721.setApprovalForAll(market721.address, true);
        await erc1155.setApprovalForAll(market1155.address, true);
        await setup(market721);
        await setup(market1155);
      });

      it('should pay out royalty on sells', async () => {
        const nftValue = await market721.nftValueAccumulated();
        const royalty = nftValue.div(10);

        const tx = market721.sellNFT({
          amount: 1,
          slippage: nftValue.sub(royalty),
          useWeth: false,
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        });

        await expect(tx).to.emit(market721, 'NFTSold');
        await expect(tx).to.emit(market721, 'RoyaltyPaid').withArgs(erc721.address, royalty);
        await expect(tx).to.emit(p.registry, 'Withdrawal').withArgs(market721.address, erc721.address, royalty);
        await expect(tx)
          .to.emit(p.registry, 'TransferSingle')
          .withArgs(
            market721.address,
            market721.address,
            accounts[0].address,
            p.getTokenId(market721, c.tokenType.ETH),
            nftValue.sub(royalty)
          );
      });

      it('should not pay out more than 10% royalty on sells', async () => {
        const nftValue = await market1155.nftValueAccumulated();
        const royalty = nftValue.div(10);

        const tx = market1155.sellNFT({
          amount: 1,
          slippage: nftValue.sub(royalty),
          useWeth: false,
          to: accounts[0].address,
          deadline: c.unix2100,
          userData: [],
        });

        await expect(tx).to.emit(market1155, 'NFTSold');
        await expect(tx).to.emit(market1155, 'RoyaltyPaid').withArgs(erc1155.address, royalty);
        await expect(tx).to.emit(p.registry, 'Withdrawal').withArgs(market1155.address, erc1155.address, royalty);
        await expect(tx)
          .to.emit(p.registry, 'TransferSingle')
          .withArgs(
            market1155.address,
            market1155.address,
            accounts[0].address,
            p.getTokenId(market721, c.tokenType.ETH),
            nftValue.sub(royalty)
          );
      });
    });
  });

  describe('Transfer restrictions', async () => {
    let market1: PiSwapMarket;
    let market2: PiSwapMarket;
    let erc721_1: ERC721;
    let erc721_2: ERC721;
    let erc1155_1: ERC1155;
    let erc1155_2: ERC1155;

    before(async () => {
      erc721_1 = await p.deployERC721();
      erc721_2 = await p.deployERC721();
      erc1155_1 = await p.deployERC1155();
      erc1155_2 = await p.deployERC1155();
      market1 = await p.deployMarket({ address: erc721_1.address, tokenId: '0' });
      market2 = await p.deployMarket({ address: erc1155_1.address, tokenId: '0' });
    });

    it('should only accept correct NFT type', async () => {
      await expect(
        erc721_2['safeTransferFrom(address,address,uint256)'](accounts[0].address, market2.address, 0)
      ).to.be.revertedWith('PiSwapMarket#onERC721Received: INVALID_NFT_TYPE');
      await expect(erc1155_2.safeTransferFrom(accounts[0].address, market1.address, 0, 1, [])).to.be.revertedWith(
        'PiSwapMarket#onERC1155Received: INVALID_NFT_TYPE'
      );
    });
    it('should only accept NFTs from correct contract address', async () => {
      await expect(
        erc721_2['safeTransferFrom(address,address,uint256)'](accounts[0].address, market1.address, 0)
      ).to.be.revertedWith('PiSwapMarket#onERC721Received: INVALID_NFT_CONTRACT');
      await expect(erc1155_2.safeTransferFrom(accounts[0].address, market2.address, 0, 1, [])).to.be.revertedWith(
        'PiSwapMarket#onERC1155Received: INVALID_NFT_CONTRACT'
      );
    });
    it('should only accept NFTs with correct token Id', async () => {
      await expect(
        erc721_1['safeTransferFrom(address,address,uint256)'](accounts[0].address, market1.address, 1)
      ).to.be.revertedWith('PiSwapMarket#onERC721Received: INVALID_TOKEN_ID');
      await expect(erc1155_1.safeTransferFrom(accounts[0].address, market2.address, 1, 1, [])).to.be.revertedWith(
        'PiSwapMarket#onERC1155Received: INVALID_TOKEN_ID'
      );
    });
    it('should not accept batch transfers', async () => {
      await expect(
        erc1155_1.safeBatchTransferFrom(accounts[0].address, market2.address, [1], [1], [])
      ).to.be.revertedWith('PiSwapMarket#onERC1155BatchReceived: BATCH_TRANSFER_DISALLOWED');
    });
  });
});
