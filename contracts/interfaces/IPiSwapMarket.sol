//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "./Arguments.sol";

interface IPiSwapMarket is Arguments {
    event Minted(address indexed sender, address indexed to, uint256 amountIn, uint256 amountOut);

    /// @notice mint bull and bear tokens
    /// @param args see {Arguments-Mint}
    /// @return amountIn amount of ETH in
    /// @return amountOut amount of Bull and Bear tokens out
    function mint(Arguments.Mint calldata args) external returns (uint256 amountIn, uint256 amountOut);

    function mintOutGivenIn(uint256 _amountIn) external view returns (uint256 amountOut);

    function mintInGivenOut(uint256 _amountOut) external view returns (uint256 amountIn);

    //////////////////////////////////////////

    function redeemTokens(
        uint256 _amount,
        uint256 _minEth,
        uint256 _deadline
    ) external;

    function addLiquidity(
        uint256 _minLiquidity,
        uint256 _maxBullTokens,
        uint256 _maxBearTokens,
        uint256 _deadline
    ) external payable returns (uint256);

    function removeLiquidity(
        uint256 _amount,
        uint256 _minEth,
        uint256 _minBull,
        uint256 _minBear,
        uint256 _deadline
    )
        external
        returns (
            uint256 amountEth,
            uint256 amountBull,
            uint256 amountBear
        );

    function swapEthToToken(
        TokenType _tokenType,
        uint256 _minTokens,
        uint256 _deadline
    ) external payable returns (uint256 tokensOut);

    function swapTokenToEth(
        TokenType _tokenType,
        uint256 _amount,
        uint256 _minEth,
        uint256 _deadline
    ) external returns (uint256 ethOut);

    function buyNFT(uint256 _deadline, uint256 _amount) external payable;

    function sellNFT(
        uint256 _minEth,
        uint256 _deadline,
        uint256 _amount
    ) external;

    function NFTValue() external view returns (uint256);

    function NFTSwapEnabled() external view returns (bool);

    function getReserves()
        external
        view
        returns (
            uint256 eth,
            uint256 bull,
            uint256 bear
        );

    function getTokenId(TokenType _tokenType) external view returns (uint256);

    function tokenPricePurchaseWithFee(uint256 _amount) external view returns (uint256);

    function tokenPricePurchase(uint256 _amount) external view returns (uint256);

    function tokenPriceRedemptionWithFee(uint256 _amount) external view returns (uint256);

    function tokenPriceRedemption(uint256 _amount) external view returns (uint256);
}

interface IERC721_ {
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata data
    ) external;
}

interface IERC1155_ {
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata data
    ) external;
}
