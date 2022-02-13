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
    using TokenTypeLib for TokenType;
    using SwapKindLib for SwapKind;
    using SafeERC20 for IWETH;

    IRegistry public immutable registry;
    IWETH public immutable WETH;

    constructor(address _registry) {
        registry = IRegistry(_registry);
        WETH = IWETH(registry.WETH());
    }

    function mint(
        address _market,
        Arguments.Mint calldata _args,
        bool deposit_
    ) external returns (uint256 amountIn, uint256 amountOut) {
        IPiSwapMarket market = IPiSwapMarket(_market);
        if (_args.kind.givenIn()) {
            amountIn = _args.amount;
        } else {
            uint256 amountInWithoutFee = market.mintInGivenOut(_args.amount);
            amountIn = (amountInWithoutFee * 10000) / (10000 - registry.fee());
        }
        _deposit(amountIn, deposit_);
        (amountIn, amountOut) = market.mint(_args);
        emit Minted(_market, msg.sender, amountIn, amountOut);
    }

    function burn(address _market, Arguments.Burn calldata _args) external returns (uint256 amountIn, uint256 amountOut) {
        IPiSwapMarket market = IPiSwapMarket(_market);
        if (_args.kind.givenIn()) {
            amountIn = _args.amount;
        } else {
            uint256 amountOutWithFee = (_args.amount * 10000) / (10000 - registry.fee());
            amountIn = market.burnInGivenOut(amountOutWithFee);
        }
        registry.safeTransferFrom(msg.sender, address(this), TokenType.BULL.id(_market), amountIn, "");
        registry.safeTransferFrom(msg.sender, address(this), TokenType.BEAR.id(_market), amountIn, "");
        (amountIn, amountOut) = market.burn(_args);
        emit Burned(_market, msg.sender, amountIn, amountOut);
    }

    function _deposit(uint256 _amount, bool deposit_) private {
        if (deposit_) {
            WETH.safeTransferFrom(msg.sender, address(this), _amount);
            WETH.approve(address(registry), _amount);
            registry.deposit(_amount);
        } else {
            registry.safeTransferFrom(msg.sender, address(this), 0, _amount, "");
        }
    }
}
