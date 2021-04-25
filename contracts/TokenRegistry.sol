// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.0;

import "./Types.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

interface IMarketFactory {
    function deployMarket(address _tokenAddress, uint256 _tokenId) external returns (address market);
}

/// @title  Token Registry
/// @notice Implements the ERC1155 token standard and deploys new markets
/// @dev    Due to the contract size limitations, a separate contract deploys the market contracts
contract TokenRegistry is ERC1155 {
    struct TokenData {
        address NFTContract;
        uint256 tokenId;
    }

    address public owner;
    IMarketFactory public factory;
    // market address => token data
    mapping(address => TokenData) public tokenData;
    // nft contract address => token id => market address
    mapping(address => mapping(uint256 => address)) public markets;
    // token id => total supply
    mapping(uint256 => uint256) public totalSupply;
    uint8 public constant decimals = 18;
    uint256 public priceImpact = 10 ether;
    address private _proposedOwner;

    event MarketCreated(address indexed market, address indexed NFTContract, uint256 indexed tokenId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PriceImpactChange(uint256 indexed oldPriceImpact, uint256 indexed newPriceImpact);

    modifier onlyMarket {
        require(tokenData[msg.sender].NFTContract != address(0), "Only callable by markets");
        _;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    constructor(
        address _owner,
        address _factory,
        string memory _uri
    ) ERC1155(_uri) {
        owner = _owner;
        factory = IMarketFactory(_factory);
    }

    /// @notice Creates a new market for a specified NFT
    /// @param _NFTContract      address of the NFT token contract
    /// @param _tokenId          Id of the NFT
    /// @return market           the address of the deployed market contract
    function createMarket(address _NFTContract, uint256 _tokenId) external returns (address market) {
        require(markets[_NFTContract][_tokenId] == address(0), "Market already exists");
        require(_NFTContract != address(this), "Cannot create market for this contract");
        TokenData memory data = TokenData({NFTContract: _NFTContract, tokenId: _tokenId});
        // deploy market contract
        market = factory.deployMarket(_NFTContract, _tokenId);

        // register token
        markets[_NFTContract][_tokenId] = market;
        tokenData[market] = data;

        emit MarketCreated(market, _NFTContract, _tokenId);
    }

    // TODO comment and test
    function proposeNewOwner(address _newOwner) public onlyOwner {
        _proposedOwner = _newOwner;
    }

    function claimOwnership() public {
        require(msg.sender == _proposedOwner, "Ownable: only callable by proposed owner");
        emit OwnershipTransferred(owner, _proposedOwner);
        owner = _proposedOwner;
    }

    function setPriceImpact(uint256 _newImpact) public onlyOwner {
        require(_newImpact > 2 ether);
        emit PriceImpactChange(priceImpact, _newImpact);
        priceImpact = _newImpact;
    }

    /// @notice Returns the total supply for a specific token
    /// @param _market    market smart contract address
    /// @param _tokenType type of the token
    /// @return           total supply of the token
    function getTotalSupply(address _market, TokenType _tokenType) public view returns (uint256) {
        uint256 tokenId = getTokenId(_market, _tokenType);
        return totalSupply[tokenId];
    }

    /// @notice Calculates token id
    /// @param _market    market smart contract address
    /// @param _tokenType type of the token
    function getTokenId(address _market, TokenType _tokenType) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(_market, _tokenType)));
    }

    /// @notice Mint tokens to an address
    /// @dev              only callable by markets
    /// @param _to        address to mint the tokens to
    /// @param _amount    amount of tokens to mint
    /// @param _tokenType type of the token
    function mint(
        address _to,
        uint256 _amount,
        TokenType _tokenType
    ) public onlyMarket {
        require(_amount > 0, "Amount can't be zero");
        uint256 tokenId = getTokenId(msg.sender, _tokenType);
        _mint(_to, tokenId, _amount, "");
        totalSupply[tokenId] += _amount;
    }

    /// @notice Burn tokens from an address
    /// @dev              only callable by markets
    /// @param _from      address to burn the tokens from
    /// @param _amount    amount of tokens to burn
    /// @param _tokenType type of the token
    function burn(
        address _from,
        uint256 _amount,
        TokenType _tokenType
    ) public onlyMarket {
        require(_amount > 0, "Amount can't be zero");
        uint256 tokenId = getTokenId(msg.sender, _tokenType);
        _burn(_from, tokenId, _amount);
        totalSupply[tokenId] -= _amount;
    }
}
