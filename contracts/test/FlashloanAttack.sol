// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.4;

import "../Market.sol";

interface ERC1155 {
    function setApprovalForAll(address operator, bool _approved) external;
}

interface ERC721 {
    function setApprovalForAll(address operator, bool _approved) external;

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;
}

contract FlashloanAttackA is ERC1155Holder, ERC721Holder {
    ERC721 NFT;
    Market market;
    FlashloanAttackB b;

    constructor(address _tokenRegistry, address _market) payable {
        market = Market(_market);
        b = new FlashloanAttackB(_market);
        ERC1155(_tokenRegistry).setApprovalForAll(_market, true);
        NFT = ERC721(market.NFTtokenAddress());
        NFT.setApprovalForAll(_market, true);
    }

    receive() external payable {}

    function setUp1() public {
        market.purchaseTokens{value: 2 ether}(0, 4102444800);
    }

    function setUp2() public {
        market.addLiquidity{value: 1 ether}(0, 1000 ether, 200 ether, 4102444800);
    }

    function sellNFT() public {
        market.purchaseTokens{value: 100}(0, 4102444800);
        market.sellNFT(0, 4102444800, 1);
    }

    function sellNFT_B() public {
        NFT.transferFrom(address(this), address(b), 0);
        market.purchaseTokens{value: 100}(0, 4102444800);
        b.sellNFT();
    }

    function sellNFTsuccess() public {
        market.sellNFT(0, 4102444800, 1);
    }

    function buyNFT() public {
        market.purchaseTokens{value: 100}(0, 4102444800);
        market.buyNFT{value: 200000000000000000}(4102444800, 1);
    }

    function buyNFT_B() public {
        market.purchaseTokens{value: 100}(0, 4102444800);
        b.buyNFT{value: 200000000000000000}();
    }

    function buyNFTsuccess() public {
        market.buyNFT{value: 200000000000000000}(4102444800, 1);
    }
}

contract FlashloanAttackB is ERC721Holder {
    Market market;
    FlashloanAttackB b;

    constructor(address _market) {
        market = Market(_market);
        ERC721(market.NFTtokenAddress()).setApprovalForAll(_market, true);
    }

    function sellNFT() public {
        market.sellNFT(0, 4102444800, 1);
    }

    function buyNFT() public payable {
        market.buyNFT{value: 200000000000000000}(4102444800, 1);
    }
}
