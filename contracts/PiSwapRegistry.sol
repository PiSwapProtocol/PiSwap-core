// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "./interfaces/IPiSwapRegistry.sol";
import "./interfaces/IWETH.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "./lib/BeaconUpgradeable.sol";

import "./lib/BeaconProxyOptimized.sol";

interface IMarket {
    function initialize(
        address _tokenAddress,
        uint256 _tokenId,
        address _registry,
        NFTType _nftType
    ) external;
}

struct NFT {
    address tokenAddress;
    uint256 tokenId;
}

// TODO implement beneficiary

/// @title  Token Registry
/// @notice Implements the ERC1155 token standard and deploys new markets
/// @dev    Due to the contract size limitations, a separate contract deploys the market contracts
contract PiSwapRegistry is IPiSwapRegistry, BeaconUpgradeable, ERC1155SupplyUpgradeable {
    IWETH public WETH;
    address public beneficiary;

    // market address => token data
    mapping(address => NFT) public nftInfo;
    // nft contract address => token id => market address
    mapping(address => mapping(uint256 => address)) public markets;

    uint8 public constant decimals = 18;

    modifier onlyMarket() {
        require(_isMarket(_msgSender()), "Only callable by markets");
        _;
    }

    function initialize(
        address _owner,
        address _beneficiary,
        address _marketImplementation,
        address _weth,
        string calldata _uri
    ) external initializer {
        __Owned_init(_owner);
        __Beacon_init(_marketImplementation);
        __ERC1155_init(_uri);
        __ERC1155Supply_init();
        beneficiary = _beneficiary;
        WETH = IWETH(_weth);
    }

    /// @notice Creates a new market for a specified NFT
    /// @param _tokenAddress     address of the NFT token contract
    /// @param _tokenId          Id of the NFT
    /// @return market           the address of the deployed market contract
    function createMarket(address _tokenAddress, uint256 _tokenId) external returns (address market) {
        require(markets[_tokenAddress][_tokenId] == address(0), "Market already exists");
        require(_tokenAddress != address(this), "Cannot create market for this contract");
        NFT memory data = NFT({tokenAddress: _tokenAddress, tokenId: _tokenId});

        // deploy market contract
        NFTType nftType = _getNFTType(_tokenAddress);
        market = address(new BeaconProxyOptimized());
        markets[_tokenAddress][_tokenId] = market;

        IMarket(market).initialize(_tokenAddress, _tokenId, address(this), nftType);

        // register token
        nftInfo[market] = data;

        emit MarketCreated(market, _tokenAddress, _tokenId);
    }

    function marketExists(address _tokenAddress, uint256 _tokenId) public view returns (bool) {
        address market = markets[_tokenAddress][_tokenId];
        NFT memory data = nftInfo[market];
        return data.tokenAddress != address(0);
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
        uint256 tokenId = getTokenId(_msgSender(), _tokenType);
        _mint(_to, tokenId, _amount, "");
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
        uint256 tokenId = getTokenId(_msgSender(), _tokenType);
        _burn(_from, tokenId, _amount);
    }

    function deposit(uint256 _amount) public {
        WETH.transferFrom(_msgSender(), address(this), _amount);
        _mint(_msgSender(), 0, _amount, "");
        emit Deposit(_msgSender(), _amount);
    }

    function withdraw(uint256 _amount) public {
        _burn(_msgSender(), 0, _amount);
        WETH.transfer(_msgSender(), _amount);
        emit Withdrawal(_msgSender(), _amount);
    }

    function _isMarket(address _market) private view returns (bool) {
        return nftInfo[_market].tokenAddress != address(0);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(address account, address operator) public view virtual override returns (bool) {
        if (_isMarket(operator)) {
            return true;
        }
        return super.isApprovedForAll(account, operator);
    }

    function _getNFTType(address _tokenAddress) private view returns (NFTType) {
        IERC165Upgradeable token = IERC165Upgradeable(_tokenAddress);
        if (token.supportsInterface(0x80ac58cd)) {
            return NFTType.ERC721;
        } else if (token.supportsInterface(0xd9b67a26)) {
            return NFTType.ERC1155;
        } else {
            revert("Unsupported smart contract");
        }
    }

    uint256[50] private __gap;
}
