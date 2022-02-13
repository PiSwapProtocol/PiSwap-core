//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "./Types.sol";

interface IPiSwapRegistry {
    event MarketCreated(address indexed market, address indexed NFTContract, uint256 indexed tokenId);
    event Deposit(address indexed sender, uint256 amount);
    event Withdrawal(address indexed sender, address indexed to, uint256 amount);

    function WETH() external view returns (address);

    function createMarket(address _tokenAddress, uint256 _tokenId) external returns (address market);

    function marketExists(address _tokenAddress, uint256 _tokenId) external view returns (bool);

    function mint(
        address _to,
        uint256 _amount,
        TokenType _tokenType
    ) external;

    function burn(
        address _from,
        uint256 _amount,
        TokenType _tokenType
    ) external;

    function deposit(uint256 _amount) external;

    function withdraw(uint256 _amount, address _to) external;

    function beneficiary() external view returns (address);

    function fee() external view returns (uint256);
}
