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
    uint256 public ethReserve;

    uint256 public depositedEth;
    uint256 public constant MAX_SUPPLY = 1000000 ether;

    event LiquidityAdded(address indexed sender, uint256 amountEth, uint256 amountBull, uint256 amountBear);
    event LiquidityRemoved(address indexed sender, uint256 amountEth, uint256 amountBull, uint256 amountBear);
    event SwapTokenPurchase(address indexed sender, TokenType indexed tokenType, uint256 amountIn, uint256 amountOut);
    event SwapTokenSell(address indexed sender, TokenType indexed tokenType, uint256 amountIn, uint256 amountOut);
    event NFTPurchase(address indexed buyer, uint256 nftValue, uint256 amount);
    event NFTSell(address indexed seller, uint256 nftValue, uint256 amount);

    modifier ensure(uint256 _deadline, string memory _method) {
        require(block.timestamp < _deadline, _errMsg(_method, "EXPIRED"));
        _;
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
    function mint(Arguments.Mint calldata args) external ensure(args.deadline, "mint") returns (uint256 amountIn, uint256 amountOut) {
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

        registry.safeTransferFrom(_msgSender(), address(this), 0, amountIn, "");
        if (fee != 0) registry.safeTransferFrom(address(this), registry.beneficiary(), 0, fee, "");
        registry.mint(args.to, amountOut, TokenType.BULL);
        registry.mint(args.to, amountOut, TokenType.BEAR);
        emit Minted(_msgSender(), args.to, amountIn, amountOut);
    }

    /// @notice see {IPiSwapMarket-burn}
    function burn(Arguments.Burn calldata args) external ensure(args.deadline, "burn") returns (uint256 amountIn, uint256 amountOut) {
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
        if (fee != 0) registry.safeTransferFrom(address(this), registry.beneficiary(), 0, fee, "");
        registry.safeTransferFrom(address(this), args.to, 0, amountOut, "");
        emit Burned(_msgSender(), args.to, amountIn, amountOut);
    }

    /// @notice add liquidity to pool, initial liquidity provider sets ratio
    /// @param _deadline      time after which the transaction should not be executed anymore
    /// @param _minLiquidity  minimum amount of liquidity tokens to be minted
    /// @param _maxBullTokens maximum amount of bull tokens to deposit
    /// @param _maxBearTokens maximum amount of bear tokens to deposit
    /// @return               liquidity minted
    function addLiquidity(
        uint256 _minLiquidity,
        uint256 _maxBullTokens,
        uint256 _maxBearTokens,
        uint256 _deadline
    ) public payable nonReentrant returns (uint256) {
        uint256 bullId = getTokenId(TokenType.BULL);
        uint256 bearId = getTokenId(TokenType.BEAR);
        uint256 liquiditySupply = registry.totalSupply(getTokenId(TokenType.LIQUIDITY));
        if (liquiditySupply > 0) {
            uint256 bullReserve = registry.balanceOf(address(this), bullId);
            uint256 bearReserve = registry.balanceOf(address(this), bearId);
            uint256 totalTokenReserve = bullReserve + bearReserve;
            uint256 totalTokenAmount = (totalTokenReserve * msg.value) / ethReserve;
            uint256 bullTokenAmount = (totalTokenAmount * bullReserve) / totalTokenReserve;
            uint256 bearTokenAmount = totalTokenAmount - bullTokenAmount;
            uint256 liquidityMinted = (msg.value * liquiditySupply) / ethReserve;
            require(liquidityMinted >= _minLiquidity && _maxBullTokens >= bullTokenAmount && _maxBearTokens >= bearTokenAmount, "Slippage");
            ethReserve += msg.value;
            registry.mint(_msgSender(), liquidityMinted, TokenType.LIQUIDITY);
            registry.safeTransferFrom(_msgSender(), address(this), bullId, bullTokenAmount, "");
            registry.safeTransferFrom(_msgSender(), address(this), bearId, bearTokenAmount, "");
            emit LiquidityAdded(_msgSender(), msg.value, bullTokenAmount, bearTokenAmount);
            return liquidityMinted;
        } else {
            // initialize pool
            require(msg.value > 0 && _maxBullTokens > 0 && _maxBearTokens > 0);
            ethReserve += msg.value;
            registry.mint(_msgSender(), msg.value, TokenType.LIQUIDITY);
            registry.safeTransferFrom(_msgSender(), address(this), bullId, _maxBullTokens, "");
            registry.safeTransferFrom(_msgSender(), address(this), bearId, _maxBearTokens, "");
            emit LiquidityAdded(_msgSender(), msg.value, _maxBullTokens, _maxBearTokens);
            return msg.value;
        }
    }

    /// @notice remove liquidity from pool
    /// @param _amount     amount of liquidity tokens to burn
    /// @param _minEth     minimum desired amount of eth to receive
    /// @param _minBull    minimum desired amount of bull tokens to receive
    /// @param _minBear    minimum desired amount of bear tokens to receive
    /// @param _deadline   time after which the transaction should not be executed anymore
    /// @return amountEth  amount of eth received
    /// @return amountBull amount of bull tokens received
    /// @return amountBear amount of bear tokens received
    function removeLiquidity(
        uint256 _amount,
        uint256 _minEth,
        uint256 _minBull,
        uint256 _minBear,
        uint256 _deadline
    )
        public
        nonReentrant
        returns (
            uint256 amountEth,
            uint256 amountBull,
            uint256 amountBear
        )
    {
        // cannot use modifier here, stack too deep
        require(block.timestamp < _deadline, "expired");
        uint256 liquiditySupply = registry.totalSupply(getTokenId(TokenType.LIQUIDITY));
        require(liquiditySupply > 0);
        (uint256 bullId, uint256 bearId, uint256 bullReserve, uint256 bearReserve) = _getTokenIdsReserves();

        amountEth = (ethReserve * _amount) / liquiditySupply;
        amountBull = (bullReserve * _amount) / liquiditySupply;
        amountBear = (bearReserve * _amount) / liquiditySupply;
        require(amountEth >= _minEth && amountBull >= _minBull && amountBear >= _minBear, "Slippage");

        registry.burn(_msgSender(), _amount, TokenType.LIQUIDITY);
        registry.safeTransferFrom(address(this), _msgSender(), bullId, amountBull, "");
        registry.safeTransferFrom(address(this), _msgSender(), bearId, amountBear, "");
        ethReserve -= amountEth;
        _safeTransfer(_msgSender(), amountEth);
        emit LiquidityRemoved(_msgSender(), amountEth, amountBull, amountBear);
    }

    /// @notice swaps ETH to token
    /// @param _tokenType specifies which token to swap
    /// @param _minTokens minimum desired amount of tokens to receive
    /// @param _deadline  time after which the transaction should not be executed anymore
    /// @return tokensOut amount of tokens received
    function swapEthToToken(
        TokenType _tokenType,
        uint256 _minTokens,
        uint256 _deadline
    ) public payable nonReentrant returns (uint256 tokensOut) {
        require(msg.value > 0);
        require(_tokenType != TokenType.LIQUIDITY, "Cannot swap liquidity token");

        (uint256 bullId, uint256 bearId, uint256 bullReserve, uint256 bearReserve) = _getTokenIdsReserves();
        require(ethReserve > 0 && bullReserve > 0 && bearReserve > 0, "Reserve empty");

        uint256 tokenEthReserve = (ethReserve * (_tokenType == TokenType.BULL ? bearReserve : bullReserve)) / (bullReserve + bearReserve);
        tokensOut = _getPrice(msg.value, tokenEthReserve, _tokenType == TokenType.BULL ? bullReserve : bearReserve);
        require(tokensOut >= _minTokens, "Slippage");

        registry.safeTransferFrom(address(this), _msgSender(), _tokenType == TokenType.BULL ? bullId : bearId, tokensOut, "");
        ethReserve += msg.value;
        emit SwapTokenPurchase(_msgSender(), _tokenType, msg.value, tokensOut);
    }

    /// @notice swaps token to ETH
    /// @param _tokenType specifies which token to swap
    /// @param _amount    amount of tokens to swap
    /// @param _minEth    minimum desired amount of ETH to receive
    /// @param _deadline  time after which the transaction should not be executed anymore
    /// @return ethOut    amount of ETH received
    function swapTokenToEth(
        TokenType _tokenType,
        uint256 _amount,
        uint256 _minEth,
        uint256 _deadline
    ) public nonReentrant returns (uint256 ethOut) {
        require(_amount > 0);
        require(_tokenType != TokenType.LIQUIDITY, "Cannot swap liquidity token");

        (uint256 bullId, uint256 bearId, uint256 bullReserve, uint256 bearReserve) = _getTokenIdsReserves();
        require(ethReserve > 0 && bullReserve > 0 && bearReserve > 0, "Reserve empty");

        uint256 tokenEthReserve = (ethReserve * (_tokenType == TokenType.BULL ? bearReserve : bullReserve)) / (bullReserve + bearReserve);
        ethOut = _getPrice(_amount, _tokenType == TokenType.BULL ? bullReserve : bearReserve, tokenEthReserve);
        require(ethOut >= _minEth, "Slippage");

        registry.safeTransferFrom(_msgSender(), address(this), _tokenType == TokenType.BULL ? bullId : bearId, _amount, "");
        ethReserve -= ethOut;
        _safeTransfer(_msgSender(), ethOut);
        emit SwapTokenSell(_msgSender(), _tokenType, _amount, ethOut);
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
        (, , uint256 bullReserve, uint256 bearReserve) = _getTokenIdsReserves();
        require(ethReserve > 0 && bullReserve > 0 && bearReserve > 0, "Reserve empty");
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
        (, , uint256 bullReserve, uint256 bearReserve) = _getTokenIdsReserves();
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
        (, , uint256 bullReserve, uint256 bearReserve) = _getTokenIdsReserves();
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
        if (ethReserve > 0 && _bullReserve > 0 && _bearReserve > 0) {
            uint256 nftValue = (_bearReserve * 1 ether) / _bullReserve;
            uint256 priceImpact = 10 ether;
            uint256 liquidityPool = address(this).balance - ethReserve;
            uint256 minLiquidity = (nftValue * priceImpact) / 1 ether;
            if (liquidityPool >= minLiquidity) {
                // always true for ERC721
                require((liquidityPool * 1 ether) / priceImpact >= nftValue * _amount, "Insufficient liquidity");
                return true;
            }
        }
        return false;
    }

    /// @notice returns token ids and reserves for bull and bear tokens
    /// @return bullId      tokenId of bull token
    /// @return bearId      tokenId of bear token
    /// @return bullReserve reserve size of bull token
    /// @return bearReserve reserve size of bear token
    function _getTokenIdsReserves()
        private
        view
        returns (
            uint256 bullId,
            uint256 bearId,
            uint256 bullReserve,
            uint256 bearReserve
        )
    {
        bullId = getTokenId(TokenType.BULL);
        bearId = getTokenId(TokenType.BEAR);
        bullReserve = registry.balanceOf(address(this), bullId);
        bearReserve = registry.balanceOf(address(this), bearId);
    }

    function getReserves()
        public
        view
        returns (
            uint256 eth,
            uint256 bull,
            uint256 bear
        )
    {
        uint256 bullId = getTokenId(TokenType.BULL);
        uint256 bearId = getTokenId(TokenType.BEAR);
        eth = ethReserve;
        bull = registry.balanceOf(address(this), bullId);
        bear = registry.balanceOf(address(this), bearId);
    }

    /// @notice calculates the output amount based on input amount and reserves
    /// @param _amount        amount of input token
    /// @param _inputReserve  reserve size of the input token
    /// @param _outputReserve reserve size of the output token
    /// @return               output amount
    function _getPrice(
        uint256 _amount,
        uint256 _inputReserve,
        uint256 _outputReserve
    ) private pure returns (uint256) {
        uint256 amountWithFee = _amount * 997;
        uint256 numerator = amountWithFee * _outputReserve;
        uint256 denominator = (_inputReserve * 1000) + amountWithFee;
        return numerator / denominator;
    }

    /// @notice gets token id
    /// @param  _tokenType token type
    /// @return            token id
    function getTokenId(TokenType _tokenType) public view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.chainid, address(this), _tokenType)));
    }

    // prettier-ignore
    /// @notice gets all token ids
    function getTokenIds() public view returns (uint256 bullId, uint256 bearId, uint256 liquidityId) {
        return (TokenType.BULL.id(), TokenType.BEAR.id(), TokenType.LIQUIDITY.id());
    }

    function depositedEth1() public view returns (uint256) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        return PiSwapLibrary.depositedEth(currentSupply);
    }

    /// @notice see {PiSwapLibrary-mintOutGivenIn}
    function mintOutGivenIn(uint256 _amountIn) public view returns (uint256 amountOut) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountOut = PiSwapLibrary.mintOutGivenIn(currentSupply, _amountIn);
    }

    /// @notice see {PiSwapLibrary-mintInGivenOut}
    function mintInGivenOut(uint256 _amountOut) public view returns (uint256 amountIn) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountIn = PiSwapLibrary.mintInGivenOut(currentSupply, _amountOut);
    }

    /// @notice see {PiSwapLibrary-burnOutGivenIn}
    function burnOutGivenIn(uint256 _amountIn) public view returns (uint256 amountOut) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountOut = PiSwapLibrary.burnOutGivenIn(currentSupply, _amountIn);
    }

    /// @notice see {PiSwapLibrary-burnInGivenOut}
    function burnInGivenOut(uint256 _amountOut) public view returns (uint256 amountIn) {
        uint256 currentSupply = registry.totalSupply(TokenType.BULL.id());
        amountIn = PiSwapLibrary.burnInGivenOut(currentSupply, _amountOut);
    }

    /// @notice calculates whether the current market profit or loss
    /// @return 18 decimal float of market profit loss: > 1 profit, < 1 loss
    function marketProfit() public view returns (uint256) {
        return _marketProfit(address(this).balance);
    }

    /// @dev private function to calculate the profit loss without msg.value for purchase of tokens
    function _marketProfit(uint256 contractBalance) private view returns (uint256) {
        if (depositedEth == 0) {
            return 1 ether;
        }
        return ((contractBalance - ethReserve) * 1 ether) / (depositedEth);
    }

    function _errMsg(string memory _method, string memory _message) private pure returns (string memory) {
        return string(abi.encodePacked("PiSwapMarket#", _method, ": ", _message));
    }

    uint256[50] private __gap;
}
