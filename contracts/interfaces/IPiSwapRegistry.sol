//SPDX-License-Identifier:AGPL-3.0-only
pragma solidity 0.8.11;

import "../lib/Types.sol";

interface IPiSwapRegistry {
    event MarketCreated(address indexed market, address indexed NFTContract, uint256 indexed tokenId);
    event Deposit(address indexed sender, uint256 amount);
    event Withdrawal(address indexed sender, address indexed to, uint256 amount);
    event FeeUpdated(uint256 indexed feeBefore, uint256 indexed feeAfter);
    event OracleLengthUpdated(uint256 indexed lengthBefore, uint256 indexed lengthAfter);
    event BeneficiaryUpdated(address indexed oldBeneficiary, address indexed newBeneficiary);

    function WETH() external view returns (address);

    /// @notice Creates a new market for a specified NFT
    /// @param tokenAddress     address of the NFT token contract
    /// @param tokenId          Id of the NFT
    /// @return market          the address of the deployed market contract
    function createMarket(address tokenAddress, uint256 tokenId) external returns (address market);

    /// @notice Mint tokens to an address
    /// @param to        address to mint the tokens to
    /// @param amount    amount of tokens to mint
    /// @param tokenType type of the token
    function mint(
        address to,
        uint256 amount,
        TokenType tokenType
    ) external;

    /// @notice Burn tokens from an address
    /// @param from      address to burn the tokens from
    /// @param amount    amount of tokens to burn
    /// @param tokenType type of the token
    function burn(
        address from,
        uint256 amount,
        TokenType tokenType
    ) external;

    /// @notice wrap WETH into WETH1155
    /// @param amount of WETH to wrap
    function deposit(uint256 amount) external;

    /// @notice unwrap WETH1155 into WETH
    /// @param amount of WETH1155 to unwrap
    /// @param to     address to receive WETH
    function withdraw(uint256 amount, address to) external;

    /// @notice sets beneficiary receiving protocol fee
    function beneficiary() external view returns (address);

    /// @notice sets new protocol fee
    function fee() external view returns (uint256);

    /// @notice sets new oracle length
    function oracleLength() external view returns (uint256);

    /// @notice see {IERC1155-_setURI}.
    function setURI(string calldata newUri) external;

    /// @notice check whether market exists for a specific NFT
    /// @param tokenAddress NFT contract address
    /// @param tokenId      NFT token id
    /// @return             true if market exists
    function marketExists(address tokenAddress, uint256 tokenId) external view returns (bool);
}
