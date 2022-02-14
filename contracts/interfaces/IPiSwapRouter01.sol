// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IPiSwapMarket.sol";
import "../interfaces/IPiSwapRegistry.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "hardhat/console.sol";

interface IPiSwapRouter01 {
    event Minted(address indexed market, address indexed sender, uint256 amountIn, uint256 amountOut);
    event Burned(address indexed market, address indexed sender, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed market, address indexed sender, uint256 liquidityMinted);

    function mint(
        address market,
        Arguments.Mint calldata args,
        bool deposit
    ) external returns (uint256 amountIn, uint256 amountOut);

    function burn(address market, Arguments.Burn calldata args) external returns (uint256 amountIn, uint256 amountOut);

    function addLiquidity(
        address market,
        Arguments.AddLiquidity calldata args,
        bool deposit
    )
        external
        returns (
            uint256 liquidityMinted,
            uint256 amountBull,
            uint256 amountBear
        );
}
