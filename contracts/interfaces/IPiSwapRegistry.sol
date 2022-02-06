//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "./Types.sol";

interface IPiSwapRegistry {
    event MarketCreated(address indexed market, address indexed NFTContract, uint256 indexed tokenId);

    function createMarket(address _tokenAddress, uint256 _tokenId) external returns (address market);

    function marketExists(address _tokenAddress, uint256 _tokenId) external view returns (bool);

    function getTokenId(address _market, TokenType _tokenType) external pure returns (uint256);

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
}
