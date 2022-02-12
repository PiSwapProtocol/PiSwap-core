// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IPiSwapRouter01.sol";
import "../interfaces/IPiSwapMarket.sol";
import "../interfaces/IPiSwapRegistry.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "hardhat/console.sol";

contract PiSwapRouter01 is ERC1155Holder, IPiSwapRouter01 {
    using SwapKindLib for SwapKind;
    using SafeERC20 for IWETH;

    IPiSwapRegistry public immutable registry;
    IWETH public immutable WETH;

    constructor(address _registry) {
        registry = IPiSwapRegistry(_registry);
        WETH = IWETH(registry.WETH());
    }

    function mint(address _market, Arguments.Mint calldata _args) external returns (uint256 amountIn, uint256 amountOut) {
        IPiSwapMarket market = IPiSwapMarket(_market);
        if (_args.kind.givenIn()) {
            amountIn = _args.amount;
        } else {
            uint256 amountInWithoutFee = market.mintInGivenOut(_args.amount);
            amountIn = (amountInWithoutFee * 10000) / (10000 - registry.fee());
        }
        _deposit(amountIn);
        (amountIn, amountOut) = market.mint(_args);
        emit Minted(_market, msg.sender, amountIn, amountOut);
    }

    function _deposit(uint256 _amount) private {
        WETH.safeTransferFrom(msg.sender, address(this), _amount);
        WETH.approve(address(registry), _amount);
        registry.deposit(_amount);
    }
}
