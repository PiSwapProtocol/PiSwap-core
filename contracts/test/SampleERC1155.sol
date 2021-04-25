// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract SampleERC1155 is ERC1155 {
    constructor() ERC1155("") {
        _mint(msg.sender, 0, 2, "");
    }
}
