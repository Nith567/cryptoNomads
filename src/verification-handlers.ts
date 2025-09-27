import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import { serverConfigManager, ChannelConfig } from './server-config-manager.js';
import { privyWalletManager } from './privy-wallet-manager.js';
import { ChannelPermissionManager } from './channel-permission-manager.js';

export async function handleVerificationInteractions(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  try {
    console.log(`🔄 Handling interaction: ${interaction.customId} by ${interaction.user.username}`);
    
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    }
  } catch (error) {
    console.error('Error handling verification interaction:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '❌ An error occurred. Please try again.', 
          ephemeral: true 
        });
      } else if (interaction.deferred) {
        await interaction.editReply('❌ An error occurred. Please try again.');
      } else {
        await interaction.followUp({ 
          content: '❌ An error occurred. Please try again.', 
          ephemeral: true 
        });
      }
    } catch (followUpError) {
      console.error('Error sending error message:', followUpError);
    }
  }
}

async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
  const { customId } = interaction;

  if (customId === 'select_channel_config') {
    await handleChannelConfigSelection(interaction);
  } else if (customId.startsWith('channel_restriction_')) {
    await handleRestrictionTypeSelection(interaction);
  } else if (customId.startsWith('country_selection_')) {
    await handleCountrySelection(interaction);
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction) {
  const { customId } = interaction;

  if (customId.startsWith('demo_verify_')) {
    await handleDemoVerification(interaction);
  // Remove the save_channel_config handler as it's not needed
  } else if (customId === 'add_more_channels') {
    await handleAddMoreChannels(interaction);
  } else if (customId === 'setup_complete') {
    await handleSetupComplete(interaction);
  }
}

async function handleChannelConfigSelection(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;

  const channelId = interaction.values[0];
  const channel = interaction.guild.channels.cache.get(channelId);
  
  if (!channel) {
    await interaction.reply({ content: '❌ Channel not found!', ephemeral: true });
    return;
  }

  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need administrator permissions to configure channels!', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`⚙️ Configure #${channel.name}`)
    .setDescription('Choose the verification requirement for this channel:')
    .addFields(
      { name: '🔓 No Restrictions', value: 'Anyone can access this channel', inline: false },
      { name: '✅ Verified Users Only', value: 'Only verified users (any country) can access', inline: false },
      { name: '🌍 Country-Specific', value: 'Only verified users from specific countries can access', inline: false }
    );

  const restrictionMenu = new StringSelectMenuBuilder()
    .setCustomId(`channel_restriction_${channelId}`)
    .setPlaceholder('Choose restriction type...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('🔓 No Restrictions')
        .setValue('NONE')
        .setDescription('Anyone can access this channel'),
      new StringSelectMenuOptionBuilder()
        .setLabel('✅ Verified Users Only')
        .setValue('VERIFIED_ONLY')
        .setDescription('Only verified users (any country)'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🌍 Country-Specific')
        .setValue('COUNTRY_SPECIFIC')
        .setDescription('Only specific countries')
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(restrictionMenu);

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleRestrictionTypeSelection(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;

  const channelId = interaction.customId.replace('channel_restriction_', '');
  const restrictionType = interaction.values[0] as 'NONE' | 'VERIFIED_ONLY' | 'COUNTRY_SPECIFIC';
  const channel = interaction.guild.channels.cache.get(channelId);

  if (!channel) {
    await interaction.reply({ content: '❌ Channel not found!', ephemeral: true });
    return;
  }

  if (restrictionType === 'COUNTRY_SPECIFIC') {
    // Show country selection
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`🌍 Country Selection for #${channel.name}`)
      .setDescription('Select which countries can access this channel:');

    const countries = serverConfigManager.getAvailableCountries();
    const countryOptions = countries.map((country: string) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${serverConfigManager.getCountryFlag(country)} ${country}`)
        .setValue(country)
        .setDescription(`Allow users from ${country}`)
    );

    const countryMenu = new StringSelectMenuBuilder()
      .setCustomId(`country_selection_${channelId}`)
      .setPlaceholder('Select countries (multiple allowed)...')
      .setMinValues(1)
      .setMaxValues(countries.length)
      .addOptions(countryOptions);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(countryMenu);

    await interaction.update({ embeds: [embed], components: [row] });
  } else {
    // Save configuration for NONE or VERIFIED_ONLY
    await saveChannelConfiguration(interaction, channelId, channel.name, restrictionType, []);
  }
}

async function handleCountrySelection(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;

  const channelId = interaction.customId.replace('country_selection_', '');
  const selectedCountries = interaction.values;
  const channel = interaction.guild.channels.cache.get(channelId);

  if (!channel) {
    await interaction.reply({ content: '❌ Channel not found!', ephemeral: true });
    return;
  }

  // For country selection, the interaction was already acknowledged in handleRestrictionTypeSelection
  // So we need to save the config and then update the interaction
  await saveChannelConfigurationAndUpdate(interaction, channelId, channel.name, 'COUNTRY_SPECIFIC', selectedCountries);
}

async function saveChannelConfigurationAndUpdate(
  interaction: StringSelectMenuInteraction,
  channelId: string,
  channelName: string,
  restrictionType: 'NONE' | 'VERIFIED_ONLY' | 'COUNTRY_SPECIFIC',
  allowedCountries: string[]
) {
  if (!interaction.guild) return;

  try {
    await serverConfigManager.initializeCollections();

    let serverConfig = await serverConfigManager.getServerConfig(interaction.guild.id);
    if (!serverConfig) {
      await interaction.update({ content: '❌ Server configuration not found!', components: [], embeds: [] });
      return;
    }

    // Update or add channel configuration
    const channelConfig: ChannelConfig = {
      channelId,
      name: channelName,
      restrictionType,
      allowedCountries
    };

    // Remove existing config for this channel and add new one
    const updatedChannels = serverConfig.channels.filter((c: ChannelConfig) => c.channelId !== channelId);
    updatedChannels.push(channelConfig);

    await serverConfigManager.updateServerChannels(interaction.guild.id, updatedChannels);

    // Set up Discord channel permissions
    await ChannelPermissionManager.setupChannelPermissions(interaction.guild, updatedChannels);

    // Show confirmation
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Channel Configuration Saved')
      .setDescription(`Configuration saved for #${channelName}`)
      .addFields(
        { name: 'Restriction Type', value: getRestrictionDescription(restrictionType), inline: false }
      );

    if (allowedCountries.length > 0) {
      const countryList = allowedCountries
        .map(country => `${serverConfigManager.getCountryFlag(country)} ${country}`)
        .join(', ');
      embed.addFields({ name: 'Allowed Countries', value: countryList, inline: false });
    }

    const addMoreButton = new ButtonBuilder()
      .setCustomId('add_more_channels')
      .setLabel('+ Add More Channels')
      .setStyle(ButtonStyle.Secondary);

    const setupCompleteButton = new ButtonBuilder()
      .setCustomId('setup_complete')
      .setLabel('Finish Setup')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(addMoreButton, setupCompleteButton);

    // For country selection flow, interaction was already acknowledged, so use update
    await interaction.update({ embeds: [embed], components: [row] });

  } catch (error) {
    console.error('Error saving channel configuration:', error);
    // Create a user-friendly error message
    let errorMessage = '❌ Error saving configuration!';
    if (error instanceof Error && error.message.includes('Missing Permissions')) {
      errorMessage = '❌ Bot needs "Manage Roles" and "Manage Channels" permissions to set up verification!';
    }
    await interaction.update({ content: errorMessage, components: [], embeds: [] });
  }
}

async function saveChannelConfiguration(
  interaction: StringSelectMenuInteraction,
  channelId: string,
  channelName: string,
  restrictionType: 'NONE' | 'VERIFIED_ONLY' | 'COUNTRY_SPECIFIC',
  allowedCountries: string[]
) {
  if (!interaction.guild) return;

  try {
    await serverConfigManager.initializeCollections();

    let serverConfig = await serverConfigManager.getServerConfig(interaction.guild.id);
    if (!serverConfig) {
      // Use appropriate response method based on interaction state
      const response = { content: '❌ Server configuration not found!', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
      return;
    }

    // Update or add channel configuration
    const channelConfig: ChannelConfig = {
      channelId,
      name: channelName,
      restrictionType,
      allowedCountries
    };

    // Remove existing config for this channel and add new one
    const updatedChannels = serverConfig.channels.filter((c: ChannelConfig) => c.channelId !== channelId);
    updatedChannels.push(channelConfig);

    await serverConfigManager.updateServerChannels(interaction.guild.id, updatedChannels);

    // Set up Discord channel permissions
    await ChannelPermissionManager.setupChannelPermissions(interaction.guild, updatedChannels);

    // Show confirmation
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Channel Configuration Saved')
      .setDescription(`Configuration saved for #${channelName}`)
      .addFields(
        { name: 'Restriction Type', value: getRestrictionDescription(restrictionType), inline: false }
      );

    if (allowedCountries.length > 0) {
      const countryList = allowedCountries
        .map(country => `${serverConfigManager.getCountryFlag(country)} ${country}`)
        .join(', ');
      embed.addFields({ name: 'Allowed Countries', value: countryList, inline: false });
    }

    const addMoreButton = new ButtonBuilder()
      .setCustomId('add_more_channels')
      .setLabel('+ Add More Channels')
      .setStyle(ButtonStyle.Secondary);

    const setupCompleteButton = new ButtonBuilder()
      .setCustomId('setup_complete')
      .setLabel('Finish Setup')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(addMoreButton, setupCompleteButton);

    // Use appropriate response method based on interaction state
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      await interaction.update({ embeds: [embed], components: [row] });
    }

  } catch (error) {
    console.error('Error saving channel configuration:', error);
    // Use appropriate response method based on interaction state
    const errorResponse = { content: '❌ Error saving configuration!', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorResponse);
    } else {
      await interaction.reply(errorResponse);
    }
  }
}

async function handleDemoVerification(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const country = interaction.customId
    .replace('demo_verify_', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    await serverConfigManager.initializeCollections();

    // Create Privy wallet for the user
    let walletAddress = '';
    try {
      const wallet = await privyWalletManager.createWallet(userId);
      walletAddress = wallet?.address || '';
      console.log(`✅ Created Privy wallet for ${username}: ${walletAddress}`);
    } catch (walletError) {
      console.error('Error creating Privy wallet:', walletError);
      // Continue with demo verification even if wallet creation fails
    }

    // Update user verification record
    await serverConfigManager.createUserVerification(userId, guildId, username, walletAddress);
    await serverConfigManager.verifyUser(userId, guildId, country);

    // Assign Discord roles for channel access
    await ChannelPermissionManager.assignUserRoles(interaction.guild, userId, country);

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Demo Verification Complete!')
      .setDescription(`You have been verified for **${country}**`)
      .addFields(
        { name: 'Country', value: `${serverConfigManager.getCountryFlag(country)} ${country}`, inline: true },
        { name: 'Status', value: '✅ Verified', inline: true },
        { name: 'Wallet Created', value: walletAddress ? `\`${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}\`` : 'Failed to create', inline: false }
      )
      .setFooter({ text: 'You can now access channels based on your country and verification status!' });

    await interaction.update({ embeds: [embed], components: [] });

    // Send welcome message to the server
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎉 New Verified Member!')
      .setDescription(`**${username}** has joined and verified from **${serverConfigManager.getCountryFlag(country)} ${country}**!`)
      .setTimestamp();

    // Find a general channel to send welcome message
    const generalChannel = interaction.guild.channels.cache.find(
      channel => channel.name.includes('general') || channel.name.includes('welcome')
    );

    if (generalChannel && generalChannel.isTextBased()) {
      await generalChannel.send({ embeds: [welcomeEmbed] });
    }

  } catch (error) {
    console.error('Error in demo verification:', error);
    await interaction.reply({ 
      content: '❌ Error completing verification. Please try again.', 
      ephemeral: true 
    });
  }
}

async function handleSetupComplete(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🎉 Server Setup Complete!')
    .setDescription(`**${interaction.guild.name}** is now configured with verification system!`)
    .addFields(
      { name: '📋 What\'s Next?', value: 'Users can now use `/demo-verify` to verify their country and access channels.', inline: false },
      { name: '⚙️ Admin Commands', value: '`/verify-status` - Check verification status', inline: false }
    );

  await interaction.update({ embeds: [embed], components: [] });
}

async function handleAddMoreChannels(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You need administrator permissions to configure channels!', ephemeral: true });
    return;
  }

  // Get all text channels in the server
  const textChannels = interaction.guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildText)
    .map(channel => ({ id: channel.id, name: channel.name }));

  if (textChannels.length === 0) {
    await interaction.reply({ 
      content: '❌ No text channels found in this server!', 
      ephemeral: true 
    });
    return;
  }

  // Create channel selection embed
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('➕ Add More Channels')
    .setDescription('Select another channel to configure:');

  // Create channel selection menu
  const channelOptions = textChannels.slice(0, 25).map((channel: any) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`#${channel.name}`)
      .setValue(channel.id)
      .setDescription(`Configure verification for #${channel.name}`)
  );

  const channelSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_channel_config')
    .setPlaceholder('Choose a channel to configure...')
    .addOptions(channelOptions);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(channelSelectMenu);

  await interaction.update({ 
    embeds: [embed], 
    components: [row]
  });
}

function getRestrictionDescription(restrictionType: string): string {
  switch (restrictionType) {
    case 'NONE': return '🔓 No restrictions - Anyone can access';
    case 'VERIFIED_ONLY': return '✅ Verified users only (any country)';
    case 'COUNTRY_SPECIFIC': return '🌍 Country-specific verification required';
    default: return 'Unknown restriction type';
  }
}
