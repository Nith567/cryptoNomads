// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SelfVerificationRoot} from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import {SelfStructs} from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";
import {SelfUtils} from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";
import {IIdentityVerificationHubV2} from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";

/**
 * @title CryptoNomads
 * @notice Stores Self Protocol verification data mapped by Discord ID
 * @dev Maps Discord IDs to verification data for easy retrieval
 */
contract CryptoNomads is SelfVerificationRoot {
    // Basic storage (for compatibility)
    bool public verificationSuccessful;
    ISelfVerificationRoot.GenericDiscloseOutputV2 public lastOutput;
    bytes public lastUserData;
    SelfStructs.VerificationConfigV2 public verificationConfig;
    bytes32 public verificationConfigId;
    address public lastUserAddress;

    // Discord ID mapping storage
    struct VerificationData {
        string gender;           // "male" or "female"
        string nationality;      // Country code like "IND", "USA", etc.
        bool isAdult;           // true if olderThan >= 18
        uint256 ageThreshold;   // The actual age threshold (18, 21, etc.)
        address walletAddress;  // Privy wallet address
        bool isVerified;
    }

    // Main mapping: Discord ID -> Verification Data
    mapping(string => VerificationData) public discordVerifications;
    
    // Reverse mapping: Wallet Address -> Discord ID
    mapping(address => string) public walletToDiscordId;
    
    // Array to track all verified Discord IDs (for admin purposes)
    string[] public verifiedDiscordIds;
    
    // Events
    event VerificationCompleted(
        ISelfVerificationRoot.GenericDiscloseOutputV2 output,
        bytes userData,
        address userAddress,
        string indexed discordId
    );

    event DiscordVerificationStored(
        string indexed discordId,
        address indexed walletAddress,
        string gender,
        string nationality,
        bool isAdult
    );

    /**
     * @notice Constructor
     * @param identityVerificationHubV2Address Hub V2 address
     * @param scope Unique scope for your app
     * @param _verificationConfig Verification requirements
     */
    constructor(
        address identityVerificationHubV2Address,
        uint256 scope, 
        SelfUtils.UnformattedVerificationConfigV2 memory _verificationConfig
    ) SelfVerificationRoot(identityVerificationHubV2Address, scope) {
        verificationConfig = SelfUtils.formatVerificationConfigV2(_verificationConfig);
        verificationConfigId = IIdentityVerificationHubV2(identityVerificationHubV2Address)
            .setVerificationConfigV2(verificationConfig);
    }

    /**
     * @notice Called when Self Protocol verification succeeds
     * @param output Verification results from Self Protocol
     * @param userData Discord ID (passed as userDefinedData)
     */
    function customVerificationHook(
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
        bytes memory userData
    ) internal override {
        // Update basic storage
        verificationSuccessful = true;
        lastOutput = output;
        lastUserData = userData;
        lastUserAddress = address(uint160(output.userIdentifier)); 

        // Extract Discord ID from userData (bytes to string conversion)
        // userData contains the Discord ID string like "123456789012345678"
        string memory discordId = string(userData);
        
        // Check if user is adult (olderThan >= 18)
        bool isAdult = output.olderThan >= 18;
        
        // Store verification data by Discord ID
        discordVerifications[discordId] = VerificationData({
            gender: output.gender,              // "male" or "female"
            nationality: output.nationality,    // Country code like "IND", "USA"
            isAdult: isAdult,                  // true if age >= 18
            ageThreshold: output.olderThan,    // Actual age threshold (18, 21, etc.)
            walletAddress: lastUserAddress,    // Privy wallet address
            isVerified: true
        });

        // Store reverse mapping
        walletToDiscordId[lastUserAddress] = discordId;
        
        // Add to verified list (if not already added)
        if (!isDiscordIdInArray(discordId)) {
            verifiedDiscordIds.push(discordId);
        }

        // Emit events
        emit VerificationCompleted(output, userData, lastUserAddress, discordId);
        emit DiscordVerificationStored(
            discordId,
            lastUserAddress,
            output.gender,
            output.nationality,
            isAdult
        );
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @notice Get all verification data for a Discord ID
     * @param discordId The Discord user ID
     * @return All verification data
     */
    function getVerificationDataByDiscordId(string memory discordId) 
        external 
        view 
        returns (
            string memory gender,
            string memory nationality,
            bool isAdult,
            uint256 ageThreshold,
            address walletAddress,
            bool isVerified
        ) 
    {
        VerificationData memory data = discordVerifications[discordId];
        return (
            data.gender,
            data.nationality,
            data.isAdult,
            data.ageThreshold,
            data.walletAddress,
            data.isVerified
        );
    }

    /**
     * @notice Check if Discord ID is verified
     * @param discordId The Discord user ID
     * @return isVerified Whether the user is verified
     */
    function isDiscordIdVerified(string memory discordId) 
        external 
        view 
        returns (bool isVerified) 
    {
        return discordVerifications[discordId].isVerified;
    }

    /**
     * @notice Get Discord ID from wallet address
     * @param walletAddress The wallet address
     * @return discordId The Discord ID
     */
    function getDiscordIdByWallet(address walletAddress) 
        external 
        view 
        returns (string memory discordId) 
    {
        return walletToDiscordId[walletAddress];
    }

    /**
     * @notice Get verification data for multiple Discord IDs
     * @param discordIds Array of Discord IDs
     * @return results Array of verification data
     */
    function getBatchVerificationData(string[] memory discordIds)
        external
        view
        returns (VerificationData[] memory results)
    {
        results = new VerificationData[](discordIds.length);
        for (uint256 i = 0; i < discordIds.length; i++) {
            results[i] = discordVerifications[discordIds[i]];
        }
        return results;
    }

    /**
     * @notice Get total number of verified users
     * @return count Total verified Discord IDs
     */
    function getTotalVerifiedCount() external view returns (uint256 count) {
        return verifiedDiscordIds.length;
    }

    /**
     * @notice Get verified Discord ID by index
     * @param index Index in the verified array
     * @return discordId The Discord ID at that index
     */
    function getVerifiedDiscordIdByIndex(uint256 index) 
        external 
        view 
        returns (string memory discordId) 
    {
        require(index < verifiedDiscordIds.length, "Index out of bounds");
        return verifiedDiscordIds[index];
    }

    // ========== INTERNAL FUNCTIONS ==========

    /**
     * @notice Check if Discord ID is already in verified array
     * @param discordId The Discord ID to check
     * @return exists Whether it exists in the array
     */
    function isDiscordIdInArray(string memory discordId) 
        internal 
        view 
        returns (bool exists) 
    {
        for (uint256 i = 0; i < verifiedDiscordIds.length; i++) {
            if (keccak256(bytes(verifiedDiscordIds[i])) == keccak256(bytes(discordId))) {
                return true;
            }
        }
        return false;
    }

    // ========== REQUIRED OVERRIDES ==========

    /**
     * @notice Get config ID for verification
     */
    function getConfigId(
        bytes32 /* destinationChainId */,
        bytes32 /* userIdentifier */,
        bytes memory /* userDefinedData */
    ) public view override returns (bytes32) {
        return verificationConfigId;
    }

    // ========== ADMIN FUNCTIONS (Optional) ==========

    /**
     * @notice Update scope (admin only - add access control if needed)
     * @param newScope New scope value
     */
    function setScope(uint256 newScope) external {
        _setScope(newScope);
    }

    /**
     * @notice Update config ID (admin only - add access control if needed)
     * @param configId New config ID
     */
    function setConfigId(bytes32 configId) external {
        verificationConfigId = configId;
    }
}
