import { Guild, PermissionFlagsBits, ChannelType } from 'discord.js';
import { serverConfigManager, ChannelConfig } from './server-config-manager.js';

export class ChannelPermissionManager {
  
  /**
   * Set up Discord channel permissions based on verification configuration
   */
  static async setupChannelPermissions(guild: Guild, channels: ChannelConfig[]) {
    try {
      // Check if bot has required permissions
      if (!await ChannelPermissionManager.hasRequiredPermissions(guild)) {
        console.warn('⚠️ Bot lacks permissions to manage roles/channels. Manual setup required.');
        return;
      }

      // Create verification roles if they don't exist
      const verifiedRole = await ChannelPermissionManager.ensureVerifiedRole(guild);
      const unverifiedRole = await ChannelPermissionManager.ensureUnverifiedRole(guild);

      // Create country-specific roles
      const countries = ['USA', 'India', 'China', 'Canada', 'United Kingdom'];
      const countryRoles = new Map();
      
      for (const country of countries) {
        const role = await ChannelPermissionManager.ensureCountryRole(guild, country);
        countryRoles.set(country, role);
      }

      // Configure each channel's permissions
      for (const channelConfig of channels) {
        const channel = guild.channels.cache.get(channelConfig.channelId);
        if (!channel || channel.type !== ChannelType.GuildText) continue;

        // Clear existing permission overwrites for our roles
        await channel.permissionOverwrites.delete(verifiedRole.id).catch(() => {});
        await channel.permissionOverwrites.delete(unverifiedRole.id).catch(() => {});
        
        for (const [, role] of countryRoles) {
          await channel.permissionOverwrites.delete(role.id).catch(() => {});
        }

        if (channelConfig.restrictionType === 'NONE') {
          // No restrictions - everyone can access
          continue;
          
        } else if (channelConfig.restrictionType === 'VERIFIED_ONLY') {
          // Only verified users (any country)
          await channel.permissionOverwrites.create(unverifiedRole, {
            ViewChannel: false,
            SendMessages: false
          });
          
          await channel.permissionOverwrites.create(verifiedRole, {
            ViewChannel: true,
            SendMessages: true
          });
          
        } else if (channelConfig.restrictionType === 'COUNTRY_SPECIFIC') {
          // Only specific countries
          await channel.permissionOverwrites.create(guild.roles.everyone, {
            ViewChannel: false,
            SendMessages: false
          });
          
          // Allow specific country roles
          for (const country of channelConfig.allowedCountries) {
            const countryRole = countryRoles.get(country);
            if (countryRole) {
              await channel.permissionOverwrites.create(countryRole, {
                ViewChannel: true,
                SendMessages: true
              });
            }
          }
        }
      }

      console.log(`✅ Channel permissions configured for ${guild.name}`);
      return { verifiedRole, unverifiedRole, countryRoles };

    } catch (error) {
      console.error('Error setting up channel permissions:', error);
      throw error;
    }
  }

  /**
   * Assign roles to a user based on their verification status
   */
  static async assignUserRoles(guild: Guild, userId: string, country: string) {
    try {
      const member = await guild.members.fetch(userId);
      if (!member) return;

      // Get or create roles
      const verifiedRole = await ChannelPermissionManager.ensureVerifiedRole(guild);
      const unverifiedRole = await ChannelPermissionManager.ensureUnverifiedRole(guild);
      const countryRole = await ChannelPermissionManager.ensureCountryRole(guild, country);

      // Remove unverified role, add verified role and country role
      await member.roles.remove(unverifiedRole).catch(() => {});
      await member.roles.add([verifiedRole, countryRole]).catch(() => {});

      console.log(`✅ Assigned roles to ${member.user.username}: Verified + ${country}`);

    } catch (error) {
      console.error('Error assigning user roles:', error);
    }
  }

  /**
   * Assign unverified role to new members
   */
  static async assignUnverifiedRole(guild: Guild, userId: string) {
    try {
      const member = await guild.members.fetch(userId);
      if (!member) return;

      const unverifiedRole = await ChannelPermissionManager.ensureUnverifiedRole(guild);
      await member.roles.add(unverifiedRole).catch(() => {});

      console.log(`✅ Assigned unverified role to ${member.user.username}`);

    } catch (error) {
      console.error('Error assigning unverified role:', error);
    }
  }

  /**
   * Check if bot has required permissions
   */
  private static async hasRequiredPermissions(guild: Guild): Promise<boolean> {
    try {
      const botMember = guild.members.me;
      if (!botMember) return false;

      const requiredPermissions = [
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels
      ];

      for (const permission of requiredPermissions) {
        if (!botMember.permissions.has(permission)) {
          console.warn(`⚠️ Bot missing permission: ${permission.toString()}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking bot permissions:', error);
      return false;
    }
  }

  private static async ensureVerifiedRole(guild: Guild) {
    let role = guild.roles.cache.find(r => r.name === '✅ Verified');
    if (!role) {
      role = await guild.roles.create({
        name: '✅ Verified',
        color: 0x00FF00,
        reason: 'Verification system - verified users'
      });
    }
    return role;
  }

  private static async ensureUnverifiedRole(guild: Guild) {
    let role = guild.roles.cache.find(r => r.name === '⏳ Unverified');
    if (!role) {
      role = await guild.roles.create({
        name: '⏳ Unverified',
        color: 0xFF9900,
        reason: 'Verification system - unverified users'
      });
    }
    return role;
  }

  private static async ensureCountryRole(guild: Guild, country: string) {
    const flags: { [key: string]: string } = {
      'USA': '🇺🇸',
      'India': '🇮🇳', 
      'China': '🇨🇳',
      'Canada': '🇨🇦',
      'United Kingdom': '🇬🇧'
    };
    
    const roleName = `${flags[country] || '🌍'} ${country}`;
    let role = guild.roles.cache.find(r => r.name === roleName);
    
    if (!role) {
      role = await guild.roles.create({
        name: roleName,
        color: 0x0099FF,
        reason: `Verification system - ${country} users`
      });
    }
    return role;
  }
}
