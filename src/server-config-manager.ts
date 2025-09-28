import { Collection } from 'mongodb';
import { databaseManager } from './database-manager.js';

export interface ChannelConfig {
  channelId: string;
  name: string;
  restrictionType: 'NONE' | 'VERIFIED_ONLY' | 'COUNTRY_SPECIFIC';
  allowedCountries: string[];
}

export interface ServerConfig {
  guildId: string;
  serverName: string; 
  ownerId: string;
  ownerUsername: string;
  subdomainName: string; // e.g., "ishowspeed"
  setupComplete: boolean;
  channels: ChannelConfig[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserVerification {
  userId: string;
  guildId: string;
  username: string;
  verified: boolean;
  selectedCountry: string | null;
  walletAddress: string | null;
  verifyUuid: string | null; // UUID for verification URL
  allowedChannels: string[];
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // CryptoNomads specific fields
  onChainVerified: boolean;
  gender: 'male' | 'female' | null;
  isAdult: boolean | null; // 18+
  ensName: string | null; // discord-name.0xcryptonomads.eth
  selfProtocolTxHash: string | null;
  verificationProof: any | null; // Self Protocol verification proof
}

class ServerConfigManager {
  private serverConfigCollection: Collection<ServerConfig> | null = null;
  private userVerificationCollection: Collection<UserVerification> | null = null;
  private discordClient: any = null;

  setDiscordClient(client: any) {
    this.discordClient = client;
  }

  async initializeCollections() {
    try {
      await databaseManager.connect();
      // Access the database through the databaseManager's private property
      const db = (databaseManager as any).db;
      if (!db) {
        throw new Error('Database not connected');
      }
      
      this.serverConfigCollection = db.collection('server_configs') as Collection<ServerConfig>;
      this.userVerificationCollection = db.collection('user_verifications') as Collection<UserVerification>;
      
      // Create indexes for better performance
      if (this.serverConfigCollection) {
        await this.serverConfigCollection.createIndex({ guildId: 1 }, { unique: true });
      }
      if (this.userVerificationCollection) {
        await this.userVerificationCollection.createIndex({ userId: 1, guildId: 1 }, { unique: true });
      }
      
      console.log('✅ Server config collections initialized');
    } catch (error) {
      console.error('❌ Error initializing server config collections:', error);
    }
  }

  // Server Configuration Methods
  async createServerConfig(guildId: string, serverName: string, ownerId: string, ownerUsername: string): Promise<ServerConfig> {
    if (!this.serverConfigCollection) {
      throw new Error('Server config collection not initialized');
    }

    const subdomainName = serverName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const serverConfig: ServerConfig = {
      guildId,
      serverName,
      ownerId,
      ownerUsername,
      subdomainName,
      setupComplete: false,
      channels: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.serverConfigCollection.insertOne(serverConfig);
    console.log(`✅ Created server config for ${serverName} (${guildId})`);
    
    return serverConfig;
  }

  async getServerConfig(guildId: string): Promise<ServerConfig | null> {
    if (!this.serverConfigCollection) {
      throw new Error('Server config collection not initialized');
    }
    
    return await this.serverConfigCollection.findOne({ guildId });
  }

  async updateServerChannels(guildId: string, channels: ChannelConfig[]): Promise<void> {
    if (!this.serverConfigCollection) {
      throw new Error('Server config collection not initialized');
    }

    await this.serverConfigCollection.updateOne(
      { guildId },
      { 
        $set: { 
          channels,
          setupComplete: true,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated channel configuration for guild ${guildId}`);
  }

  // User Verification Methods
  async createUserVerification(userId: string, guildId: string, username: string, walletAddress?: string, verifyUuid?: string): Promise<UserVerification> {
    if (!this.userVerificationCollection) {
      throw new Error('User verification collection not initialized');
    }

    const userVerification: UserVerification = {
      userId,
      guildId,
      username,
      verified: false,
      selectedCountry: null,
      walletAddress: walletAddress || null,
      verifyUuid: verifyUuid || null,
      allowedChannels: [],
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      // CryptoNomads specific fields
      onChainVerified: false,
      gender: null,
      isAdult: null,
      ensName: null,
      selfProtocolTxHash: null,
      verificationProof: null
    };

    await this.userVerificationCollection.replaceOne(
      { userId, guildId },
      userVerification,
      { upsert: true }
    );
    
    console.log(`✅ Created user verification for ${username} (${userId})`);
    
    return userVerification;
  }

  async getUserVerification(userId: string, guildId: string): Promise<UserVerification | null> {
    if (!this.userVerificationCollection) {
      throw new Error('User verification collection not initialized');
    }
    
    return await this.userVerificationCollection.findOne({ userId, guildId });
  }

  async verifyUser(userId: string, guildId: string, selectedCountry: string): Promise<void> {
    if (!this.userVerificationCollection) {
      throw new Error('User verification collection not initialized');
    }

    // Get server config to determine allowed channels
    const serverConfig = await this.getServerConfig(guildId);
    if (!serverConfig) {
      throw new Error('Server configuration not found');
    }

    // Calculate allowed channels based on verification and country
    const allowedChannels: string[] = [];
    
    for (const channel of serverConfig.channels) {
      if (channel.restrictionType === 'NONE') {
        allowedChannels.push(channel.channelId);
      } else if (channel.restrictionType === 'VERIFIED_ONLY') {
        allowedChannels.push(channel.channelId); // User is now verified
      } else if (channel.restrictionType === 'COUNTRY_SPECIFIC') {
        if (channel.allowedCountries.includes(selectedCountry)) {
          allowedChannels.push(channel.channelId);
        }
      }
    }

    await this.userVerificationCollection.updateOne(
      { userId, guildId },
      { 
        $set: { 
          verified: true,
          selectedCountry,
          allowedChannels,
          verifiedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Verified user ${userId} for country ${selectedCountry}`);
  }

  async isUserVerified(userId: string, guildId: string): Promise<boolean> {
    const userVerification = await this.getUserVerification(userId, guildId);
    return userVerification?.verified || false;
  }

  async canUserAccessChannel(userId: string, guildId: string, channelId: string): Promise<boolean> {
    const userVerification = await this.getUserVerification(userId, guildId);
    if (!userVerification) {
      // Check if channel requires no restrictions
      const serverConfig = await this.getServerConfig(guildId);
      if (serverConfig) {
        const channel = serverConfig.channels.find(c => c.channelId === channelId);
        return channel?.restrictionType === 'NONE';
      }
      return false;
    }
    
    return userVerification.allowedChannels.includes(channelId);
  }

  // CryptoNomads predefined countries with channel mappings (Hackathon Demo - 3 channels only)
  getPredefinedCountries(): Array<{country: string, flag: string, channelName: string}> {
    return [
      { country: 'India', flag: '🇮🇳', channelName: 'india-channel' },
      { country: 'Japan', flag: '🇯🇵', channelName: 'japan-channel' },
      { country: 'Thailand', flag: '��', channelName: 'thailand-channel' }
    ];
  }

  // Helper method to get available countries (backward compatibility)
  getAvailableCountries(): string[] {
    return this.getPredefinedCountries().map(c => c.country);
  }

  // Helper method to get country flag emoji
  getCountryFlag(country: string): string {
    const countryData = this.getPredefinedCountries().find(c => c.country === country);
    return countryData?.flag || '🌍';
  }

  // Get channel name for country
  getChannelNameForCountry(country: string): string {
    const countryData = this.getPredefinedCountries().find(c => c.country === country);
    return countryData?.channelName || 'general';
  }

  // Update user with on-chain verification data
  async updateUserOnChainVerification(
    userId: string, 
    guildId: string, 
    verificationData: {
      country: string;
      gender: 'male' | 'female';
      isAdult: boolean;
      ensName: string;
      txHash: string;
      proof: any;
    }
  ): Promise<void> {
    if (!this.userVerificationCollection) {
      throw new Error('User verification collection not initialized');
    }

    // Get server config to determine allowed channels
    const serverConfig = await this.getServerConfig(guildId);
    if (!serverConfig) {
      throw new Error('Server configuration not found');
    }

    // Calculate allowed channels based on country
    const allowedChannels: string[] = [];
    const channelNameForCountry = this.getChannelNameForCountry(verificationData.country);
    
    // Find channel by name pattern
    for (const channel of serverConfig.channels) {
      if (channel.name.includes(channelNameForCountry) || 
          channel.restrictionType === 'NONE' ||
          (channel.restrictionType === 'COUNTRY_SPECIFIC' && 
           channel.allowedCountries.includes(verificationData.country))) {
        allowedChannels.push(channel.channelId);
      }
    }

    await this.userVerificationCollection.updateOne(
      { userId, guildId },
      { 
        $set: { 
          verified: true,
          onChainVerified: true,
          selectedCountry: verificationData.country,
          gender: verificationData.gender,
          isAdult: verificationData.isAdult,
          ensName: verificationData.ensName,
          selfProtocolTxHash: verificationData.txHash,
          verificationProof: verificationData.proof,
          allowedChannels,
          verifiedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated on-chain verification for user ${userId}: ${verificationData.country}, ENS: ${verificationData.ensName}`);
  }

  // Generic update method for user verification data
  async updateUserVerification(userId: string, guildId: string, updateData: Partial<UserVerification>): Promise<void> {
    if (!this.userVerificationCollection) {
      throw new Error('User verification collection not initialized');
    }

    await this.userVerificationCollection.updateOne(
      { userId, guildId },
      { $set: updateData }
    );

    console.log(`✅ Updated user verification for ${userId}:`, updateData);
  }

  // Update Discord channel permissions based on country verification
  async updateChannelPermissions(userId: string, guildId: string, country: string): Promise<void> {
    if (!this.discordClient) {
      console.error('❌ Discord client not set');
      return;
    }

    try {
      const guild = await this.discordClient.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      
      console.log(`🔄 Updating channel permissions for ${member.user.username} from ${country}`);

      // Create and assign all verification roles
      await this.createAndAssignVerificationRoles(guild, member, country);

      // Set channel permissions for both country-specific and cross-channels
      await this.setAllChannelPermissions(guild, member, country);

    } catch (error) {
      console.error(`❌ Error updating channel permissions for ${userId}:`, error);
    }
  }

  // Create and assign all verification roles
  async createAndAssignVerificationRoles(guild: any, member: any, country: string): Promise<void> {
    try {
      const userData = await this.getUserVerification(member.id, guild.id);
      if (!userData) return;

      // 1. Country Role
      const countryRoleName = `🌍 ${this.getCountryName(country)}`;
      let countryRole = guild.roles.cache.find((role: any) => role.name === countryRoleName);
      if (!countryRole) {
        countryRole = await guild.roles.create({
          name: countryRoleName,
          color: this.getCountryColor(country),
          reason: `Country role for ${country} verification`
        });
        console.log(`✅ Created role: ${countryRoleName}`);
      }
      await member.roles.add(countryRole);
      console.log(`✅ Added ${member.user.username} to role: ${countryRoleName}`);

      // 2. Gender Role
      if (userData.gender) {
        const gender = userData.gender as string;
        const genderRoleName = gender === 'M' || gender === 'male' ? '♂️ Male' : 
                              gender === 'F' || gender === 'female' ? '♀️ Female' : '⚧️ Transgender';
        let genderRole = guild.roles.cache.find((role: any) => role.name === genderRoleName);
        if (!genderRole) {
          const genderColor = gender === 'M' || gender === 'male' ? 0x4A90E2 : 
                             gender === 'F' || gender === 'female' ? 0xE24A90 : 0x9A4AE2;
          genderRole = await guild.roles.create({
            name: genderRoleName,
            color: genderColor,
            reason: `Gender role for verification`
          });
          console.log(`✅ Created role: ${genderRoleName}`);
        }
        await member.roles.add(genderRole);
        console.log(`✅ Added ${member.user.username} to role: ${genderRoleName}`);
      }

      // 3. Age Role
      if (userData.isAdult !== null) {
        const ageRoleName = userData.isAdult ? '🔞 Adult (18+)' : '👶 Minor';
        let ageRole = guild.roles.cache.find((role: any) => role.name === ageRoleName);
        if (!ageRole) {
          const ageColor = userData.isAdult ? 0xFF6B35 : 0x35FF6B;
          ageRole = await guild.roles.create({
            name: ageRoleName,
            color: ageColor,
            reason: `Age verification role`
          });
          console.log(`✅ Created role: ${ageRoleName}`);
        }
        await member.roles.add(ageRole);
        console.log(`✅ Added ${member.user.username} to role: ${ageRoleName}`);
      }

      // 4. ENS Name Role (actual ENS name instead of generic "ENS Verified")
      if (userData.ensName) {
        const ensRoleName = userData.ensName; // Use actual ENS name like "username.0xcryptonomads.eth"
        let ensRole = guild.roles.cache.find((role: any) => role.name === ensRoleName);
        if (!ensRole) {
          ensRole = await guild.roles.create({
            name: ensRoleName,
            color: 0x7C3AED,
            reason: `ENS name role for ${userData.ensName}`
          });
          console.log(`✅ Created ENS role: ${ensRoleName}`);
        }
        await member.roles.add(ensRole);
        console.log(`✅ Added ${member.user.username} to ENS role: ${ensRoleName}`);
      }

    } catch (error) {
      console.error(`❌ Error creating verification roles:`, error);
    }
  }

  // Set permissions for both country-specific and cross-channels
  async setAllChannelPermissions(guild: any, member: any, country: string): Promise<void> {
    try {
      // Country-specific channels - only accessible to users from that country
      const countryToChannelMap: { [key: string]: string } = {
        'IND': 'india-channel',
        'JPN': 'japan-channel', 
        'CHN': 'china-channel',
        'THA': 'thailand-channel'
      };

      // Cross-channels - accessible to ALL verified users regardless of country
      const crossChannels = [
        'cross-thailand',
        'cross-china', 
        'cross-japan',
        'cross-india',
        'cross-general'
      ];

      const userCountryChannel = countryToChannelMap[country];
      const allCountryChannels = Object.values(countryToChannelMap);

      // 1. Handle country-specific channels
      for (const channelName of allCountryChannels) {
        const channel = guild.channels.cache.find((ch: any) => ch.name === channelName);
        
        if (channel && channel.isTextBased()) {
          if (channelName === userCountryChannel) {
            // User's country channel - FULL ACCESS (can see and chat)
            await channel.permissionOverwrites.create(member, {
              SendMessages: true,
              ViewChannel: true,
              ReadMessageHistory: true,
              AddReactions: true,
              UseExternalEmojis: true
            });
            console.log(`✅ Granted ${member.user.username} FULL ACCESS to #${channelName} (${country})`);
          } else {
            // Other country channels - COMPLETELY HIDDEN (no view, no chat)
            await channel.permissionOverwrites.create(member, {
              SendMessages: false,
              ViewChannel: false,
              ReadMessageHistory: false,
              AddReactions: false,
              UseExternalEmojis: false
            });
            console.log(`✅ BLOCKED ${member.user.username} from seeing #${channelName} (not their country)`);
          }
        }
      }

      // 2. Handle cross-channels - ALL verified users get access
      for (const channelName of crossChannels) {
        const channel = guild.channels.cache.find((ch: any) => ch.name === channelName);
        
        if (channel && channel.isTextBased()) {
          // Grant FULL ACCESS to ALL cross-channels for verified users
          await channel.permissionOverwrites.create(member, {
            SendMessages: true,
            ViewChannel: true,
            ReadMessageHistory: true,
            AddReactions: true,
            UseExternalEmojis: true
          });
          console.log(`✅ Granted ${member.user.username} access to cross-channel #${channelName}`);
        }
      }

    } catch (error) {
      console.error(`❌ Error setting channel permissions:`, error);
    }
  }

  // Set up default restrictive permissions for all country channels
  async setupCountryChannelDefaults(guild: any): Promise<void> {
    try {
      const allCountryChannels = [
        'india-channel', 'english-channel', 'chinese-channel', 'japanese-channel',
        'german-channel', 'french-channel', 'portuguese-channel', 'russian-channel', 'korean-channel'
      ];

      for (const channelName of allCountryChannels) {
        const channel = guild.channels.cache.find((ch: any) => ch.name === channelName);
        
        if (channel && channel.isTextBased()) {
          // Set default permissions: @everyone CANNOT see or access country channels
          await channel.permissionOverwrites.create(guild.roles.everyone, {
            SendMessages: false,
            ViewChannel: false,
            ReadMessageHistory: false,
            AddReactions: false,
            UseExternalEmojis: false
          });
          console.log(`✅ Set restrictive defaults for #${channelName} - only verified country users can see`);
        }
      }
    } catch (error) {
      console.error(`❌ Error setting up channel defaults:`, error);
    }
  }

  // Helper function to get country name from code
  getCountryName(countryCode: string): string {
    const countryNames: { [key: string]: string } = {
      'IND': 'India',
      'USA': 'United States', 
      'GBR': 'United Kingdom',
      'DEU': 'Germany',
      'FRA': 'France',
      'JPN': 'Japan',
      'KOR': 'South Korea',
      'CHN': 'China',
      'BRA': 'Brazil',
      'ESP': 'Spain',
      'ITA': 'Italy',
      'RUS': 'Russia',
      'CAN': 'Canada',
      'AUS': 'Australia'
    };
    return countryNames[countryCode] || countryCode;
  }

  // Helper function to get country-specific colors
  getCountryColor(countryCode: string): number {
    const countryColors: { [key: string]: number } = {
      'IND': 0xFF9933, // Saffron (Indian flag)
      'USA': 0x0052CC, // Blue 
      'GBR': 0x012169, // Union Jack blue
      'DEU': 0x000000, // German flag black
      'FRA': 0x0055A4, // French blue
      'JPN': 0xBC002D, // Japanese red
      'KOR': 0xCD2E3A, // Korean red
      'CHN': 0xDE2910, // Chinese red
      'BRA': 0x009739, // Brazilian green
      'ESP': 0xAA151B, // Spanish red
      'ITA': 0x009246, // Italian green
      'RUS': 0x0039A6, // Russian blue
      'CAN': 0xFF0000, // Canadian red
      'AUS': 0x00843D  // Australian green
    };
    return countryColors[countryCode] || 0x7289DA; // Default Discord blue
  }

  // Reset all users' channel permissions (admin function)
  async resetAllChannelPermissions(guildId: string): Promise<void> {
    if (!this.discordClient) {
      console.error('❌ Discord client not set');
      return;
    }

    try {
      const guild = await this.discordClient.guilds.fetch(guildId);
      const allCountryChannels = [
        'india-channel', 'japan-channel', 'thailand-channel'
      ];

      console.log('🔄 Resetting channel permissions for all users...');

      for (const channelName of allCountryChannels) {
        const channel = guild.channels.cache.find((ch: any) => ch.name === channelName);
        
        if (channel && channel.isTextBased()) {
          // Clear all user-specific permission overwrites
          const overwrites = channel.permissionOverwrites.cache.filter((overwrite: any) => overwrite.type === 1); // Type 1 = Member
          
          for (const [memberId, overwrite] of overwrites) {
            try {
              await overwrite.delete();
              console.log(`🧹 Cleared permissions for user ${memberId} in #${channelName}`);
            } catch (error) {
              console.error(`❌ Failed to clear permissions for ${memberId}:`, error);
            }
          }

          // Now re-apply permissions for verified users
          const allMembers = await guild.members.fetch();
          for (const [memberId, member] of allMembers) {
            const userVerification = await this.getUserVerification(memberId, guildId);
            
            if (userVerification && userVerification.verified && userVerification.selectedCountry) {
              await this.setAllChannelPermissions(guild, member, userVerification.selectedCountry);
            }
          }
        }
      }

      console.log('✅ Channel permissions reset complete');
      
    } catch (error) {
      console.error('❌ Error resetting channel permissions:', error);
    }
  }

  // Get user by ENS name
  async getUserByENSName(ensName: string): Promise<any> {
    try {
      if (!this.userVerificationCollection) {
        await this.initializeCollections();
      }

      const user = await this.userVerificationCollection!.findOne({ 
        ensName: ensName 
      });

      return user;
    } catch (error) {
      console.error('❌ Error getting user by ENS name:', error);
      return null;
    }
  }

  // Emergency lockdown - immediately hide all channels from everyone, then re-grant access only to verified users
  async emergencyChannelLockdown(guildId: string): Promise<void> {
    if (!this.discordClient) {
      console.error('❌ Discord client not set');
      return;
    }

    try {
      const guild = await this.discordClient.guilds.fetch(guildId);
      
      // Country-specific channels (gated by country)
      const allCountryChannels = [
        'india-channel', 'japan-channel', 'china-channel', 'thailand-channel'
      ];

      // Cross-channels (accessible to all verified users)
      const allCrossChannels = [
        'cross-thailand', 'cross-china', 'cross-japan', 'cross-india', 'cross-general'
      ];

      const allChannelsToLockdown = [...allCountryChannels, ...allCrossChannels];

      console.log('🚨 EMERGENCY LOCKDOWN: Hiding all channels from everyone...');

      // Step 1: Hide ALL channels from @everyone
      for (const channelName of allChannelsToLockdown) {
        const channel = guild.channels.cache.find((ch: any) => ch.name === channelName);
        
        if (channel && channel.isTextBased()) {
          // AGGRESSIVELY HIDE channel from @everyone - DENY ALL PERMISSIONS
          await channel.permissionOverwrites.create(guild.roles.everyone, {
            SendMessages: false,
            ViewChannel: false,
            ReadMessageHistory: false,
            AddReactions: false,
            UseExternalEmojis: false,
            AttachFiles: false,
            EmbedLinks: false,
            UseExternalStickers: false,
            MentionEveryone: false,
            ManageMessages: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            SendMessagesInThreads: false
          }, 'EMERGENCY LOCKDOWN: Deny all access to channels');
          
          // Clear all user-specific permission overwrites (start fresh)
          const overwrites = channel.permissionOverwrites.cache.filter((overwrite: any) => overwrite.type === 1); // Type 1 = Member
          for (const [memberId, overwrite] of overwrites) {
            try {
              await overwrite.delete();
              console.log(`🧹 Cleared permissions for user ${memberId} in #${channelName}`);
            } catch (error) {
              console.error(`❌ Failed to clear permissions for ${memberId}:`, error);
            }
          }
          
          console.log(`🔒 LOCKED DOWN #${channelName} - hidden from everyone`);
        }
      }

      // Step 2: Re-grant access ONLY to properly verified users
      const allMembers = await guild.members.fetch();
      for (const [memberId, member] of allMembers) {
        const userVerification = await this.getUserVerification(memberId, guildId);
        
        if (userVerification && userVerification.verified && userVerification.onChainVerified && userVerification.selectedCountry) {
          console.log(`✅ Re-granting access to verified user: ${member.user.username} (${userVerification.selectedCountry})`);
          await this.setAllChannelPermissions(guild, member, userVerification.selectedCountry);
        } else {
          console.log(`❌ Skipping unverified user: ${member.user.username}`);
        }
      }

      console.log('🔒 EMERGENCY LOCKDOWN COMPLETE: Only verified users can see channels (country-specific + cross-channels)');
      
    } catch (error) {
      console.error('❌ Error during emergency lockdown:', error);
    }
  }
}

export const serverConfigManager = new ServerConfigManager();
