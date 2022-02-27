// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.11;

// interfaces
import "./interfaces/IPiSwapRegistry.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// libraries
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./lib/registry/BeaconProxyOptimized.sol";
// base contracts
import "./lib/registry/BeaconUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155SupplyUpgradeable.sol";

interface IMarket {
    function initialize(
        address tokenAddress,
        uint256 tokenId,
        NFTType nftType
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
    /// @param tokenAddress     address of the NFT token contract
    /// @param tokenId          Id of the NFT
    /// @return market          the address of the deployed market contract
    function createMarket(address tokenAddress, uint256 tokenId) external returns (address market) {
        require(markets[tokenAddress][tokenId] == address(0), _errMsg("createMarket", "MARKET_EXISTS"));
        require(tokenAddress != address(this), _errMsg("createMarket", "INVALID"));
        NFT memory data = NFT({tokenAddress: tokenAddress, tokenId: tokenId});

        // deploy market contract
        NFTType nftType = _getNFTType(tokenAddress);
        // TODO: if ERC721 require ownerOf != address(0)
        market = address(new BeaconProxyOptimized());
        markets[tokenAddress][tokenId] = market;

        IMarket(market).initialize(tokenAddress, tokenId, nftType);

        // register token
        nftInfo[market] = data;

        emit MarketCreated(market, tokenAddress, tokenId);
    }

    /// @notice Mint tokens to an address
    /// @dev             only callable by markets
    /// @param to        address to mint the tokens to
    /// @param amount    amount of tokens to mint
    /// @param tokenType type of the token
    function mint(
        address to,
        uint256 amount,
        TokenType tokenType
    ) external onlyMarket {
        assert(amount > 0);
        uint256 tokenId = tokenType.id(_msgSender());
        _mint(to, tokenId, amount, "");
    }

    /// @notice Burn tokens from an address
    /// @dev             only callable by markets
    /// @param from      address to burn the tokens from
    /// @param amount    amount of tokens to burn
    /// @param tokenType type of the token
    function burn(
        address from,
        uint256 amount,
        TokenType tokenType
    ) external onlyMarket {
        require(amount > 0, _errMsg("burn", "AMOUNT_ZERO"));
        uint256 tokenId = tokenType.id(_msgSender());
        _burn(from, tokenId, amount);
    }

    /// @notice wrap WETH into NFTETH
    /// @param amount of WETH to wrap
    function deposit(uint256 amount) external {
        IERC20Upgradeable(WETH).safeTransferFrom(_msgSender(), address(this), amount);
        _mint(_msgSender(), 0, amount, "");
        emit Deposit(_msgSender(), amount);
    }

    /// @notice unwrap NFTETH into WETH
    /// @param amount of NFTETH to unwrap
    /// @param to     address to receive WETH
    function withdraw(uint256 amount, address to) external {
        _burn(_msgSender(), 0, amount);
        IERC20Upgradeable(WETH).safeTransfer(to, amount);
        emit Withdrawal(_msgSender(), to, amount);
    }

    /// @notice sets beneficiary receiving protocol fee
    function setBeneficiary(address newBeneficiary) external onlyOwner {
        emit BeneficiaryUpdated(beneficiary, newBeneficiary);
        beneficiary = newBeneficiary;
    }

    /// @notice sets new protocol fee
    /// @dev    fee cannot exceed 2%
    function setFee(uint256 newFee) external onlyOwner {
        require(newFee <= 200);
        emit FeeUpdated(fee, newFee);
        fee = newFee;
    }

    /// @notice sets new oracle length
    /// @dev    minimum is 5 blocks
    function setOracleLength(uint256 newOracleLength) external onlyOwner {
        require(newOracleLength >= 5);
        emit OracleLengthUpdated(oracleLength, newOracleLength);
        oracleLength = newOracleLength;
    }

    /**
     * @dev See {IERC1155-_setURI}.
     */
    function setURI(string calldata newUri) external onlyOwner {
        _setURI(newUri);
    }

    /// @notice check whether market exists for a specific NFT
    /// @param tokenAddress NFT contract address
    /// @param tokenId      NFT token id
    /// @return             true if market exists
    function marketExists(address tokenAddress, uint256 tokenId) public view returns (bool) {
        address market = markets[tokenAddress][tokenId];
        NFT memory data = nftInfo[market];
        return data.tokenAddress != address(0);
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

    function _isMarket(address market) private view returns (bool) {
        return nftInfo[market].tokenAddress != address(0);
    }

    function _getNFTType(address tokenAddress) private view returns (NFTType) {
        IERC165Upgradeable token = IERC165Upgradeable(tokenAddress);
        if (token.supportsInterface(0x80ac58cd)) {
            return NFTType.ERC721;
        } else if (token.supportsInterface(0xd9b67a26)) {
            return NFTType.ERC1155;
        } else {
            revert(_errMsg("createMarket", "UNSUPPORTED_CONTRACT"));
        }
    }

    function _errMsg(string memory method, string memory message) private pure returns (string memory) {
        return string(abi.encodePacked("PiSwapRegistry#", method, ": ", message));
    }

    uint256[50] private __gap;
}
