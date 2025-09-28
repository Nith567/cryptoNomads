import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
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
  userDetailsCommand,
  executeUserDetails,
  sendCommand,
  executeSend,
  dmPrivateKeyCommand,
  executeDMPrivateKey,
  emergencyLockdownCommand,
  executeEmergencyLockdown,
  depositCommand,
  executeDeposit,
  debugWalletCommand,
  executeDebugWallet
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

// Create a new client instance with necessary intents
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
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
        userDetailsCommand,
        sendCommand,
        dmPrivateKeyCommand,
        emergencyLockdownCommand,
        depositCommand,
        debugWalletCommand
      ],
    });

    console.log('✅ Successfully registered CryptoNomads commands!');
    console.log('📋 Available commands:');
    console.log('   /verify - Start CryptoNomads verification');
    console.log('   /check-status - Check verification status');
    console.log('   /details - Show user verification details');
    console.log('   /send - Send CELO to a user (by tagging them)');
    console.log('   /deposit - Show wallet address for deposits');
    console.log('   /dm-private-key - Get private key via DM');
    console.log('   /emergency-lockdown - Admin: Reset all permissions');

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
        } 
         else if (commandName === 'check-status') {
          await executeCheckStatus(interaction);
        } else if (commandName === 'details') {
          await executeUserDetails(interaction);
        } else if (commandName === 'send') {
          await executeSend(interaction);
        } else if (commandName === 'dm-private-key') {
          await executeDMPrivateKey(interaction);
        } else if (commandName === 'emergency-lockdown') {
          await executeEmergencyLockdown(interaction);
        } else if (commandName === 'deposit') {
          await executeDeposit(interaction);
        } else if (commandName === 'debug-wallet') {
          await executeDebugWallet(interaction);
        } else {
          await interaction.reply({ 
            content: '❌ Unknown command. Available commands: `/verify`, `/check-status`, `/details`, `/send`, `/deposit`', 
            ephemeral: true 
          });
        }

      } catch (error) {
        console.error(`❌ Error executing command ${commandName}:`, error);
        
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
      }
    });

    console.log('🚀 CryptoNomads bot started successfully!');

  } catch (error) {
    console.error('❌ Error starting CryptoNomads bot:', error);
    process.exit(1);
  }
});

// Error handling
client.on('error', error => {
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
console.log('   2. User runs /verify → Creates Privy wallet');
console.log('   3. User gets verification URL → NextJS site');
console.log('   4. User verifies with Self Protocol → On-chain verification');
console.log('   5. Bot adds Discord roles → Channel access granted');
console.log('   6. ENS name minted: username.0xcryptonomads.eth');
