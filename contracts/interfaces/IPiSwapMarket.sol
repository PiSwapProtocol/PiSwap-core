//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "./Arguments.sol";
import "./IPiSwapRegistry.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IRegistry is IPiSwapRegistry, IERC1155 {
    function totalSupply(uint256 id) external view returns (uint256);
}

interface IPiSwapMarket is Arguments {
    event Minted(address indexed sender, address indexed to, uint256 amountIn, uint256 amountOut);
    event Burned(address indexed sender, address indexed to, uint256 amountIn, uint256 amountOut);

    /// @notice mint bull and bear tokens
    /// @param args see {Arguments-Mint}
    /// @return amountIn amount of ETH deposited
    /// @return amountOut amount of Bull and Bear tokens out
    function mint(Arguments.Mint calldata args) external returns (uint256 amountIn, uint256 amountOut);

    /// @notice burn bull and bear tokens
    /// @param args see {Arguments-Burn}
    /// @return amountIn amount of Bull and Bear tokens burned
    /// @return amountOut amount of ETH out
    function burn(Arguments.Burn calldata args) external returns (uint256 amountIn, uint256 amountOut);

    /// @notice see {PiSwapLibrary-mintOutGivenIn}
    function mintOutGivenIn(uint256 _amountIn) external view returns (uint256 amountOut);

    /// @notice see {PiSwapLibrary-mintInGivenOut}
    function mintInGivenOut(uint256 _amountOut) external view returns (uint256 amountIn);

    /// @notice see {PiSwapLibrary-burnOutGivenIn}
    function burnOutGivenIn(uint256 _amountIn) external view returns (uint256 amountOut);

    /// @notice see {PiSwapLibrary-burnInGivenOut}
    function burnInGivenOut(uint256 _amountOut) external view returns (uint256 amountIn);

    //////////////////////////////////////////

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
