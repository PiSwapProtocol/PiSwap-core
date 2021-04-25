// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract SampleERC721 is ERC721 {
    string private assetUrl;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _assetUrl
    ) ERC721(_name, _symbol) {
        assetUrl = _assetUrl;
        _mint(msg.sender, 0);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return assetUrl;
    }
}
