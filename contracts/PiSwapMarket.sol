// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "./interfaces/IPiSwapMarket.sol";
import "./interfaces/IERC2981.sol";
import "./lib/PiSwapLibrary.sol";

import "./lib/Oracle.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

struct NFTData {
    uint256 tokenId;
    address tokenAddress;
    NFTType nftType;
}

contract PiSwapMarket is ContextUpgradeable, ERC1155HolderUpgradeable, ERC721HolderUpgradeable, ReentrancyGuardUpgradeable, IPiSwapMarket {
    using OracleLib for PriceSnapshot[];
    using TokenTypeLib for TokenType;
    using SwapKindLib for SwapKind;

    IRegistry public registry;
    NFTData public nftData;
    PriceSnapshot[] public oracle;
    int256 internal lockedEthCorrection;

    modifier ensure(uint256 _deadline, string memory _method) {
        require(block.timestamp < _deadline, _errMsg(_method, "EXPIRED"));
        _;
    }

    /// @notice on every ETH / Token swap lock half of the fee
    modifier lockLiquidity(TokenType _tokenIn, TokenType _tokenOut) {
        require(_tokenIn != TokenType.LIQUIDITY && _tokenOut != TokenType.LIQUIDITY, _errMsg("swap", "LIQUIDITY_TOKEN_SWAP"));
        require(_tokenIn != _tokenOut, _errMsg("swap", "EQUAL_TOKEN_IN_OUT"));
        // sort tokens and check if ETH is traded, invert BULL/BEAR to track added liquidity
        (TokenType ethToken, TokenType nonTradedToken) = _tokenIn < _tokenOut ? (_tokenIn, _tokenOut.invert()) : (_tokenOut, _tokenIn.invert());
        if (ethToken.isEth()) {
            (uint256 reserveBefore, ) = _getSwapReserves(ethToken, nonTradedToken);
            _;
            (uint256 reserveAfter, ) = _getSwapReserves(ethToken, nonTradedToken);
            assert(reserveAfter >= reserveBefore);
            // half of the liquidity added through the fee is minted to the protocol
            uint256 adjustedReserve = reserveBefore + (reserveAfter - reserveBefore) / 2;
            uint256 impact = (reserveAfter * 1 ether) / adjustedReserve - 1 ether;
            uint256 liquidityMinted = (registry.totalSupply(TokenType.LIQUIDITY.id()) * impact) / 1 ether;
            registry.mint(address(this), liquidityMinted, TokenType.LIQUIDITY);
        } else {
            _;
        }
    }

    function initialize(
        address _tokenAddress,
        uint256 _tokenId,
        NFTType _nftType
    ) public initializer {
        __ERC1155Holder_init();
        __ERC721Holder_init();
        __ReentrancyGuard_init();
        registry = IRegistry(_msgSender());
        nftData = NFTData(_tokenId, _tokenAddress, _nftType);
    }

    /// @notice see {IPiSwapMarket-mint}
    function mint(Arguments.Mint calldata args) external ensure(args.deadline, "mint") nonReentrant returns (uint256 amountIn, uint256 amountOut) {
        require(args.amount != 0, _errMsg("mint", "AMOUNT_ZERO"));
        uint256 fee;

        if (args.kind.givenIn()) {
            amountIn = args.amount;
            fee = (amountIn * registry.fee()) / 10000;
            amountOut = mintOutGivenIn(amountIn - fee);
            require(amountOut >= args.slippage, _errMsg("mint", "SLIPPAGE"));
        } else {
            amountOut = args.amount;
            uint256 amountInWithoutFee = mintInGivenOut(amountOut);
            amountIn = (amountInWithoutFee * 10000) / (10000 - registry.fee());
            fee = amountIn - amountInWithoutFee;
            require(amountIn <= args.slippage, _errMsg("mint", "SLIPPAGE"));
        }

        registry.safeTransferFrom(_msgSender(), address(this), TokenType.ETH.id(), amountIn, "");
        if (fee != 0) registry.safeTransferFrom(address(this), registry.beneficiary(), 0, fee, "");
        registry.mint(args.to, amountOut, TokenType.BULL);
        registry.mint(args.to, amountOut, TokenType.BEAR);
        emit Minted(_msgSender(), args.to, amountIn, amountOut);
    }

    /// @notice see {IPiSwapMarket-burn}
    function burn(Arguments.Burn calldata args) external ensure(args.deadline, "burn") nonReentrant returns (uint256 amountIn, uint256 amountOut) {
        require(args.amount != 0, _errMsg("burn", "AMOUNT_ZERO"));
        uint256 fee;

        if (args.kind.givenIn()) {
            amountIn = args.amount;
            uint256 amountOutWithoutFee = burnOutGivenIn(amountIn);
            fee = (amountOutWithoutFee * registry.fee()) / 10000;
            amountOut = amountOutWithoutFee - fee;
            require(amountOut >= args.slippage, _errMsg("burn", "SLIPPAGE"));
        } else {
            amountOut = args.amount;
            uint256 amountOutWithFee = (amountOut * 10000) / (10000 - registry.fee());
            fee = amountOutWithFee - amountOut;
            amountIn = burnInGivenOut(amountOutWithFee);
            require(amountIn <= args.slippage, _errMsg("burn", "SLIPPAGE"));
        }

        registry.burn(_msgSender(), amountIn, TokenType.BULL);
        registry.burn(_msgSender(), amountIn, TokenType.BEAR);
        if (fee != 0) registry.safeTransferFrom(address(this), registry.beneficiary(), TokenType.ETH.id(), fee, "");
        registry.safeTransferFrom(address(this), args.to, 0, amountOut, "");
        emit Burned(_msgSender(), args.to, amountIn, amountOut);
    }

    /// @notice see {IPiSwapMarket-addLiquidity}
    function addLiquidity(Arguments.AddLiquidity calldata args)
        external
        ensure(args.deadline, "addLiquidity")
        nonReentrant
        returns (
            uint256 liquidityMinted,
            uint256 amountBull,
            uint256 amountBear
        )
    {
        uint256 liquiditySupply = registry.totalSupply(TokenType.LIQUIDITY.id());
        if (liquiditySupply > 0) {
            uint256 bullReserve = getReserve(TokenType.BULL);
            uint256 ethReserve = getReserve(TokenType.ETH);
            uint256 totalTokenReserve = bullReserve + getReserve(TokenType.BEAR);
            uint256 totalTokenAmount = (totalTokenReserve * args.amountEth) / ethReserve;
            amountBull = (totalTokenAmount * bullReserve) / totalTokenReserve;
            amountBear = totalTokenAmount - amountBull;
            liquidityMinted = (args.amountEth * liquiditySupply) / ethReserve;
            require(liquidityMinted >= args.minLiquidity && args.maxBull >= amountBull && args.maxBear >= amountBear, _errMsg("addLiquidity", "SLIPPAGE"));
            registry.safeTransferFrom(_msgSender(), address(this), TokenType.ETH.id(), args.amountEth, "");
            registry.safeTransferFrom(_msgSender(), address(this), TokenType.BULL.id(), amountBull, "");
            registry.safeTransferFrom(_msgSender(), address(this), TokenType.BEAR.id(), amountBear, "");
            registry.mint(args.to, liquidityMinted, TokenType.LIQUIDITY);
            emit LiquidityAdded(_msgSender(), args.to, liquidityMinted, args.amountEth, amountBull, amountBear);
        } else {
            // initialize pool
            liquidityMinted = args.amountEth;
            amountBull = args.maxBull;
            amountBear = args.maxBear;
            require(args.amountEth != 0 && amountBull != 0 && amountBear != 0, _errMsg("addLiquidity", "INSUFFICIENT_AMOUNT"));
            registry.safeTransferFrom(_msgSender(), address(this), TokenType.ETH.id(), args.amountEth, "");
            registry.safeTransferFrom(_msgSender(), address(this), TokenType.BULL.id(), args.maxBull, "");
            registry.safeTransferFrom(_msgSender(), address(this), TokenType.BEAR.id(), args.maxBear, "");
            registry.mint(args.to, liquidityMinted, TokenType.LIQUIDITY);
            emit LiquidityAdded(_msgSender(), args.to, liquidityMinted, args.amountEth, args.maxBull, args.maxBear);
        }
    }

    /// @notice see {IPiSwapMarket-removeLiquidity}
    function removeLiquidity(Arguments.RemoveLiquidity calldata args)
        public
        ensure(args.deadline, "removeLiquidity")
        nonReentrant
        returns (
            uint256 amountEth,
            uint256 amountBull,
            uint256 amountBear
        )
    {
        uint256 liquiditySupply = registry.totalSupply(TokenType.LIQUIDITY.id());
        require(liquiditySupply > 0);

        amountEth = (getReserve(TokenType.ETH) * args.amountLiquidity) / liquiditySupply;
        amountBull = (getReserve(TokenType.BULL) * args.amountLiquidity) / liquiditySupply;
        amountBear = (getReserve(TokenType.BEAR) * args.amountLiquidity) / liquiditySupply;
        require(amountEth >= args.minEth && amountBull >= args.minBull && amountBear >= args.minBear, _errMsg("removeLiquidity", "SLIPPAGE"));

        registry.burn(_msgSender(), args.amountLiquidity, TokenType.LIQUIDITY);
        registry.safeTransferFrom(address(this), args.to, TokenType.ETH.id(), amountEth, "");
        registry.safeTransferFrom(address(this), args.to, TokenType.BULL.id(), amountBull, "");
        registry.safeTransferFrom(address(this), args.to, TokenType.BEAR.id(), amountBear, "");
        emit LiquidityRemoved(_msgSender(), args.to, args.amountLiquidity, amountEth, amountBull, amountBear);
    }

    /// @notice see {IPiSwapMarket-swap}
    function swap(Arguments.Swap calldata args)
        external
        ensure(args.deadline, "swap")
        lockLiquidity(args.tokenIn, args.tokenOut)
        nonReentrant
        returns (uint256 amountIn, uint256 amountOut)
    {
        require(args.amount != 0, _errMsg("swap", "AMOUNT_ZERO"));
        _registerPrice();
        if (args.kind.givenIn()) {
            amountIn = args.amount;
            amountOut = swapOutGivenIn(amountIn, args.tokenIn, args.tokenOut);
            require(amountOut >= args.slippage, _errMsg("swap", "SLIPPAGE"));
        } else {
            amountOut = args.amount;
            amountIn = swapInGivenOut(amountOut, args.tokenIn, args.tokenOut);
            require(amountIn <= args.slippage, _errMsg("swap", "SLIPPAGE"));
        }
        registry.safeTransferFrom(_msgSender(), address(this), args.tokenIn.id(), amountIn, "");
        registry.safeTransferFrom(address(this), args.to, args.tokenOut.id(), amountOut, "");
        emit Swapped(_msgSender(), args.to, args.tokenIn, args.tokenOut, amountIn, amountOut);
    }

    /// @notice see {PiSwapLibrary-sellNFT}
    function sellNFT(NFTSwap calldata args) external ensure(args.deadline, "sellNFT") nonReentrant returns (bool) {
        uint256 nftValueAcc = nftValueAccumulated();
        require(nftValueAcc >= args.slippage, _errMsg("sellNFT", "SLIPPAGE"));
        uint256 totalValue = nftValueAcc * args.amount;
        require(_sufficientLiquidityForSwap(nftValueAcc, args.amount), _errMsg("sellNFT", "INSUFFICIENT_LIQUIDITY"));
        address nftAddress = nftData.tokenAddress;
        if (nftData.nftType == NFTType.ERC721) {
            require(args.amount == 1, _errMsg("sellNFT", "INVALID_AMOUNT"));
            IERC721_ NFT = IERC721_(nftAddress);
            NFT.safeTransferFrom(_msgSender(), address(this), nftData.tokenId, "");
        } else {
            require(args.amount > 0, _errMsg("sellNFT", "INVALID_AMOUNT"));
            IERC1155_ NFT = IERC1155_(nftAddress);
            NFT.safeTransferFrom(_msgSender(), address(this), nftData.tokenId, args.amount, "");
        }
        address royaltyReceiver = address(0);
        uint256 royalty = 0;
        if (_checkRoyaltyInterface(nftAddress)) {
            (royaltyReceiver, royalty) = IERC2981(nftAddress).royaltyInfo(nftData.tokenId, totalValue);
            // pay out max 10% royalty
            if (royalty > totalValue / 10) {
                royalty = totalValue / 10;
            }
            registry.withdraw(royalty, royaltyReceiver);
            emit RoyaltyPaid(royaltyReceiver, royalty);
        }
        lockedEthCorrection -= int256(totalValue);
        registry.safeTransferFrom(address(this), args.to, TokenType.ETH.id(), totalValue - royalty, "");
        emit NFTSold(_msgSender(), args.to, nftValueAcc, args.amount);
        return true;
    }

    /// @notice see {PiSwapLibrary-buyNFT}
    function buyNFT(NFTSwap calldata args) external ensure(args.deadline, "buyNFT") nonReentrant returns (bool) {
        uint256 nftValueAcc = nftValueAccumulated();
        require(nftValueAcc <= args.slippage, _errMsg("buyNFT", "SLIPPAGE"));
        registry.safeTransferFrom(_msgSender(), address(this), TokenType.ETH.id(), nftValueAcc * args.amount, "");
        if (nftData.nftType == NFTType.ERC721) {
            require(args.amount == 1, _errMsg("buyNFT", "INVALID_AMOUNT"));
            IERC721_ NFT = IERC721_(nftData.tokenAddress);
            NFT.safeTransferFrom(address(this), args.to, nftData.tokenId, "");
        } else {
            require(args.amount > 0, _errMsg("buyNFT", "INVALID_AMOUNT"));
            IERC1155_ NFT = IERC1155_(nftData.tokenAddress);
            NFT.safeTransferFrom(address(this), _msgSender(), nftData.tokenId, args.amount, "");
        }
        lockedEthCorrection += int256(nftValueAcc * args.amount);
        emit NFTPurchased(_msgSender(), args.to, nftValueAcc, args.amount);
        return true;
    }

    /// @notice see {PiSwapLibrary-depositedEth}
    function depositedEth() public view returns (uint256) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        return PiSwapLibrary.depositedEth(currentSupply);
    }

    /// @notice returns reserve
    /// @dev if ETH, balance of contract is subtracted by the deposited ETH
    /// @dev if LIQUIDITY, reserve is amount of locked liquidity tokens
    function getReserve(TokenType _tokenType) public view returns (uint256 reserve) {
        reserve = registry.balanceOf(address(this), _tokenType.id());
        if (_tokenType.isEth()) {
            reserve -= depositedEth();
            reserve = uint256(int256(reserve) - lockedEthCorrection);
        }
    }

    /// @notice see {IPiSwapMarket-mintOutGivenIn}
    function mintOutGivenIn(uint256 _amountIn) public view returns (uint256 amountOut) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountOut = PiSwapLibrary.mintOutGivenIn(currentSupply, _amountIn);
    }

    /// @notice see {IPiSwapMarket-mintInGivenOut}
    function mintInGivenOut(uint256 _amountOut) public view returns (uint256 amountIn) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountIn = PiSwapLibrary.mintInGivenOut(currentSupply, _amountOut);
    }

    /// @notice see {IPiSwapMarket-burnOutGivenIn}
    function burnOutGivenIn(uint256 _amountIn) public view returns (uint256 amountOut) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountOut = PiSwapLibrary.burnOutGivenIn(currentSupply, _amountIn);
    }

    /// @notice see {IPiSwapMarket-burnInGivenOut}
    function burnInGivenOut(uint256 _amountOut) public view returns (uint256 amountIn) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountIn = PiSwapLibrary.burnInGivenOut(currentSupply, _amountOut);
    }

    /// @notice see {IPiSwapMarket-swapOutGivenIn}
    function swapOutGivenIn(
        uint256 _amountIn,
        TokenType _tokenIn,
        TokenType _tokenOut
    ) public view returns (uint256 amountOut) {
        (uint256 reserveIn, uint256 reserveOut) = _getSwapReserves(_tokenIn, _tokenOut);
        uint256 amountInWithFee = (_amountIn * reserveIn) / (_amountIn + reserveIn);
        amountOut = PiSwapLibrary.swapOutGivenIn(reserveIn, reserveOut, amountInWithFee);
    }

    /// @notice see {IPiSwapMarket-swapInGivenOut}
    function swapInGivenOut(
        uint256 _amountOut,
        TokenType _tokenIn,
        TokenType _tokenOut
    ) public view returns (uint256 amountIn) {
        (uint256 reserveIn, uint256 reserveOut) = _getSwapReserves(_tokenIn, _tokenOut);
        uint256 amountInWithoutFee = PiSwapLibrary.swapInGivenOut(reserveIn, reserveOut, _amountOut);
        require(reserveIn > amountInWithoutFee, _errMsg("swap", "MAX_IN"));
        amountIn = (amountInWithoutFee * reserveIn) / (reserveIn - amountInWithoutFee);
    }

    /// @notice see {IPiSwapMarket-averageNftValue}
    function lockedEth() public view returns (uint256) {
        uint256 lockedLiquidity = (getReserve(TokenType.LIQUIDITY) * 1 ether) / registry.totalSupply(TokenType.LIQUIDITY.id());
        assert(lockedLiquidity <= 1 ether);
        if (lockedLiquidity == 0) {
            return 0;
        }
        (uint256 ethReserve, uint256 tokenReserve) = _getSwapReserves(TokenType.ETH, TokenType.BULL);
        uint256 lockedEthReserve = (ethReserve * lockedLiquidity) / 1 ether;
        uint256 lockedTokensReserve = (tokenReserve * lockedLiquidity) / 1 ether;
        int256 lockedEthCorrected = int256(PiSwapLibrary.lockedEth(lockedEthReserve, lockedTokensReserve)) + lockedEthCorrection;
        assert(lockedEthCorrected >= 0);
        return uint256(lockedEthCorrected);
    }

    /// @notice see {IPiSwapMarket-nftValueAccumulated}
    function nftValueAccumulated() public view returns (uint256) {
        uint256 length = oracle.length;
        uint256 requiredLength = registry.oracleLength();
        require(length >= requiredLength, _errMsg("oracle", "NOT_INITIALIZED"));
        return nftValueAvg(requiredLength);
    }

    /// @notice see {IPiSwapMarket-swapEnabled}
    function swapEnabled() public view returns (bool) {
        return _sufficientLiquidityForSwap(nftValueAccumulated(), 1);
    }

    /// @notice see {IPiSwapMarket-nftValueAvg}
    function nftValueAvg(uint256 amount) public view returns (uint256) {
        return oracle.avgPrice(amount);
    }

    /// @notice see {IPiSwapMarket-nftValue}
    function nftValue() external view returns (uint256) {
        uint256 length = oracle.length;
        return length > 0 ? oracle[length - 1].price : _nftValue();
    }

    /// @notice see {IPiSwapMarket-oracleLength}
    function oracleLength() external view returns (uint256) {
        return oracle.length;
    }

    function _nftValue() internal view returns (uint256) {
        uint256 bullReserve = getReserve(TokenType.BULL);
        assert(bullReserve > 0);
        return ((getReserve(TokenType.BEAR) * 1 ether) / bullReserve)**2 / 1 ether;
    }

    /// @param _nftValueAcc accumulated nft value passed as parameter for gas savings, so it does not have to be recalculated during swap
    /// @param _amountNfts  amount of nfts to swap
    /// @return whether there is sufficient liquidity for swap
    function _sufficientLiquidityForSwap(uint256 _nftValueAcc, uint256 _amountNfts) internal view returns (bool) {
        return lockedEth() >= (_nftValueAcc * _amountNfts);
    }

    /// @dev if ETH is swapped, adjust the reserve to the BULL/BEAR ratio
    function _getSwapReserves(TokenType _tokenIn, TokenType _tokenOut) internal view returns (uint256 reserveIn, uint256 reserveOut) {
        reserveIn = getReserve(_tokenIn);
        reserveOut = getReserve(_tokenOut);
        require(reserveIn > 0 && reserveOut > 0, _errMsg("swap", "NOT_INITIALIZED"));
        if (_tokenIn.isEth()) {
            uint256 otherReserve = getReserve(_tokenOut.invert());
            reserveIn = (reserveIn * otherReserve) / (reserveOut + otherReserve);
        } else if (_tokenOut.isEth()) {
            uint256 otherReserve = getReserve(_tokenIn.invert());
            reserveOut = (reserveOut * otherReserve) / (reserveIn + otherReserve);
        }
    }

    /// @notice register the current NFT price
    /// @dev called before any trade is executed in a block, this way
    function _registerPrice() internal {
        uint256 length = oracle.length;
        if (length == 0 || oracle[length - 1].timestamp < block.timestamp) {
            uint256 price = _nftValue();
            oracle.registerPrice(price);
            emit PriceRegistered(price, block.timestamp);
        }
    }

    function _errMsg(string memory _method, string memory _message) private pure returns (string memory) {
        return string(abi.encodePacked("PiSwapMarket#", _method, ": ", _message));
    }

    /// @dev check whether an NFT contract implements the ERC-2981 interface
    /// @return false if ERC165 returns false or contract does not implement the ERC165 standard
    function _checkRoyaltyInterface(address _contract) private view returns (bool) {
        try IERC165(_contract).supportsInterface(0x2a55205a) returns (bool support) {
            return support;
        } catch (
            bytes memory /*lowLevelData*/
        ) {
            // should not be reached because ERC721 and ERC1155 standards are required to implement the ERC165 standard
            return false;
        }
    }

    uint256[50] private __gap;
}
