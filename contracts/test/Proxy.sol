//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "../Types.sol";
import "../Market.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

contract Proxy is ERC1155Holder {
    Market m;

    constructor(address _market) {
        m = Market(_market);
    }

    receive() external payable {
        revert("This contract does not accept payments");
    }

    function purchase() public payable {
        m.purchaseTokens{value: msg.value}(0, 4102444800);
    }

    function redeem(uint256 _amount) public {
        m.redeemTokens(_amount, 0, 4102444800);
    }

    function addLiquidity() public payable {
        m.addLiquidity{value: msg.value}(0, 200 ether, 1000 ether, 4102444800);
    }

    function removeLiquidity() public {
        m.removeLiquidity(1500000000000000000, 0, 0, 0, 4102444800);
    }
}
