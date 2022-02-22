// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract SampleERC1155 is ERC1155 {
    constructor() ERC1155("") {
        _mint(_msgSender(), 0, 2, "");
    }
}

contract SampleERC1155Royalty is SampleERC1155 {
    constructor() SampleERC1155() {}

    function royaltyInfo(uint256, uint256 _salePrice) external view returns (address receiver, uint256 royaltyAmount) {
        receiver = address(this);
        royaltyAmount = _salePrice / 5;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0x2a55205a || super.supportsInterface(interfaceId);
    }
}
