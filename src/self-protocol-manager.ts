import { privyWalletManager } from './privy-wallet-manager.js';
import { serverConfigManager } from './server-config-manager.js';
import { databaseManager } from './database-manager.js';
import { Client } from 'discord.js';

export interface SelfVerificationOutput {
  attestationId: string;
  userIdentifier: string;
  nullifier: string;
  forbiddenCountriesListPacked: number[];
  issuingState: string;
  name: string[];
  idNumber: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  expiryDate: string;
  olderThan: number;
  ofac: boolean[];
}

export interface VerificationSession {
  discordUserId: string;
  guildId: string;
  walletAddress: string;
  username: string;
  verifyUuid: string; // UUID for NextJS URL (localhost:3001/{verifyUuid})
  createdAt: Date;
  status: 'pending' | 'completed' | 'failed';
}

export class SelfProtocolManager {
  private verificationSessions: Map<string, VerificationSession> = new Map();
  private walletToDiscordMap: Map<string, string> = new Map();
  private discordClient: Client | null = null;

  constructor() {
    // Initialize wallet to discord mapping on startup
    this.loadWalletMappings();
  }

  setDiscordClient(client: Client) {
    this.discordClient = client;
  }

  /**
   * Load existing wallet to discord mappings from database
   */
  private async loadWalletMappings() {
    try {
      await serverConfigManager.initializeCollections();
      // Query all user verifications to build wallet mapping
      const collection = (serverConfigManager as any).userVerificationCollection;
      if (collection) {
        const users = await collection.find({ walletAddress: { $ne: null } }).toArray();
        users.forEach((user: any) => {
          if (user.walletAddress) {
            this.walletToDiscordMap.set(user.walletAddress.toLowerCase(), user.userId);
          }
        });
        console.log(`✅ Loaded ${this.walletToDiscordMap.size} wallet mappings`);
      }
    } catch (error) {
      console.error('Error loading wallet mappings:', error);
    }
  }

  /**
   * Start verification process - called from Discord command
   */
  async startVerification(discordUserId: string, guildId: string, username: string): Promise<{
    walletAddress: string;
    verificationUrl: string;
    verifyUuid: string;
  }> {
    try {
      // 1. Check if user already has a pending verification session
      await serverConfigManager.initializeCollections();
      const existingUser = await serverConfigManager.getUserVerification(discordUserId, guildId);
      
      if (existingUser && existingUser.verifyUuid && !existingUser.verified && existingUser.walletAddress) {
        // User has pending verification - reuse existing UUID
        console.log(`🔄 Reusing existing verification session for ${username} (${discordUserId}) with UUID: ${existingUser.verifyUuid}`);
        
        const verificationUrl = `${process.env.VERIFICATION_SITE_URL}/verification/${existingUser.verifyUuid}`;
        
        return {
          walletAddress: existingUser.walletAddress,
          verificationUrl,
          verifyUuid: existingUser.verifyUuid
        };
      }

      // 2. Create or get Privy wallet
      const wallet = await privyWalletManager.createWallet(discordUserId);
      if (!wallet) {
        throw new Error('Failed to create Privy wallet');
      }

      // 2.1. Save Discord ID → Privy Wallet ID mapping to database
      console.log(`💾 Saving wallet mapping: Discord ID ${discordUserId} → Privy Wallet ID ${wallet.id}`);
      const mappingSuccess = await databaseManager.createUserMapping({
        discordId: discordUserId,
        privyWalletId: wallet.id,
        walletAddress: wallet.address,
        chainType: wallet.chain_type || 'ethereum',
        createdAt: new Date()
      });
      
      if (!mappingSuccess) {
        console.warn(`⚠️ Failed to save wallet mapping for ${username} (${discordUserId})`);
      } else {
        console.log(`✅ Wallet mapping saved for ${username}: ${wallet.address}`);
      }

      // 3. Generate NEW UUID for verification URL  
      const verifyUuid = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 4. Create verification session
      const session: VerificationSession = {
        discordUserId,
        guildId,
        walletAddress: wallet.address,
        username,
        verifyUuid,
        createdAt: new Date(),
        status: 'pending'
      };

      // 5. Store session and mapping
      this.verificationSessions.set(verifyUuid, session);
      this.walletToDiscordMap.set(wallet.address.toLowerCase(), discordUserId);

      // 6. Update database with wallet address and UUID
      await serverConfigManager.createUserVerification(discordUserId, guildId, username, wallet.address, verifyUuid);
    
      // 6. Generate verification URL with UUID
      const verificationUrl = `${process.env.VERIFICATION_SITE_URL}/verification/${verifyUuid}`;

      console.log(`✅ Started verification for ${username} (${discordUserId}) with wallet ${wallet.address}, UUID: ${verifyUuid}`);

      return {
        walletAddress: wallet.address,
        verificationUrl,
        verifyUuid
      };

    } catch (error) {
      console.error('Error starting verification:', error);
      throw error;
    }
  }

  /**
   * Handle verification completion from smart contract
   * This is called when the customVerificationHook is triggered
   */
  async handleVerificationComplete(
    walletAddress: string,
    output: SelfVerificationOutput,
    txHash: string
  ): Promise<void> {
    try {
      console.log(`🔍 Processing verification completion for wallet: ${walletAddress}`);
      
      // 1. Find Discord user from wallet address
      const discordUserId = this.walletToDiscordMap.get(walletAddress.toLowerCase());
      if (!discordUserId) {
        console.error(`❌ No Discord user found for wallet: ${walletAddress}`);
        return;
      }

      // 2. Find active session
      const session = Array.from(this.verificationSessions.values())
        .find(s => s.discordUserId === discordUserId && s.status === 'pending');
      
      if (!session) {
        console.error(`❌ No active session found for Discord user: ${discordUserId}`);
        return;
      }

      // 3. Extract data from verification output
      const country = this.mapCountryCode(output.nationality || output.issuingState);
      const gender = output.gender.toLowerCase() === 'male' ? 'male' : 'female';
      const isAdult = output.olderThan >= 18;
      const ensName = `${session.username.toLowerCase()}.0xcryptonomads.eth`;

      console.log(`📋 Verification data - Country: ${country}, Gender: ${gender}, Adult: ${isAdult}`);

      // 4. Update database with verification data
      await serverConfigManager.updateUserOnChainVerification(
        discordUserId,
        session.guildId,
        {
          country,
          gender,
          isAdult,
          ensName,
          txHash,
          proof: output
        }
      );

      // 5. Update Discord roles and permissions
      await this.updateDiscordRoles(discordUserId, session.guildId, country, gender, isAdult);

      // 6. Mark session as completed
      session.status = 'completed';

      console.log(`✅ Verification completed for ${session.username}: ${country}, ${gender}, ENS: ${ensName}`);

    } catch (error) {
      console.error('Error handling verification completion:', error);
    }
  }

  /**
   * Update Discord roles based on verification data
   */
  private async updateDiscordRoles(
    discordUserId: string, 
    guildId: string, 
    country: string, 
    gender: 'male' | 'female',
    isAdult: boolean
  ): Promise<void> {
    try {
      if (!this.discordClient) {
        console.error('Discord client not set');
        return;
      }

      const guild = await this.discordClient.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordUserId);

      // Create or find roles
      const rolesToAdd = [];

      // Country role
      const countryRoleName = `🌍 ${country}`;
      let countryRole = guild.roles.cache.find(role => role.name === countryRoleName);
      if (!countryRole) {
        countryRole = await guild.roles.create({
          name: countryRoleName,
          color: this.getCountryColor(country),
          reason: 'CryptoNomads country verification'
        });
      }
      rolesToAdd.push(countryRole);

      // Gender role
      const genderRoleName = gender === 'male' ? '♂️ Male' : '♀️ Female';
      let genderRole = guild.roles.cache.find(role => role.name === genderRoleName);
      if (!genderRole) {
        genderRole = await guild.roles.create({
          name: genderRoleName,
          color: gender === 'male' ? 0x4A90E2 : 0xE24A90,
          reason: 'CryptoNomads gender verification'
        });
      }
      rolesToAdd.push(genderRole);

      // Verified role (use the one created during bot setup)
      let verifiedRole = guild.roles.cache.find(role => role.name === 'Verified');
      if (!verifiedRole) {
        verifiedRole = await guild.roles.create({
          name: 'Verified',
          color: 0x00FF00,
          reason: 'CryptoNomads verification'
        });
      }
      rolesToAdd.push(verifiedRole);

      // Remove "Unverified" role if they have it
      const unverifiedRole = guild.roles.cache.find(role => role.name === 'Unverified');
      if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
        await member.roles.remove(unverifiedRole);
        console.log(`🔴 Removed Unverified role from ${member.user.username}`);
      }

      // Adult role (if applicable)
      if (isAdult) {
        let adultRole = guild.roles.cache.find(role => role.name === '🔞 Adult');
        if (!adultRole) {
          adultRole = await guild.roles.create({
            name: '🔞 Adult',
            color: 0xFF6B35,
            reason: 'CryptoNomads age verification'
          });
        }
        rolesToAdd.push(adultRole);
      }

      // Add all roles to member
      await member.roles.add(rolesToAdd);

      console.log(`✅ Added roles to ${member.user.username}: ${rolesToAdd.map(r => r.name).join(', ')}`);

      // Send welcome message to user
      try {
        await member.send({
          content: `🎉 **Verification Complete!**\n\n` +
                  `✅ You've been verified as **${country}** ${gender === 'male' ? '♂️' : '♀️'}\n` +
                  `🏷️ ENS Name: **${member.user.username.toLowerCase()}.0xcryptonomads.eth**\n` +
                  `🎭 Roles Added: ${rolesToAdd.map(r => r.name).join(', ')}\n\n` +
                  `You can now access country-specific channels in the server!`
        });
      } catch (error) {
        console.log('Could not send DM to user:', error.message);
      }

    } catch (error) {
      console.error('Error updating Discord roles:', error);
    }
  }

  /**
   * Map country codes to readable names
   */
  private mapCountryCode(countryCode: string): string {
    const countryMap: { [key: string]: string } = {
      'IN': 'India',
      'US': 'USA',
      'CN': 'China',
      'JP': 'Japan',
      'DE': 'Germany',
      'FR': 'France',
      'BR': 'Brazil',
      'RU': 'Russia',
      'KR': 'South Korea',
      'GB': 'United Kingdom',
      'UK': 'United Kingdom'
    };

    // Try direct lookup first
    if (countryMap[countryCode.toUpperCase()]) {
      return countryMap[countryCode.toUpperCase()];
    }

    // Try by name (capitalize first letter)
    const formatted = countryCode.charAt(0).toUpperCase() + countryCode.slice(1).toLowerCase();
    return formatted;
  }

  /**
   * Get color for country role
   */
  private getCountryColor(country: string): number {
    const colorMap: { [key: string]: number } = {
      'India': 0xFF9933,
      'USA': 0x0052CC,
      'China': 0xFF0000,
      'Japan': 0xFF0000,
      'Germany': 0x000000,
      'France': 0x0055A4,
      'Brazil': 0x009739,
      'Russia': 0x0039A6,
      'South Korea': 0x003478,
      'United Kingdom': 0x012169
    };

    return colorMap[country] || 0x7289DA;
  }

  /**
   * Get user data by verifyUuid (for NextJS site)
   */
  async getUserByUuid(verifyUuid: string): Promise<VerificationSession | null> {
    const session = this.verificationSessions.get(verifyUuid);
    return session || null;
  }

  /**
   * Get user verification status by wallet address
   */
  async getUserByWallet(walletAddress: string): Promise<VerificationSession | null> {
    const discordUserId = this.walletToDiscordMap.get(walletAddress.toLowerCase());
    if (!discordUserId) return null;

    return Array.from(this.verificationSessions.values())
      .find(s => s.discordUserId === discordUserId) || null;
  }
}

export const selfProtocolManager = new SelfProtocolManager();
