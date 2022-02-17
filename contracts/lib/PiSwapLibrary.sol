//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

/// @dev When minting and burning tokens, due to precision errors, a few wei can be locked in the smart contract
/// @dev These locked wei will be automatically added to the liquidity pool, the impact is insignificant
/// @dev To avoid paying out more tokens than ETH locked, the calculations are rounded to ensure all bull and bear tokens can be redeemed
/// @dev This affects markets where >~10.000 ETH have been deposited
library PiSwapLibrary {
    uint256 internal constant MAX_SUPPLY = 1000000 ether;
    uint256 internal constant STRETCH_FACTOR = 10000 ether;

    /// @notice calculates the total supply based on the amount of ETH deposited into the contract
    /// @param _depositedEth amount of ETH deposited into the smart contract
    /// @return              total supply
    function totalSupply(uint256 _depositedEth) internal pure returns (uint256) {
        return MAX_SUPPLY - ((MAX_SUPPLY * STRETCH_FACTOR - 1) / (_depositedEth + STRETCH_FACTOR) + 1);
    }

    /// @notice calculates the deposited ETH based on the total supply
    /// @param _totalSupply total supply
    /// @return             amount of ETH deposited into the smart contract
    function depositedEth(uint256 _totalSupply) internal pure returns (uint256) {
        return (MAX_SUPPLY * STRETCH_FACTOR - 1) / (MAX_SUPPLY - _totalSupply) + 1 - STRETCH_FACTOR;
    }

    /// @notice calculates the amount of tokens minted based on the total supply
    /// @param _totalSupply total supply of bull and bear tokens
    /// @param _amountIn    amount of ETH in
    /// @return amountOut   amount of tokens minted
    function mintOutGivenIn(uint256 _totalSupply, uint256 _amountIn) internal pure returns (uint256 amountOut) {
        uint256 currentEth = depositedEth(_totalSupply);
        uint256 supplyAfterMint = totalSupply(currentEth + _amountIn);
        amountOut = supplyAfterMint - _totalSupply;
    }

    /// @notice calculates the amount of ETH in based on the total supply
    /// @param _totalSupply total supply of bull and bear tokens
    /// @param _amountOut   desired amount of tokens minted
    /// @return amountIn    amount of ETH in
    function mintInGivenOut(uint256 _totalSupply, uint256 _amountOut) internal pure returns (uint256 amountIn) {
        uint256 currentEth = depositedEth(_totalSupply);
        /**
            amountOut = totalSupply(currentEth + amountIn) - totalSupply
            =>
                        cuurentEth * amountOut) + 100 * amountOut + currentEth * totalSupply + 100 * currentEth - MAX_SUPPLY * currentEth
            amountIn = -------------------------------------------------------------------------------------------------------------------
                                                                MAX_SUPPLY - totalSupply - amountOut
         */
        amountIn =
            (currentEth * _amountOut + STRETCH_FACTOR * _amountOut + currentEth * _totalSupply + _totalSupply * STRETCH_FACTOR - MAX_SUPPLY * currentEth - 1) /
            (MAX_SUPPLY - _totalSupply - _amountOut) +
            1;
    }

    /// @notice calculates the amount of ETH out based on the total supply
    /// @param _totalSupply total supply of bull and bear tokens
    /// @param _amountIn    amount of tokens to burn
    /// @return amountOut   amount of eth out
    function burnOutGivenIn(uint256 _totalSupply, uint256 _amountIn) internal pure returns (uint256 amountOut) {
        require(_amountIn <= _totalSupply, "PiSwapMarket#burn: AMOUNT_EXCEEDS_SUPPLY");
        uint256 currentEth = depositedEth(_totalSupply);
        uint256 depositedEthAfter = depositedEth(_totalSupply - _amountIn);
        amountOut = currentEth - depositedEthAfter;
    }

    /// @notice calculates the amount of tokens burned based on the total supply
    /// @param _totalSupply total supply of bull and bear tokens
    /// @param _amountOut   desired amount of ETH out
    /// @return amountIn    amount of tokens burned
    function burnInGivenOut(uint256 _totalSupply, uint256 _amountOut) internal pure returns (uint256 amountIn) {
        /**
            amountOut = depositedEth(_totalSupply) - depositedEth(_totalSupply - amountIn)
            =>
                             amountOut * (MAX_SUPPLY - totalSupply)^2
            amountIn = -----------------------------------------------------
                        MAX_SUPPLY + amountOut * (totalSupply - MAX_SUPPLY)
         */
        amountIn = (_amountOut * (MAX_SUPPLY - _totalSupply)**2 - 1) / (STRETCH_FACTOR * MAX_SUPPLY + _amountOut * _totalSupply - _amountOut * MAX_SUPPLY) + 1;
        require(amountIn <= _totalSupply, "PiSwapMarket#burn: AMOUNT_EXCEEDS_SUPPLY");
    }

    /// @notice calculates the amount of tokens out based on the amount in
    /// @param _reserveIn  reserve of token in
    /// @param _reserveOut reserve of token out
    /// @param _amountIn   amount of tokens in
    /// @return amountOut  amount of tokens received from swap for token in
    function swapOutGivenIn(
        uint256 _reserveIn,
        uint256 _reserveOut,
        uint256 _amountIn
    ) internal pure returns (uint256 amountOut) {
        uint256 numerator = _reserveOut * _amountIn;
        uint256 denominator = _reserveIn + _amountIn;
        amountOut = numerator / denominator;
    }

    /// @notice calculates the amount of tokens in based on the amount out
    /// @param _reserveIn  reserve of token in
    /// @param _reserveOut reserve of token out
    /// @param _amountOut  amount of tokens out
    /// @return amountIn   amount of tokens to send to swap to receive amount out
    function swapInGivenOut(
        uint256 _reserveIn,
        uint256 _reserveOut,
        uint256 _amountOut
    ) internal pure returns (uint256 amountIn) {
        uint256 numerator = _reserveIn * _amountOut;
        require(_reserveOut > _amountOut, "PiSwapMarket#swap: MAX_OUT");
        uint256 denominator = _reserveOut - _amountOut;
        amountIn = numerator / denominator;
    }
}
