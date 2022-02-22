// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract SampleERC721 is ERC721 {
    string private assetUrl;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _assetUrl
    ) ERC721(_name, _symbol) {
        assetUrl = _assetUrl;
        _mint(_msgSender(), 0);
    }

    function tokenURI(uint256) public view override returns (string memory) {
        return assetUrl;
    }
}

contract SampleERC721Royalty is SampleERC721 {
    constructor(
        string memory _name,
        string memory _symbol,
        string memory _assetUrl
    ) SampleERC721(_name, _symbol, _assetUrl) {}

    function royaltyInfo(uint256, uint256 _salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        receiver = address(this);
        royaltyAmount = _salePrice / 10;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0x2a55205a || super.supportsInterface(interfaceId);
    }
}
