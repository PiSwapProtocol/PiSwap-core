// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.4;

import "./Market.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title  Market Factory
/// @notice Deploys a new market contract
/// @dev    Due to the contract size limitations, the factory was separated from the registry
contract MarketFactory {
    /// @notice Creates a new market for a specified NFT
    /// @param _tokenAddress     address of the NFT token contract
    /// @param _tokenId          Id of the NFT
    /// @return market           the address of the deployed market contract
    function deployMarket(address _tokenAddress, uint256 _tokenId) external returns (address market) {
        NFTType nftType;
        IERC165 token = IERC165(_tokenAddress);
        if (token.supportsInterface(0x80ac58cd)) {
            nftType = NFTType.ERC721;
        } else if (token.supportsInterface(0xd9b67a26)) {
            nftType = NFTType.ERC1155;
        } else {
            revert("Unsupported smart contract");
        }
        return address(new Market(_tokenAddress, _tokenId, msg.sender, nftType));
    }
}
