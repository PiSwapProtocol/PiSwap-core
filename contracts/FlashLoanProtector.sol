// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.0;

/// @notice Contract module that disallows calling a function if a certain function has been called beforehand
abstract contract FlashLoanProtector {
    address private lastTxOrigin;
    uint256 private lastBlockNumber;

    /// @notice disallows contracts to call multiple functions in one transaction to prevent flash loan attacks on the market. Any market manipulation would require risking personal assets
    /// @dev    this only allows a contract to call one function per block. It allows a second transaction in the same block, if another user has a transaction between both transactions in the same block
    /// @dev    non-contract users can interact with the market however they want to
    /// @dev    if a user tries to drastically change one of the pools, backrunners can profit by submitting a transaction, taking advantage of the arbitrage opportunity
    /// @dev    https://github.com/ethereum/go-ethereum/pull/21358: If transactions are not randomized anymore but added by FIFO, could this mean a user could submit a lot of transactions manipulating the contract at the same time and no backrunners could prevent this?
    modifier FLprotected() {
        if (msg.sender != tx.origin) {
            require(!(lastTxOrigin == tx.origin && lastBlockNumber == block.number), "Flash loan protection");
            lastTxOrigin = tx.origin;
            lastBlockNumber = block.number;
        }
        _;
    }
}
