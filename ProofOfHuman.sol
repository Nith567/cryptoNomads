// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SelfVerificationRoot} from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import {SelfStructs} from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";
import {SelfUtils} from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";
import {IIdentityVerificationHubV2} from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";

/**
 * @title ProofOfHuman
 * @notice Proof of Human verification contract using Self Protocol
 * @dev This contract stores verification data mapped by Discord ID
 */
contract ProofOfHuman is SelfVerificationRoot {
    // Storage for verification data
    bool public verificationSuccessful;
    ISelfVerificationRoot.GenericDiscloseOutputV2 public lastOutput;
    bytes public lastUserData;
    SelfStructs.VerificationConfigV2 public verificationConfig;
    bytes32 public verificationConfigId;
    address public lastUserAddress;

    // New storage: Map Discord ID to verification data
    struct VerificationData {
        string gender;
        string nationality;
        bool olderthan;
        address walletAddress;
        bool isVerified;
        uint256 verificationTimestamp;
    }

    // Discord ID (string) -> Verification Data
    mapping(string => VerificationData) public discordVerifications;
    
    // Wallet Address -> Discord ID (reverse lookup)
    mapping(address => string) public walletToDiscordId;

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
        bool olderthan,
        uint256 timestamp
    );

    /**
     * @notice Constructor for the contract
     * @param identityVerificationHubV2Address The address of the Identity Verification Hub V2
     */
    constructor(
        address identityVerificationHubV2Address,
        uint256 scope, 
        SelfUtils.UnformattedVerificationConfigV2 memory _verificationConfig
    ) SelfVerificationRoot(identityVerificationHubV2Address, scope) {
        verificationConfig = SelfUtils.formatVerificationConfigV2(_verificationConfig);
        verificationConfigId = IIdentityVerificationHubV2(identityVerificationHubV2Address).setVerificationConfigV2(verificationConfig);
    }

    /**
     * @notice Implementation of customVerificationHook
     * @dev This function is called by onVerificationSuccess after hub address validation
     * @param output The verification output from the hub
     * @param userData The user data passed through verification (Discord ID)
     */
    function customVerificationHook(
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
        bytes memory userData
    ) internal override {
        // Store general verification data
        verificationSuccessful = true;
        lastOutput = output;
        lastUserData = userData;
        lastUserAddress = address(uint160(output.userIdentifier)); // This is the Privy wallet address

        // Extract Discord ID from userData
        string memory discordId = string(userData);

        // Store verification data mapped by Discord ID
        discordVerifications[discordId] = VerificationData({
            gender: output.gender,
            nationality: output.nationality,
            olderthan: output.olderthan,
            walletAddress: lastUserAddress,
            isVerified: true,
            verificationTimestamp: block.timestamp
        });

        // Store reverse mapping
        walletToDiscordId[lastUserAddress] = discordId;

        // Emit events
        emit VerificationCompleted(output, userData, lastUserAddress, discordId);
        emit DiscordVerificationStored(
            discordId,
            lastUserAddress,
            output.gender,
            output.nationality,
            output.olderthan
        );
    }

    /**
     * @notice Get verification data for a Discord ID
     * @param discordId The Discord user ID
     * @return gender The user's gender
     * @return nationality The user's nationality  
     * @return olderthan Whether user is older than minimum age
     * @return walletAddress The associated wallet address
     * @return isVerified Whether the user is verified
     * @return verificationTimestamp When verification occurred
     */
    function getVerificationDataByDiscordId(string memory discordId) 
        external 
        view 
        returns (
            string memory gender,
            string memory nationality,
            bool olderthan,
            address walletAddress,
            bool isVerified,
            uint256 verificationTimestamp
        ) 
    {
        VerificationData memory data = discordVerifications[discordId];
        return (
            data.gender,
            data.nationality,
            data.olderthan,
            data.walletAddress,
            data.isVerified,
            data.verificationTimestamp
        );
    }

    /**
     * @notice Get Discord ID for a wallet address
     * @param walletAddress The wallet address
     * @return discordId The associated Discord ID
     */
    function getDiscordIdByWallet(address walletAddress) 
        external 
        view 
        returns (string memory discordId) 
    {
        return walletToDiscordId[walletAddress];
    }

    /**
     * @notice Check if a Discord ID is verified
     * @param discordId The Discord user ID
     * @return isVerified Whether the Discord ID has completed verification
     */
    function isDiscordIdVerified(string memory discordId) 
        external 
        view 
        returns (bool isVerified) 
    {
        return discordVerifications[discordId].isVerified;
    }

    /**
     * @notice Get all verification data for multiple Discord IDs
     * @param discordIds Array of Discord IDs to check
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
}
