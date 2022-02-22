//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "../lib/Types.sol";

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
    /// @param (kind, to, slippage, deadline, userData) see {Mint}
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

    /// @notice remove liquidity from the pool
    /// @param amountLiquidity amount of liquidity tokens to burn
    /// @param minEth minimum amount of ETH out
    /// @param minBull minimum amount of Bull tokens out
    /// @param minBear minimum amount of Bear tokens out
    /// @param (to, deadline, userData) see {Mint}
    struct RemoveLiquidity {
        uint256 amountLiquidity;
        uint256 minEth;
        uint256 minBull;
        uint256 minBear;
        address to;
        uint256 deadline;
        bytes userData;
    }

    /// @param tokenIn token type in
    /// @param tokenOut token type out
    /// @param (kind, amount, to, slippage, deadline, userData) see {Mint}
    struct Swap {
        uint256 amount;
        TokenType tokenIn;
        TokenType tokenOut;
        SwapKind kind;
        uint256 slippage;
        address to;
        uint256 deadline;
        bytes userData;
    }

    /// @param amount of NFTs to buy/sell (has to be 1 when swapping ERC721 tokens)
    /// @param (slippage, to, deadline, userData) see {Mint}
    struct NFTSwap {
        uint256 amount;
        uint256 slippage;
        address to;
        uint256 deadline;
        bytes userData;
    }
}
