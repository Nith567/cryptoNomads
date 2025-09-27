# 🌍 CryptoNomads - Universal Identity & Social Layer

> **Self Protocol × ENS Subdomains**: Verify once, access everywhere. Your Discord identity becomes your universal crypto identity.

A revolutionary Discord bot that transforms social verification into seamless Web3 identity using Self Protocol verification and ENS subdomain minting.

---

## 🚀 **What We Built**

CryptoNomads eliminates the friction between social identity and Web3 by creating a universal naming system that bridges Discord communities with on-chain identity.

### 🔐 **Core Flow**
1. **Verify with Self Protocol** → Country, Gender, Age verification
2. **Auto-mint ENS Subdomain** → `username.0xcryptonomads.eth` 
3. **Smart Role Assignment** → Country/Gender/Age roles automatically assigned
4. **Channel Isolation** → Only see your country's channel, complete privacy
5. **Universal Payments** → Send CELO with Discord usernames, no wallet addresses needed

---

## 🎯 **Hackathon Tracks**

### 🏆 **Self Protocol Track**
- **On-chain Verification**: Seamless integration with Self Protocol for country, gender, and age verification
- **Automated Role Management**: Discord roles automatically assigned based on verified attributes
- **Privacy-First**: Channel access restricted by verification status and country
- **Real-time Updates**: Verification status synced between on-chain data and Discord permissions

### 🏆 **ENS Track** 
- **Automatic Subdomain Minting**: `discordname.0xcryptonomads.eth` minted instantly upon verification
- **Universal Identity**: Your Discord username becomes your Web3 identity
- **Simplified Payments**: Send crypto using familiar Discord usernames instead of wallet addresses
- **Social Layer Integration**: ENS names bridge social and financial interactions seamlessly

---

## ✨ **Key Features**

### 🌍 **Country-Based Communities**
- **Strict Channel Isolation**: Indians only see `india-channel`, Germans only see `german-channel`
- **9 Supported Countries**: India, USA, China, Japan, Germany, France, Portugal, Russia, Korea
- **Cultural Spaces**: Native language discussions and region-specific content

### 🤖 **Smart Verification System**
- **One-Click Verification**: `/verify` command starts the entire flow
- **Multi-Role Assignment**: Country 🇮🇳, Gender ♂️, Age 🔞, ENS 🏷️ roles automatically assigned  
- **Real-time Sync**: On-chain verification instantly reflects in Discord permissions

### 💸 **Frictionless Payments**
- **Human-Readable Transfers**: `/send nithin_3 1.5` instead of complex wallet addresses
- **ENS Resolution**: Automatically resolves `nithin_3.0xcryptonomads.eth` to wallet address
- **Celo Integration**: Fast, cheap transactions on Celo network
- **Transaction Tracking**: Direct links to Celo Blockscout explorer

### 🛡️ **Privacy & Security**
- **Unverified Users**: Cannot see any country channels
- **Verified Isolation**: Users only access their verified country's community
- **Admin Controls**: Channel setup and permission reset commands
- **Secure Verification**: Self Protocol ensures tamper-proof identity verification

---

## 🔧 **Technical Architecture**

```
Discord User → Self Protocol Verification → Smart Contract → ENS Minting
     ↓                    ↓                      ↓            ↓
Role Assignment → Channel Access → Payment System → Universal Identity
```

### **Stack**
- **Discord.js v14**: Bot framework with slash commands
- **Self Protocol**: On-chain identity verification
- **ENS Subdomains**: Universal naming system
- **Celo Network**: Payment infrastructure  
- **MongoDB**: User verification tracking
- **Privy**: Wallet management & transactions
- **TypeScript**: Type-safe development

---

## 🎮 **Available Commands**

| Command | Description | Access |
|---------|-------------|---------|
| `/verify` | Start Self Protocol verification | All users |
| `/check-status` | View your verification details | Verified users |
| `/details @user` | Check another user's verification | All users |
| `/send @user amount` | Send CELO by Discord username | Verified users |
| `/setup-channels` | Create country-specific channels | Admins only |
| `/reset-permissions` | Reset all channel permissions | Admins only |
| `/emergency-lockdown` | 🚨 Lock down all channels and re-grant access | Admins only |

---

## 🌟 **The Social Layer Revolution**

### **Before CryptoNomads**
❌ Complex wallet addresses: `0x742d35Cc6634C0532925a3b8D...`  
❌ Fragmented identity across platforms  
❌ Manual verification processes  
❌ No social context in Web3 transactions  

### **After CryptoNomads**  
✅ Simple usernames: `nithin_3.0xcryptonomads.eth`  
✅ Universal identity across Discord & Web3  
✅ Automated verification & role assignment  
✅ Social payments with context & community  

---

## 🏃‍♂️ **Quick Start**

1. **Join Discord** → Get invited to CryptoNomads server
2. **Run `/verify`** → Complete Self Protocol verification  
3. **Get Your ENS** → `username.0xcryptonomads.eth` auto-minted
4. **Access Your Community** → Join your country's exclusive channel
5. **Send Payments** → `/send friend_username 5` - that's it!

---

## 🎯 **Impact & Vision**

**Eliminating Web3 Friction**: CryptoNomads makes crypto as easy as Discord. No more copying wallet addresses, no more losing track of who you're sending money to, no more fragmented identity across platforms.

**Universal Social Identity**: Your Discord username becomes your Web3 identity, bridging the gap between social interaction and financial transactions.

**Privacy-First Communities**: Verified, country-based channels create safe spaces for cultural exchange while maintaining user privacy through on-chain verification.

---

## 🏆 **Built for Hackathon Excellence**

- **Self Protocol Integration**: Seamless on-chain verification with automatic Discord role sync
- **ENS Innovation**: Creative use of subdomains for universal identity
- **User Experience**: Zero-friction onboarding from social to Web3
- **Technical Excellence**: Type-safe, scalable architecture with real-time updates
- **Social Impact**: Breaking down barriers between Web2 social and Web3 financial layers

---

*CryptoNomads: Where your social identity becomes your universal crypto identity.* 🌍✨


