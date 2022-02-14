//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "../interfaces/Types.sol";

interface Arguments {
    /// @notice arguments for minting tokens
    /// @param amount amount of tokens in/out depending on SwapKind
    /// @param swapKind see {Types-SwapKind}
    /// @param to address to receive tokens
    /// @param slippage min amount out if GIVEN_IN, max amount in if GIVEN_OUT
    /// @param deadline deadline after which the transaction is no longer valid
    /// @param userData any additional data the pool might require in the future. Empty in current implementation
    struct Mint {
        uint256 amount;
        SwapKind kind;
        address to;
        uint256 slippage;
        uint256 deadline;
        bytes userData;
    }

    /// @notice arguments for burning tokens
    /// @param amount amount of tokens in/out depending on SwapKind
    /// @param swapKind see {Types-SwapKind}
    /// @param (to, slippage, deadline, userData) see {Mint}
    struct Burn {
        uint256 amount;
        SwapKind kind;
        address to;
        uint256 slippage;
        uint256 deadline;
        bytes userData;
    }

    /// @notice add liquidity to the pool
    /// @param amountEth amount of ETH to add to the pool
    /// @param minLiquidity minimum amount of liquidity tokens to be minted
    /// @param maxBull maximum amount of Bull tokens to add to the liquidity pool
    /// @param maxBear maximum amount of Bear tokens to add to the liquidity pool
    /// @param (to, deadline, userData) see {Mint}
    struct AddLiquidity {
        uint256 amountEth;
        uint256 minLiquidity;
        uint256 maxBull;
        uint256 maxBear;
        address to;
        uint256 deadline;
        bytes userData;
    }
}
