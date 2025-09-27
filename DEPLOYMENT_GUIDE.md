# CryptoNomads Smart Contract Deployment Guide

## Overview
The `CryptoNomads.sol` contract stores verification data mapped by Discord ID, allowing you to read on-chain verification data before updating your database.

## Key Understanding

### Discord ID Format
- Discord IDs are **strings** like `"123456789012345678"` (Discord snowflake)
- They come through `userData` as `bytes` and need to be converted to `string`

### Age Verification Logic
- `output.olderThan` returns `uint256` (like `18`, `21`, etc.)
- We convert this to `bool isAdult = output.olderThan >= 18`
- Store both the boolean result AND the actual threshold

### Data Types
```solidity
struct VerificationData {
    string gender;           // "male" or "female"
    string nationality;      // Country code like "IND", "USA", "GBR"
    bool isAdult;           // true if olderThan >= 18
    uint256 ageThreshold;   // Actual threshold (18, 21, etc.)
    address walletAddress;  // Privy wallet address
    bool isVerified;
}
```

## Key Features
- ✅ Maps Discord ID → Verification Data (gender, nationality, isAdult, walletAddress)
- ✅ Proper age logic: `olderThan >= 18` becomes `isAdult: true`
- ✅ Country codes like "IND", "USA", "GBR"
- ✅ Reverse mapping: Wallet Address → Discord ID  
- ✅ View functions to read verification data
- ✅ Batch operations support

## Contract Functions

### Storage Functions (called by Self Protocol)
- `customVerificationHook()` - Called automatically when verification completes

### View Functions (for your app)
- `getVerificationDataByDiscordId(string discordId)` - Get all verification data for a Discord ID
- `isDiscordIdVerified(string discordId)` - Check if Discord ID is verified
- `getDiscordIdByWallet(address wallet)` - Get Discord ID from wallet address
- `getBatchVerificationData(string[] discordIds)` - Get data for multiple Discord IDs

## Deployment Steps

### 1. Install Dependencies
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install @selfxyz/contracts ethers
```

### 2. Create Hardhat Config
Create `hardhat.config.js`:
```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.28",
  networks: {
    celoSepolia: {
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: ["YOUR_PRIVATE_KEY"], // Replace with your deployer private key
      chainId: 44787
    }
  }
};
```

### 3. Create Deployment Script
Create `scripts/deploy.js`:
```javascript
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying CryptoNomads contract...");

  // Self Protocol Identity Verification Hub V2 address on Celo Sepolia
  const IDENTITY_HUB_V2_ADDRESS = "0x..." // Get this from Self Protocol docs
  
  // Verification scope (unique identifier for your app)
  const SCOPE = 12345; // Replace with your unique scope
  
  // Verification configuration
  const verificationConfig = {
    minimumAge: 18,
    nationality: true,
    gender: true,
    excludedCountries: ["US"], // Array of excluded country codes
    endpoint: "https://your-app.com/verification",
    appName: "CryptoNomads Verification"
  };

  // Get the contract factory
  const CryptoNomads = await ethers.getContractFactory("CryptoNomads");
  
  // Deploy the contract
  const cryptoNomads = await CryptoNomads.deploy(
    IDENTITY_HUB_V2_ADDRESS,
    SCOPE,
    verificationConfig
  );

  await cryptoNomads.waitForDeployment();
  
  const contractAddress = await cryptoNomads.getAddress();
  console.log("✅ CryptoNomads deployed to:", contractAddress);
  
  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const configId = await cryptoNomads.verificationConfigId();
  console.log("📋 Verification Config ID:", configId);
  
  console.log("\n📝 Update your environment variables:");
  console.log(`NEXT_PUBLIC_CRYPTONOMADS_CONTRACT=${contractAddress}`);
  console.log(`NEXT_PUBLIC_RPC_URL=https://alfajores-forno.celo-testnet.org`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

### 4. Deploy Contract
```bash
npx hardhat run scripts/deploy.js --network celoSepolia
```

### 5. Update Environment Variables
Add to your NextJS `.env.local`:
```env
NEXT_PUBLIC_CRYPTONOMADS_CONTRACT=YOUR_DEPLOYED_CONTRACT_ADDRESS
NEXT_PUBLIC_RPC_URL=https://alfajores-forno.celo-testnet.org
```

## Usage in NextJS

### Install ethers.js
```bash
npm install ethers
```

### Reading Contract Data
```typescript
import { ethers } from 'ethers';

const readVerificationData = async (discordId: string) => {
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CRYPTONOMADS_CONTRACT!,
    [
      "function getVerificationDataByDiscordId(string memory discordId) external view returns (string memory gender, string memory nationality, bool isAdult, uint256 ageThreshold, address walletAddress, bool isVerified)"
    ],
    provider
  );
  
  const result = await contract.getVerificationDataByDiscordId(discordId);
  
  return {
    gender: result[0],           // "male" or "female"
    nationality: result[1],      // "IND", "USA", "GBR", etc.
    isAdult: result[2],         // true if age >= 18
    ageThreshold: Number(result[3]), // 18, 21, etc.
    walletAddress: result[4],    // Privy wallet address
    isVerified: result[5]        // true if verified
  };
};
```

## Flow Summary

1. **Discord Bot** creates Privy wallet, generates UUID, saves to MongoDB
2. **User** visits NextJS page with UUID
3. **Self Protocol** verification completes → calls `customVerificationHook()`
4. **Contract** converts `userData` (bytes) → Discord ID (string), processes `olderThan` (uint256) → `isAdult` (bool)
5. **NextJS** reads verification data from contract using `getVerificationDataByDiscordId()`
6. **API Route** updates MongoDB with on-chain verified data

## Testing

Use the provided `test-contract-read.js` script:
```bash
node test-contract-read.js
```

## Contract ABI for Frontend
```json
[
  "function getVerificationDataByDiscordId(string memory discordId) external view returns (string memory gender, string memory nationality, bool isAdult, uint256 ageThreshold, address walletAddress, bool isVerified)",
  "function isDiscordIdVerified(string memory discordId) external view returns (bool isVerified)",
  "function getDiscordIdByWallet(address walletAddress) external view returns (string memory discordId)"
]
```

## Data Processing Logic

### Discord ID Conversion
```solidity
// userData is bytes containing Discord ID
string memory discordId = string(userData);  // "123456789012345678"
```

### Age Logic
```solidity
// output.olderThan is uint256 (like 18, 21, etc.)
bool isAdult = output.olderThan >= 18;  // Convert to boolean
```

### Expected Data Examples
```javascript
// What you'll get from the contract:
{
  gender: "male",               // or "female"
  nationality: "IND",           // Country code
  isAdult: true,               // Calculated from olderThan >= 18
  ageThreshold: 18,            // The actual threshold
  walletAddress: "0x1234...",  // Privy wallet
  isVerified: true
}
```

## Notes
- The contract maps **Discord ID** (string) → Verification Data
- `userIdentifier` from Self Protocol = Privy wallet address  
- `userData` from Self Protocol = Discord ID (passed as userDefinedData) as bytes
- `olderThan` is uint256, we convert to boolean for easier use
- Nationality will be 3-letter country codes like "IND", "USA", "GBR"
- All verification data is stored permanently on-chain
- Gas costs are minimal for view functions (reading data)
