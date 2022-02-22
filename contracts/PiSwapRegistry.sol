// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

import "./interfaces/IPiSwapRegistry.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";
import "./lib/BeaconUpgradeable.sol";

import "./lib/BeaconProxyOptimized.sol";

interface IMarket {
    function initialize(
        address _tokenAddress,
        uint256 _tokenId,
        NFTType _nftType
    ) external;
}

struct NFT {
    address tokenAddress;
    uint256 tokenId;
}

/// @title  Token Registry
/// @notice Implements the ERC1155 token standard and deploys new markets
/// @dev    Due to the contract size limitations, a separate contract deploys the market contracts
contract PiSwapRegistry is IPiSwapRegistry, BeaconUpgradeable, ERC1155SupplyUpgradeable {
    using TokenTypeLib for TokenType;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address;

    address public WETH;
    address public beneficiary;

    // market address => token data
    mapping(address => NFT) public nftInfo;
    // nft contract address => token id => market address
    mapping(address => mapping(uint256 => address)) public markets;

    uint256 public fee;
    uint256 public oracleLength;

    uint8 public constant decimals = 18;

    modifier onlyMarket() {
        require(_isMarket(_msgSender()), _errMsg("mint/burn", "ONLY_MARKET"));
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
        fee = 50;
        oracleLength = 60;
        WETH = _weth;
    }

    /// @notice Creates a new market for a specified NFT
    /// @param _tokenAddress     address of the NFT token contract
    /// @param _tokenId          Id of the NFT
    /// @return market           the address of the deployed market contract
    function createMarket(address _tokenAddress, uint256 _tokenId) external returns (address market) {
        require(markets[_tokenAddress][_tokenId] == address(0), _errMsg("createMarket", "MARKET_EXISTS"));
        require(_tokenAddress != address(this), _errMsg("createMarket", "INVALID"));
        NFT memory data = NFT({tokenAddress: _tokenAddress, tokenId: _tokenId});

        // deploy market contract
        NFTType nftType = _getNFTType(_tokenAddress);
        market = address(new BeaconProxyOptimized());
        markets[_tokenAddress][_tokenId] = market;

        IMarket(market).initialize(_tokenAddress, _tokenId, nftType);

        // register token
        nftInfo[market] = data;

        emit MarketCreated(market, _tokenAddress, _tokenId);
    }

    function marketExists(address _tokenAddress, uint256 _tokenId) public view returns (bool) {
        address market = markets[_tokenAddress][_tokenId];
        NFT memory data = nftInfo[market];
        return data.tokenAddress != address(0);
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
        require(_amount > 0, _errMsg("mint", "AMOUNT_ZERO"));
        uint256 tokenId = _tokenType.id(_msgSender());
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
        require(_amount > 0, _errMsg("burn", "AMOUNT_ZERO"));
        uint256 tokenId = _tokenType.id(_msgSender());
        _burn(_from, tokenId, _amount);
    }

    function setFee(uint256 _newFee) public onlyOwner {
        require(_newFee <= 200);
        emit FeeUpdated(fee, _newFee);
        fee = _newFee;
    }

    function setOracleLength(uint256 _newOracleLength) public onlyOwner {
        require(_newOracleLength >= 5);
        emit OracleLengthUpdated(oracleLength, _newOracleLength);
        oracleLength = _newOracleLength;
    }

    function setBeneficiary(address _beneficiary) public onlyOwner {
        // if (_beneficiary.isContract()) {
        //     require(IERC165Upgradeable(_beneficiary).supportsInterface(0x4e2312e0), "PiSwapRegistry#setBeneficiary: DOES_NOT_SUPPORT_ERC1155RECEIVER");
        // }
        beneficiary = _beneficiary;
    }

    function deposit(uint256 _amount) public {
        IERC20Upgradeable(WETH).safeTransferFrom(_msgSender(), address(this), _amount);
        _mint(_msgSender(), 0, _amount, "");
        emit Deposit(_msgSender(), _amount);
    }

    function withdraw(uint256 _amount, address _to) public {
        _burn(_msgSender(), 0, _amount);
        IERC20Upgradeable(WETH).safeTransfer(_to, _amount);
        emit Withdrawal(_msgSender(), _to, _amount);
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
            revert(_errMsg("createMarket", "UNSUPPORTED_CONTRACT"));
        }
    }

    function _errMsg(string memory _method, string memory _message) private pure returns (string memory) {
        return string(abi.encodePacked("PiSwapRegistry#", _method, ": ", _message));
    }

    uint256[50] private __gap;
}
