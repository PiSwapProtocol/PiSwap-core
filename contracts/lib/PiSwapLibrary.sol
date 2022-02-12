//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

library PiSwapLibrary {
    uint256 internal constant MAX_SUPPLY = 1000000 ether;

    /// @notice calculates the total supply based on the amount of ETH deposited into the contract
    /// @param _depositedEth amount of ETH deposited into the smart contract
    /// @return              total supply
    function totalSupply(uint256 _depositedEth) internal pure returns (uint256) {
        return MAX_SUPPLY - (MAX_SUPPLY * 100 ether) / (_depositedEth + 100 ether);
    }

    /// @notice calculates the deposited ETH based on the total supply
    /// @param _totalSupply total supply
    /// @return             amount of ETH deposited into the smart contract
    function depositedEth(uint256 _totalSupply) internal pure returns (uint256) {
        return (MAX_SUPPLY * 100 ether) / (MAX_SUPPLY - _totalSupply) - 100 ether;
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
            (currentEth * _amountOut + 100 ether * _amountOut + currentEth * _totalSupply + _totalSupply * 100 ether - MAX_SUPPLY * currentEth) /
            (MAX_SUPPLY - _totalSupply - _amountOut);
    }
}
