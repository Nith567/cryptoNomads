import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
} from "discord.js";
import * as dotenv from "dotenv";
import { databaseManager } from "./database-manager.js";
import { 
  cryptoNomadsVerifyCommand, 
  executeCryptoNomadsVerify, 
  verifyStatusCommand, 
  executeVerifyStatus,
  checkStatusCommand,
  executeCheckStatus,
  setupChannelsCommand,
  executeSetupChannels,
  userDetailsCommand,
  executeUserDetails,
  resetPermissionsCommand,
  executeResetPermissions,
  sendCommand,
  executeSend,
  dmPrivateKeyCommand,
  executeDMPrivateKey,
  emergencyLockdownCommand,
  executeEmergencyLockdown
} from "./commands/index.js";
import { handleVerificationInteractions } from "./verification-handlers.js";
import { serverConfigManager } from "./server-config-manager.js";
import { selfProtocolManager } from "./self-protocol-manager.js";

declare var process: any;

dotenv.config();

const CLIENT_TOKEN = process.env.CLIENT_TOKEN;
const APPLICATION_ID = process.env.APPLICATION_ID;

if (!CLIENT_TOKEN) {
  throw new Error("No CLIENT_TOKEN provided.");
}

if (!APPLICATION_ID) {
  throw new Error("No APPLICATION_ID provided.");
}

// Create a new client instance with basic intents
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds
  ] 
});

client.once(Events.ClientReady, async (discord) => {
  try {
    console.log(`🔐 CryptoNomads Bot Ready! Logged in as ${discord.user.tag}`);
    
    // Initialize database and server config
    await databaseManager.connect();
    await serverConfigManager.initializeCollections();
    
    // Set Discord client for Self Protocol manager
    selfProtocolManager.setDiscordClient(client);

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(CLIENT_TOKEN);

    // Register CryptoNomads verification commands
    await rest.put(Routes.applicationCommands(APPLICATION_ID), {
      body: [
        cryptoNomadsVerifyCommand,
        verifyStatusCommand,
        checkStatusCommand,
        setupChannelsCommand,
        userDetailsCommand,
        resetPermissionsCommand,
        sendCommand,
        dmPrivateKeyCommand,
        emergencyLockdownCommand
      ],
    });

    console.log('✅ Successfully registered CryptoNomads commands!');
    console.log('📋 Available commands:');
    console.log('   /verify - Start CryptoNomads verification');
    console.log('   /verify-status - Check verification status');
    console.log('   /check-status - Check on-chain verification from smart contract');
    console.log('   /setup-channels - Create country-specific channels (Admin only)');
    console.log('   /details @user - Show user verification details');
    console.log('   /reset-permissions - Reset all channel permissions (Admin only)');
    console.log('   /send - Send CELO tokens by Discord username (All verified users)');
    console.log('   /dm-private-key - Get your wallet private key via DM (All users)');
    console.log('   /emergency-lockdown - 🚨 Lock down all channels and re-grant access (Admin only)');

    // Set Discord client for server config manager
    serverConfigManager.setDiscordClient(client);

    client.on(Events.InteractionCreate, async (interaction) => {
      // Handle verification interactions (buttons and select menus)
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        await handleVerificationInteractions(interaction);
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const { commandName } = interaction;

      try {
        // CryptoNomads Verification Commands
        if (commandName === 'verify') {
          await executeCryptoNomadsVerify(interaction);
        } else if (commandName === 'verify-status') {
          await executeVerifyStatus(interaction);
        } else if (commandName === 'check-status') {
          await executeCheckStatus(interaction);
        } else if (commandName === 'setup-channels') {
          await executeSetupChannels(interaction);
        } else if (commandName === 'details') {
          await executeUserDetails(interaction);
        } else if (commandName === 'reset-permissions') {
          await executeResetPermissions(interaction);
        } else if (commandName === 'send') {
          await executeSend(interaction);
        } else if (commandName === 'dm-private-key') {
          await executeDMPrivateKey(interaction);
        } else if (commandName === 'emergency-lockdown') {
          await executeEmergencyLockdown(interaction);
        } else {
          await interaction.reply({ 
            content: '❌ Unknown command. Available commands: `/verify`, `/verify-status`, `/check-status`, `/setup-channels`, `/details`, `/reset-permissions`, `/send`, `/dm-private-key`, `/emergency-lockdown`', 
            ephemeral: true 
          });
        }

      } catch (error) {
        console.error(`❌ Error executing command ${commandName}:`, error);
        
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ 
              content: '❌ There was an error executing this command! Please try again.' 
            });
          } else {
            await interaction.reply({ 
              content: '❌ There was an error executing this command! Please try again.', 
              ephemeral: true 
            });
          }
        } catch (discordError) {
          console.error('❌ Discord client error:', discordError);
          // Don't try to respond again if Discord API fails
        }
      }
    });

    // Handle when bot is added to a new server
    client.on(Events.GuildCreate, async (guild) => {
      try {
        console.log(`🚀 Bot added to server: ${guild.name} (${guild.id})`);
        
        // Initialize server config manager
        await serverConfigManager.initializeCollections();
        
        // Get server owner
        const owner = await guild.fetchOwner();
        
        // Create server configuration
        await serverConfigManager.createServerConfig(guild.id, guild.name, owner.id, owner.user.username);
        
        console.log('✅ Server configuration created - no role restrictions applied');
        
        // Send setup instructions to server owner
        const setupEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🎉 Welcome to CryptoNomads Bot!')
          .setDescription(`Thanks for adding me to **${guild.name}**!`)
          .addFields(
            { name: '⚙️ Automatic Setup Complete', value: '✅ Created "Verified" and "Unverified" roles\n✅ Restricted channel access to verified users only\n✅ All existing members need to verify to access channels', inline: false },
            { name: '🔐 User Flow', value: 'Users will:\n1. Run `/verify` → get noncustodial wallet\n2. Complete Self Protocol verification\n3. Get "Verified" role + country/gender roles\n4. Access country-specific channels', inline: false },
            { name: '🌍 Channel Access', value: 'Only verified users can access channels (except general). New members get "Unverified" role by default.', inline: false }
          );

        try {
          await owner.send({ embeds: [setupEmbed] });
        } catch (dmError) {
          console.log('Could not send DM to server owner, probably has DMs disabled');
          
          // Try to send to a general channel
          const generalChannel = guild.channels.cache.find(
            channel => (channel.name.includes('general') || channel.name.includes('welcome')) && channel.isTextBased()
          );
          
          if (generalChannel && generalChannel.isTextBased()) {
            await generalChannel.send({ 
              content: `<@${owner.id}>`, 
              embeds: [setupEmbed] 
            });
          }
        }
        
      } catch (error) {
        console.error('Error handling guild create:', error);
      }
    });

    // Handle when a new member joins the server
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        console.log(`👋 New member joined ${member.guild.name}: ${member.user.username}`);
        
        // Initialize collections
        await serverConfigManager.initializeCollections();
        
        // Check if server has verification configured
        const serverConfig = await serverConfigManager.getServerConfig(member.guild.id);
        if (!serverConfig || !serverConfig.setupComplete) {
          return; // Server not configured yet
        }
        
        // Assign "Unverified" role to new member (restricts channel access)
        const unverifiedRole = member.guild.roles.cache.find(role => role.name === 'Unverified');
        if (unverifiedRole) {
          try {
            await member.roles.add(unverifiedRole);
            console.log(`� Assigned Unverified role to ${member.user.username} - needs to verify to access channels`);
          } catch (roleError) {
            console.log(`⚠️ Could not assign Unverified role to ${member.user.username}`);
          }
        }

        // Send welcome message in the server
        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('👋 Welcome to CryptoNomads!')
          .setDescription(`Hey **${member.user.username}**, welcome to **${member.guild.name}**!`)
          .addFields(
            { name: '🔐 Verification Required', value: 'To access all channels, please verify your identity using `/verify`', inline: false },
            { name: '🌍 Country-Based Access', value: 'After verification, you\'ll get access to your country-specific channels', inline: false },
            { name: '🎉 What You Get', value: '• Country role (🇮🇳 India, 🇺🇸 USA, etc.)\n• Gender role (♂️ Male, ♀️ Female)\n• ENS name: `username.0xcryptonomads.eth`\n• Access to exclusive channels', inline: false }
          );

        // Find a general channel to send welcome message
        const generalChannel = member.guild.channels.cache.find(
          channel => (channel.name.includes('general') || channel.name.includes('welcome')) && channel.isTextBased()
        );

        if (generalChannel && generalChannel.isTextBased()) {
          await generalChannel.send({ embeds: [welcomeEmbed] });
        }

        // Send DM with verification instructions
        const dmEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🔐 CryptoNomads Verification Guide')
          .setDescription(`Welcome to **${member.guild.name}**! You need to verify to access channels.`)
          .addFields(
            { name: '📋 Verification Steps', value: '1. Use `/verify` in the server\n2. You\'ll get a Privy wallet created\n3. Click the verification link to complete identity verification\n4. Get assigned roles and channel access!', inline: false },
            { name: '🎯 What Happens After', value: '• **Country verification** (passport/ID scan)\n• **Gender & age verification**\n• **ENS name minting**: `yourname.0xcryptonomads.eth`\n• **Discord roles** based on your country', inline: false },
            { name: '🌍 Supported Countries', value: serverConfigManager.getAvailableCountries().map(country => 
              `${serverConfigManager.getCountryFlag(country)} ${country}`
            ).join('\n'), inline: false }
          );

        try {
          await member.send({ embeds: [dmEmbed] });
        } catch (dmError) {
          console.log(`Could not send DM to ${member.user.username}, probably has DMs disabled`);
        }
        
      } catch (error) {
        console.error('Error handling guild member add:', error);
      }
    });

    console.log('🚀 CryptoNomads bot started successfully!');

  } catch (error) {
    console.error('❌ Error starting CryptoNomads bot:', error);
    process.exit(1);
  }
});

// Error handling
client.on('error', (error: any) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error: any) => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Start the bot
client.login(CLIENT_TOKEN);

console.log('🚀 Starting CryptoNomads Discord Bot...');
console.log('🔗 Verification flow:');
console.log('   1. User joins Discord → Can\'t access channels');  
console.log('   2. User runs /verify → Creates Privy wallet + UUID');
console.log('   3. User gets redirected → localhost:3001/verification/{uuid}');
console.log('   4. NextJS queries MongoDB by UUID → Gets Discord info + wallet');
console.log('   5. User verifies with Self Protocol → Updates MongoDB via API');
console.log('   6. Bot adds Discord roles → Channel access granted');
console.log('   7. ENS name minted: username.0xcryptonomads.eth');
