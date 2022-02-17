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
    event LiquidityAdded(address indexed sender, address indexed to, uint256 liquidityMinted, uint256 amountEth, uint256 amountBull, uint256 amountBear);
    event LiquidityRemoved(address indexed sender, address indexed to, uint256 liquidityBurned, uint256 amountEth, uint256 amountBull, uint256 amountBear);
    event Swapped(address indexed sender, address indexed to, TokenType tokenIn, TokenType tokenOut, uint256 amountIn, uint256 amountOut);

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

    /// @notice add liquidity to liquidity pool
    /// @param args see {Arguments-AddLiquidity}
    /// @return liquidityMinted amount of liquidity tokens minted
    /// @return amountBull amount of Bull tokens added to the pool
    /// @return amountBear amount of Bear tokens added to the pool
    function addLiquidity(Arguments.AddLiquidity calldata args)
        external
        returns (
            uint256 liquidityMinted,
            uint256 amountBull,
            uint256 amountBear
        );

    /// @notice remove liquidity from liquidity pool
    /// @param args see {Arguments-AddLiquidity}
    /// @return amountEth  amount of eth out
    /// @return amountBull amount of bull tokens out
    /// @return amountBear amount of bear tokens out
    function removeLiquidity(Arguments.RemoveLiquidity calldata args)
        external
        returns (
            uint256 amountEth,
            uint256 amountBull,
            uint256 amountBear
        );

    /// @notice swap tokens
    /// @param args see {Arguments-Swap}
    /// @return amountIn amount of tokens in
    /// @return amountOut amount of tokens out
    function swap(Arguments.Swap calldata args) external returns (uint256 amountIn, uint256 amountOut);

    /// @notice see {PiSwapLibrary-mintOutGivenIn}
    function mintOutGivenIn(uint256 _amountIn) external view returns (uint256 amountOut);

    /// @notice see {PiSwapLibrary-mintInGivenOut}
    function mintInGivenOut(uint256 _amountOut) external view returns (uint256 amountIn);

    /// @notice see {PiSwapLibrary-burnOutGivenIn}
    function burnOutGivenIn(uint256 _amountIn) external view returns (uint256 amountOut);

    /// @notice see {PiSwapLibrary-burnInGivenOut}
    function burnInGivenOut(uint256 _amountOut) external view returns (uint256 amountIn);

    /// @notice calculate amount out with fee for an amount in
    /// @notice see {PiSwapLibrary-swapOutGivenIn}
    function swapOutGivenIn(
        uint256 _amountIn,
        TokenType _tokenIn,
        TokenType _tokenOut
    ) external view returns (uint256 amountOut);

    /// @notice calculate amount in with fee for an amount out
    /// @notice see {PiSwapLibrary-swapInGivenOut}
    function swapInGivenOut(
        uint256 _amountOut,
        TokenType _tokenIn,
        TokenType _tokenOut
    ) external view returns (uint256 amountIn);

    //////////////////////////////////////////

    function buyNFT(uint256 _deadline, uint256 _amount) external payable;

    function sellNFT(
        uint256 _minEth,
        uint256 _deadline,
        uint256 _amount
    ) external;

    function NFTValue() external view returns (uint256);

    function NFTSwapEnabled() external view returns (bool);
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
