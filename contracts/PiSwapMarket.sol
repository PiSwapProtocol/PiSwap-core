// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "./interfaces/IPiSwapMarket.sol";
import "./lib/PiSwapLibrary.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

import "hardhat/console.sol";

contract PiSwapMarket is ContextUpgradeable, ERC1155HolderUpgradeable, ERC721HolderUpgradeable, ReentrancyGuardUpgradeable, IPiSwapMarket {
    using TokenTypeLib for TokenType;
    using SwapKindLib for SwapKind;

    IRegistry public registry;
    address public NFTtokenAddress;
    uint256 public NFTtokenId;
    NFTType public nftType;
    uint256 private _ethReserve;

    uint256 public constant MAX_SUPPLY = 1000000 ether;

    event SwapTokenPurchase(address indexed sender, TokenType indexed tokenType, uint256 amountIn, uint256 amountOut);
    event SwapTokenSell(address indexed sender, TokenType indexed tokenType, uint256 amountIn, uint256 amountOut);
    event NFTPurchase(address indexed buyer, uint256 nftValue, uint256 amount);
    event NFTSell(address indexed seller, uint256 nftValue, uint256 amount);

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
        NFTtokenAddress = _tokenAddress;
        NFTtokenId = _tokenId;
        nftType = _nftType;
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

    /// @notice swaps ETH for the NFT held by the contract
    /// @dev    if contract holds NFT, it should be purchasable at all times
    /// @param _deadline time after which the transaction should not be executed anymore
    /// @param _amount   amount of NFT Tokens to swap (ERC1155 only)
    function buyNFT(uint256 _deadline, uint256 _amount) public payable nonReentrant {
        uint256 nftValue = NFTValue();
        if (nftType == NFTType.ERC721) {
            require(msg.value >= nftValue, "Slippage");
            IERC721_ NFT = IERC721_(NFTtokenAddress);
            NFT.safeTransferFrom(address(this), _msgSender(), NFTtokenId, "");
            _safeTransfer(_msgSender(), msg.value - nftValue);
            emit NFTPurchase(_msgSender(), nftValue, 1);
        } else {
            require(_amount > 0, "Insufficient amount");
            require(msg.value >= nftValue * _amount, "Slippage");
            IERC1155_ NFT = IERC1155_(NFTtokenAddress);
            NFT.safeTransferFrom(address(this), _msgSender(), NFTtokenId, _amount, "");
            _safeTransfer(_msgSender(), msg.value - (nftValue * _amount));
            emit NFTPurchase(_msgSender(), nftValue, _amount);
        }
    }

    /// @notice swaps an NFT for ETH
    /// @param _minEth   minimum desired amount of ETH to receive
    /// @param _deadline time after which the transaction should not be executed anymore
    /// @param _amount   amount of NFT Tokens to swap (ERC1155 only)
    function sellNFT(
        uint256 _minEth,
        uint256 _deadline,
        uint256 _amount
    ) public nonReentrant {
        uint256 bullReserve = getReserve(TokenType.BULL);
        uint256 bearReserve = getReserve(TokenType.BEAR);
        require(_ethReserve > 0 && bullReserve > 0 && bearReserve > 0, "Reserve empty");
        uint256 nftValue = _NFTValue(bullReserve, bearReserve);
        if (nftType == NFTType.ERC721) {
            require(_NFTSwapEnabled(bullReserve, bearReserve, 1), "NFT swapping not enabled");
            require(nftValue >= _minEth, "Slippage");
            IERC721_ NFT = IERC721_(NFTtokenAddress);
            NFT.safeTransferFrom(_msgSender(), address(this), NFTtokenId, "");
            _safeTransfer(_msgSender(), nftValue);
            emit NFTSell(_msgSender(), nftValue, 1);
        } else {
            require(_amount > 0, "Insufficient amount");
            require(_NFTSwapEnabled(bullReserve, bearReserve, _amount), "NFT swapping not enabled");
            uint256 ethOut = nftValue * _amount;
            require(ethOut >= _minEth, "Slippage");
            IERC1155_ NFT = IERC1155_(NFTtokenAddress);
            NFT.safeTransferFrom(_msgSender(), address(this), NFTtokenId, _amount, "");
            _safeTransfer(_msgSender(), ethOut);
            emit NFTSell(_msgSender(), nftValue, _amount);
        }
    }

    /// @notice securely transfer eth to a specified address
    /// @dev           fails if transfer unsuccessful
    /// @param _to     address to transfer to
    /// @param _amount amount to transfer
    function _safeTransfer(address _to, uint256 _amount) private {
        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Transfer failed");
    }

    /// @notice calculates the value of the NFT based on the token reserves
    /// @return value of the NFT in ETH
    function NFTValue() public view returns (uint256) {
        uint256 bullReserve = getReserve(TokenType.BULL);
        uint256 bearReserve = getReserve(TokenType.BEAR);
        return _NFTValue(bullReserve, bearReserve);
    }

    /// @notice calculates the value of the NFT based on the token reserves
    /// @dev                private functions for gas savings
    /// @param _bullReserve bull token reserve size
    /// @param _bearReserve bear token reserve size
    /// @return             value of the NFT in ETH
    function _NFTValue(uint256 _bullReserve, uint256 _bearReserve) private pure returns (uint256) {
        return (_bearReserve * 1 ether) / _bullReserve;
    }

    /// @notice calculates if swapping of NFTs is enabled based on the token reserves
    /// @dev    returns if at least 1 NFT can be swapped
    /// @return returns if swapping of NFTs is enabled
    function NFTSwapEnabled() public view returns (bool) {
        uint256 bullReserve = getReserve(TokenType.BULL);
        uint256 bearReserve = getReserve(TokenType.BEAR);
        return _NFTSwapEnabled(bullReserve, bearReserve, 1);
    }

    /// @notice calculates whether a certain amount of NFTs can be swapped
    /// @dev                for ERC1155 more than 1 token can be swapped
    /// @dev                private functions for gas savings
    /// @param _bullReserve bull token reserve size
    /// @param _bearReserve bear token reserve size
    /// @param _amount      amount of tokens to swap
    /// @return             returns if swapping of NFTs is enabled
    function _NFTSwapEnabled(
        uint256 _bullReserve,
        uint256 _bearReserve,
        uint256 _amount
    ) private view returns (bool) {
        if (_ethReserve > 0 && _bullReserve > 0 && _bearReserve > 0) {
            uint256 nftValue = (_bearReserve * 1 ether) / _bullReserve;
            uint256 priceImpact = 10 ether;
            uint256 liquidityPool = address(this).balance - getReserve(TokenType.ETH);
            uint256 minLiquidity = (nftValue * priceImpact) / 1 ether;
            if (liquidityPool >= minLiquidity) {
                // always true for ERC721
                require((liquidityPool * 1 ether) / priceImpact >= nftValue * _amount, "Insufficient liquidity");
                return true;
            }
        }
        return false;
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

    /// @dev if ETH is swapped, adjust the reserve to the BULL/BEAR ratio
    function _getSwapReserves(TokenType _tokenIn, TokenType _tokenOut) private view returns (uint256 reserveIn, uint256 reserveOut) {
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

    function _errMsg(string memory _method, string memory _message) private pure returns (string memory) {
        return string(abi.encodePacked("PiSwapMarket#", _method, ": ", _message));
    }

    uint256[50] private __gap;
}
