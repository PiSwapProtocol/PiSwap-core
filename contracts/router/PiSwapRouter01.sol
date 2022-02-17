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

    function addLiquidity(
        address _market,
        Arguments.AddLiquidity calldata _args,
        bool deposit_
    )
        external
        returns (
            uint256 liquidityMinted,
            uint256 amountBull,
            uint256 amountBear
        )
    {
        IPiSwapMarket market = IPiSwapMarket(_market);
        registry.safeTransferFrom(msg.sender, address(this), TokenType.BULL.id(_market), _args.maxBull, "");
        registry.safeTransferFrom(msg.sender, address(this), TokenType.BEAR.id(_market), _args.maxBear, "");
        _deposit(_args.amountEth, deposit_);
        (liquidityMinted, amountBull, amountBear) = market.addLiquidity(_args);
        _refund(_market, _args.maxBull - amountBull, TokenType.BULL);
        _refund(_market, _args.maxBear - amountBear, TokenType.BEAR);
        emit LiquidityAdded(_market, msg.sender, liquidityMinted, _args.amountEth, amountBull, amountBear);
    }

    function removeLiquidity(address _market, Arguments.RemoveLiquidity calldata _args)
        external
        returns (
            uint256 amountEth,
            uint256 amountBull,
            uint256 amountBear
        )
    {
        IPiSwapMarket market = IPiSwapMarket(_market);
        registry.safeTransferFrom(msg.sender, address(this), TokenType.LIQUIDITY.id(_market), _args.amountLiquidity, "");
        (amountEth, amountBull, amountBear) = market.removeLiquidity(_args);
        emit LiquidityRemoved(_market, msg.sender, _args.amountLiquidity, amountEth, amountBull, amountBear);
    }

    function swap(
        address _market,
        Arguments.Swap calldata _args,
        bool deposit_
    ) external returns (uint256 amountIn, uint256 amountOut) {
        IPiSwapMarket market = IPiSwapMarket(_market);
        if (_args.kind.givenIn()) {
            amountIn = _args.amount;
        } else {
            amountIn = market.swapInGivenOut(_args.amount, _args.tokenIn, _args.tokenOut);
        }
        if (_args.tokenIn.isEth()) {
            _deposit(amountIn, deposit_);
        } else {
            registry.safeTransferFrom(msg.sender, address(this), _args.tokenIn.id(_market), amountIn, "");
        }
        (amountIn, amountOut) = market.swap(_args);
        emit Swapped(_market, msg.sender, _args.tokenIn, _args.tokenOut, amountIn, amountOut);
    }

    function _deposit(uint256 _amount, bool deposit_) private {
        if (deposit_) {
            WETH.safeTransferFrom(msg.sender, address(this), _amount);
            WETH.approve(address(registry), _amount);
            registry.deposit(_amount);
        } else {
            registry.safeTransferFrom(msg.sender, address(this), TokenType.ETH.id(), _amount, "");
        }
    }

    function _refund(
        address _market,
        uint256 _amount,
        TokenType _type
    ) private {
        if (_amount != 0) {
            registry.safeTransferFrom(address(this), msg.sender, _type.id(_market), _amount, "");
        }
    }
}
