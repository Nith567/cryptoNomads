import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType
} from 'discord.js';
import { serverConfigManager, ChannelConfig } from '../server-config-manager.js';
import { privyWalletManager } from '../privy-wallet-manager.js';
import { selfProtocolManager } from '../self-protocol-manager.js';
import { ethers } from 'ethers';
import { celoPaymentManager } from '../celo-payment-manager.js';
import { databaseManager } from '../database-manager.js';




// CryptoNomads verification command
export const cryptoNomadsVerifyCommand = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Start CryptoNomads verification with Self Protocol');

export async function executeCryptoNomadsVerify(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Defer reply immediately to prevent timeout
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {
    await serverConfigManager.initializeCollections();

    // Check if user already exists and is verified
    let userVerification = await serverConfigManager.getUserVerification(userId, guildId);
    
    if (userVerification?.verified && userVerification?.onChainVerified) {
      await interaction.editReply({ 
        content: '✅ You are already verified! Use `/check-status` to check your verification status.'
      });
      return;
    }

    // Start verification process with Self Protocol
    const verificationData = await selfProtocolManager.startVerification(userId, guildId, username);

    // Check if this is a reused session
    const isReusedSession = verificationData.verifyUuid.includes('_'); // New UUIDs contain timestamp
    
    // Create verification embed
    const embed = new EmbedBuilder()
      .setColor(isReusedSession ? 0xFFA500 : 0x00FF00)
      .setTitle('🔐 CryptoNomads Verification')
      .setDescription(isReusedSession ? 
        '**Continue your pending verification with Self Protocol**' : 
        '**Start your on-chain identity verification with Self Protocol**')
      .addFields(
        { name: '📱 Wallet Address', value: `\`${verificationData.walletAddress.slice(0, 6)}...${verificationData.walletAddress.slice(-4)}\``, inline: true },
        { name: '🎯 Status', value: isReusedSession ? 'Pending Verification' : 'Ready to Start', inline: true },
        { name: '📋 What We Verify', value: '• Country of residence\n• Gender\n• Age (18+)\n• Identity authenticity', inline: false },
        { name: '🎉 After Verification', value: `• ENS name: \`${username.toLowerCase()}.0xcryptonomads.eth\`\n• Country-specific channel access\n• Verification roles`, inline: false }
      )
      .setFooter({ text: isReusedSession ? 
        'Using existing verification session | Powered by Self Protocol' : 
        'Powered by Self Protocol | Secure & Private' });

    // Create verification button
    const verifyButton = new ButtonBuilder()
      .setLabel('🔗 Start Verification')
      .setStyle(ButtonStyle.Link)
      .setURL(verificationData.verificationUrl);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(verifyButton);

    await interaction.editReply({ 
      embeds: [embed], 
      components: [row]
    });

  } catch (error) {
    console.error('Error in demo verify:', error);
    await interaction.editReply({ 
      content: '❌ Error starting verification. Please try again.'
    });
  }
}

// Check verification status command
export const verifyStatusCommand = new SlashCommandBuilder()
  .setName('verify-status')
  .setDescription('Check your verification status');

export async function executeVerifyStatus(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  try {
    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    await serverConfigManager.initializeCollections();

    const userVerification = await serverConfigManager.getUserVerification(userId, guildId);
    const serverConfig = await serverConfigManager.getServerConfig(guildId);

    if (!userVerification) {
      await interaction.editReply({ 
        content: '❌ No verification record found. Use `/verify` to start verification.'
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(userVerification.verified ? 0x00FF00 : 0xFF9900)
      .setTitle('🔐 Verification Status')
      .addFields(
        { name: 'Status', value: userVerification.verified ? '✅ Verified' : '⏳ Pending', inline: true },
        { name: 'On-Chain', value: userVerification.onChainVerified ? '✅ Verified' : '❌ Not verified', inline: true },
        { name: 'Country', value: userVerification.selectedCountry ? `${serverConfigManager.getCountryFlag(userVerification.selectedCountry)} ${userVerification.selectedCountry}` : 'Not selected', inline: true },
        { name: 'Gender', value: userVerification.gender ? (userVerification.gender === 'male' ? '♂️ Male' : '♀️ Female') : 'Not set', inline: true },
        { name: 'Age Status', value: userVerification.isAdult ? '🔞 Adult (18+)' : 'Not verified', inline: true },
        { name: 'ENS Name', value: userVerification.ensName || 'Not minted', inline: true }
      );

    if (userVerification.walletAddress) {
      embed.addFields({
        name: '📱 Wallet Address',
        value: `\`${userVerification.walletAddress.slice(0, 6)}...${userVerification.walletAddress.slice(-4)}\``,
        inline: true
      });
    }

    if (userVerification.verified && userVerification.allowedChannels.length > 0) {
      const channelList = userVerification.allowedChannels
        .map(channelId => `<#${channelId}>`)
        .join(', ');
      
      embed.addFields(
        { name: 'Accessible Channels', value: channelList, inline: false }
      );
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error checking verification status:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Error checking verification status. Please try again.'
        });
      } else {
        await interaction.reply({ 
          content: '❌ Error checking verification status. Please try again.',
          ephemeral: true
        });
      }
    } catch (discordError) {
      console.error('Discord API error in verify-status:', discordError);
    }
  }
}

// Contract ABI for the getVerificationDataByDiscordUsername function
const CONTRACT_ABI = [
  {
    "inputs": [{"internalType": "string", "name": "discordUsername", "type": "string"}],
    "name": "getVerificationDataByDiscordUsername",
    "outputs": [
      {"internalType": "string", "name": "gender", "type": "string"},
      {"internalType": "string", "name": "nationality", "type": "string"},
      {"internalType": "bool", "name": "isAdult", "type": "bool"},
      {"internalType": "uint256", "name": "ageThreshold", "type": "uint256"},
      {"internalType": "address", "name": "walletAddress", "type": "address"},
      {"internalType": "bool", "name": "isVerified", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Celo mainnet RPC and contract address
const CELO_RPC_URL = 'https://forno.celo.org';
const CONTRACT_ADDRESS = '0x149cbA3EE15C863563a18808814a10815369458E';

// Check status command (queries the smart contract)
export const checkStatusCommand = new SlashCommandBuilder()
  .setName('check-status')
  .setDescription('Check your on-chain verification status from the smart contract');

export async function executeCheckStatus(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Defer reply immediately to prevent timeout
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const username = interaction.user.username;

  try {

    // Query the smart contract on Celo mainnet
    const provider = new ethers.JsonRpcProvider(CELO_RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    console.log(`🔍 Querying contract for Discord username: ${username}`);

    let contractData;
    let isVerifiedOnChain = false;

    try {
      // Query the contract with Discord username
      const result = await contract.getVerificationDataByDiscordUsername(username);
      
      contractData = {
        gender: result[0],       // string
        nationality: result[1],  // string (country code like "IND")
        isAdult: result[2],      // bool
        ageThreshold: result[3], // uint256
        walletAddress: result[4], // address
        isVerified: result[5]    // bool
      };
console.log(contractData);
      isVerifiedOnChain = contractData.isVerified && contractData.walletAddress !== ethers.ZeroAddress;
      
      console.log(`✅ Contract query successful:`, contractData);

    } catch (contractError) {
      console.log(`❌ Contract query failed (user not verified on-chain):`, contractError.message);
      
      // User is not verified on-chain
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔐 On-Chain Verification Status')
        .setDescription('❌ **Not Verified On-Chain**\n\nYou have not completed the Self Protocol verification process yet.')
        .addFields(
          { name: 'Next Steps', value: '1. Use `/verify` to start verification\n2. Complete the Self Protocol verification\n3. Check back with `/check-status`', inline: false }
        )
        .setFooter({ text: 'CryptoNomads Verification System' });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (isVerifiedOnChain) {
      // User is verified on-chain, update database with real data
      await serverConfigManager.initializeCollections();
      
      // Convert gender code to readable format
      const genderDisplay = contractData.gender === 'M' ? '♂️ Male' : 
                           contractData.gender === 'F' ? '♀️ Female' : 
                           contractData.gender === 'T' ? '⚧️ Transgender' : 
                           contractData.gender || 'Not specified';

      // Get country name from nationality code
      const countryDisplay = serverConfigManager.getCountryName(contractData.nationality) || contractData.nationality || 'Not specified';

      // Update database with real verification data
      const updateData = {
        verified: true,
        onChainVerified: true,
        selectedCountry: contractData.nationality, // Store the country code
        gender: contractData.gender,
        isAdult: contractData.isAdult,
        ageThreshold: contractData.ageThreshold.toString(),
        contractWalletAddress: contractData.walletAddress,
        updatedAt: new Date(),
        verifiedAt: new Date()
      };

      // Update user in database
      await serverConfigManager.updateUserVerification(userId, interaction.guild.id, updateData);

      // Real ENS name from contract (automatically registered during verification)
      const ensName = `${username.toLowerCase()}.0xcryptonomads.eth`;
      
      await serverConfigManager.updateUserVerification(userId, interaction.guild.id, { ensName });

      // Update Discord channel permissions based on country
      await serverConfigManager.updateChannelPermissions(userId, interaction.guild.id, contractData.nationality);

      // Update user's Discord profile with verified information
      // Profile updated - user has been verified and roles assigned
      console.log(`✅ User ${interaction.user.username} verified successfully with country: ${countryDisplay}`);

      // Generate profile bio suggestion
      const genderText = contractData.gender === 'M' ? 'Male' : 
                        contractData.gender === 'F' ? 'Female' : 
                        contractData.gender === 'T' ? 'Transgender' : 'Not specified';
      
      const profileBio = `✅ Verified CryptoNomad
🌍 Country: ${countryDisplay}
⚧️ Gender: ${genderText}
🔞 Age: ${contractData.isAdult ? '18+' : 'Under 18'}
🏷️ ENS: ${ensName}
⛓️ Blockchain: Celo Mainnet`;

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🔐 On-Chain Verification Status')
        .setDescription('✅ **Verified On-Chain!**\n\nYour Self Protocol verification is complete and stored on the blockchain.')
        .addFields(
          { name: '🌍 Country', value: `${serverConfigManager.getCountryFlag(contractData.nationality)} ${countryDisplay}`, inline: true },
          { name: '⚧️ Gender', value: genderDisplay, inline: true },
          { name: '🔞 Age Status', value: contractData.isAdult ? '✅ Adult (18+)' : '❌ Under 18', inline: true },
          { name: '📱 Wallet Address', value: `\`${contractData.walletAddress.slice(0, 3)}...${contractData.walletAddress.slice(-4)}\``, inline: true },
          { name: '🏷️ ENS Name', value: `[\`${ensName}\`](https://ens-resolver-address.onrender.com/resolve/${ensName})`, inline: true },
          { name: '⛓️ Blockchain', value: 'Celo Mainnet', inline: true },
         
        )

      await interaction.editReply({ embeds: [embed] });

    } else {
      // Contract returned data but user is not verified
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('🔐 On-Chain Verification Status')
        .setDescription('⏳ **Verification In Progress**\n\nYour verification session exists but is not yet complete.')
        .addFields(
          { name: 'Status', value: '⏳ Pending verification', inline: true },
          { name: 'Next Steps', value: 'Complete your Self Protocol verification process', inline: false }
        )
        .setFooter({ text: 'CryptoNomads Verification System' });

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (error) {
    console.error('❌ Error checking on-chain status:', error);
    await interaction.editReply({ 
      content: '❌ Error checking on-chain verification status. Please try again later.' 
    });
  }
}

// Setup country channels command (Admin only)
export const setupChannelsCommand = new SlashCommandBuilder()
  .setName('setup-channels')
  .setDescription('Setup country-specific verification channels (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeSetupChannels(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    
    // Country channels to create
    const countryChannels = [
      { name: 'india-channel', description: '🇮🇳 For verified Indian users only' },
      { name: 'english-channel', description: '🇺🇸🇬🇧 For verified English-speaking users' },
      { name: 'german-channel', description: '🇩🇪 For verified German users only' },
      { name: 'french-channel', description: '🇫🇷 For verified French users only' },
      { name: 'japanese-channel', description: '🇯🇵 For verified Japanese users only' },
      { name: 'korean-channel', description: '🇰🇷 For verified Korean users only' },
      { name: 'chinese-channel', description: '🇨🇳 For verified Chinese users only' },
      { name: 'spanish-channel', description: '🇪🇸 For verified Spanish users only' },
      { name: 'portuguese-channel', description: '🇧🇷 For verified Portuguese users only' }
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const channelInfo of countryChannels) {
      const existingChannel = guild.channels.cache.find((ch: any) => ch.name === channelInfo.name);
      
      if (!existingChannel) {
        const channel = await guild.channels.create({
          name: channelInfo.name,
          type: ChannelType.GuildText,
          topic: channelInfo.description,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel
              ]
            }
          ]
        });
        
        console.log(`✅ Created channel: #${channelInfo.name}`);
        createdCount++;
      } else {
        existingCount++;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🛠️ Country Channels Setup Complete')
      .addFields(
        { name: '✅ Channels Created', value: createdCount.toString(), inline: true },
        { name: '📋 Already Existed', value: existingCount.toString(), inline: true },
        { name: '📝 How It Works', value: 'Users get access to their country channel after verification:\n• India 🇮🇳 → #hindi-channel\n• USA/UK → #english-channel\n• Germany 🇩🇪 → #german-channel\n• And more...', inline: false }
      )
      .setFooter({ text: 'Only verified users from each country can access their channels' });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('❌ Error setting up channels:', error);
    await interaction.editReply({ 
      content: '❌ Error setting up country channels. Please try again.' 
    });
  }
}

// User details command
export const userDetailsCommand = new SlashCommandBuilder()
  .setName('details')
  .setDescription('Show verification details of a user')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to check details for')
      .setRequired(true)
  );

export async function executeUserDetails(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Defer reply immediately to prevent timeout
  await interaction.deferReply({ ephemeral: true });

  const targetUser = (interaction.options as any).getUser('user');
  if (!targetUser) {
    await interaction.editReply({ content: '❌ Please specify a user to check details for.' });
    return;
  }

  try {
    await serverConfigManager.initializeCollections();

    const userVerification = await serverConfigManager.getUserVerification(targetUser.id, interaction.guild.id);

    if (!userVerification || !userVerification.verified) {
      await interaction.editReply({ 
        content: `❌ ${targetUser.username} is not verified yet.` 
      });
      return;
    }

    // Get country display name
    const countryDisplay = userVerification.selectedCountry ? 
      serverConfigManager.getCountryName(userVerification.selectedCountry) : 'Not specified';

    const gender = userVerification.gender as string;
    const genderDisplay = gender === 'M' || gender === 'male' ? '♂️ Male' : 
                         gender === 'F' || gender === 'female' ? '♀️ Female' : 
                         gender === 'T' ? '⚧️ Transgender' : 'Not specified';

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🔐 ${targetUser.username}'s Verification Details`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: '🌍 Country', value: `${serverConfigManager.getCountryFlag(userVerification.selectedCountry || '')} ${countryDisplay}`, inline: true },
        { name: '⚧️ Gender', value: genderDisplay, inline: true },
        { name: '🔞 Age Status', value: userVerification.isAdult ? '✅ Adult (18+)' : '❌ Under 18', inline: true },
        { name: '📱 Wallet Address', value: userVerification.walletAddress ? `\`${userVerification.walletAddress.slice(0, 6)}...${userVerification.walletAddress.slice(-4)}\`` : 'Not available', inline: true },
        { name: '🏷️ ENS Name', value: userVerification.ensName ? `[\`${userVerification.ensName}\`](https://ens-resolver-address.onrender.com/resolve/${userVerification.ensName})` : 'Not minted', inline: true }
      )
      .addFields(
        { name: '✅ Verification Status', value: `On-Chain: ${userVerification.onChainVerified ? '✅' : '❌'}`, inline: true },
        { name: '📅 Verified At', value: userVerification.verifiedAt ? `<t:${Math.floor(userVerification.verifiedAt.getTime() / 1000)}:R>` : 'Not verified', inline: true }
      )
      .setFooter({ text: 'CryptoNomads Verification System • Self Protocol' });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error checking user details:', error);
    await interaction.editReply({ 
      content: '❌ Error retrieving user details. Please try again.' 
    });
  }
}

// Deposit command - show user's wallet address for receiving funds
export const depositCommand = new SlashCommandBuilder()
  .setName('deposit')
  .setDescription('Get your wallet address to receive CELO and other tokens');

export async function executeDeposit(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Get user verification data
    const userVerification = await serverConfigManager.getUserVerification(userId, guildId);
    
    if (!userVerification || !userVerification.walletAddress) {
      await interaction.editReply({ 
        content: '❌ **Wallet not found!**\n\n' +
                '💡 You need to run `/verify` first to create your wallet and complete verification.\n' +
                'After verification, you\'ll have a wallet address to receive funds.'
      });
      return;
    }

    const walletAddress = userVerification.walletAddress;
    const ensName = userVerification.ensName || `${interaction.user.username}.0xcryptonomads.eth`;
    const isVerified = userVerification.verified && userVerification.onChainVerified;

    const embed = new EmbedBuilder()
      .setColor(isVerified ? 0x00FF00 : 0xFFA500)
      .setTitle('💰 Your Deposit Address')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '📍 Wallet Address', value: `\`${walletAddress}\``, inline: false },
        { name: '🏷️ ENS Name', value: ensName, inline: true },
        { name: '⛓️ Networks', value: 'Celo Mainnet\nCelo Testnet (Alfajores)', inline: true },
        { name: '💎 Supported Tokens', value: 'CELO (Native)\nUSDC, USDT\nAll ERC-20 tokens', inline: true }
      )
      .addFields(
        { name: '🔗 Useful Links', value: 
          `[View on Celoscan](https://celoscan.io/address/${walletAddress})\n` +
          `[Add CELO to MetaMask](https://docs.celo.org/wallet/metamask/setup)\n` +
          `[Celo Bridge](https://bridge.celo.org/)`, inline: false 
        },
        { name: '⚠️ Important Notes', value: 
          '• Only send tokens on **Celo network**\n' +
          '• Double-check the address before sending\n' +
          '• This is your **non-custodial wallet**\n' +
          (isVerified ? '• ✅ Wallet is verified and active' : '• ⚠️ Complete verification to unlock all features'), 
          inline: false 
        }
      )
      .setFooter({ text: 'CryptoNomads Wallet • Powered by Privy' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Log the deposit address request
    console.log(`💰 ${interaction.user.username} requested deposit address: ${walletAddress}`);

  } catch (error) {
    console.error('❌ Error executing deposit command:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while retrieving your wallet address. Please try again later.' 
    });
  }
}

// Send CELO command (available to all verified users)
export const sendCommand = new SlashCommandBuilder()
  .setName('send')
  .setDescription('Send CELO tokens to a user by tagging them')
  .addUserOption(option =>
    option.setName('recipient')
      .setDescription('Tag the Discord user to send CELO to (e.g., @Nithin-Varma)')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option.setName('amount')
      .setDescription('Amount of CELO to send')
      .setRequired(true)
      .setMinValue(0.001)
      .setMaxValue(10)
  );

export async function executeSend(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const recipientUser = interaction.options.get('recipient')?.user;
    const amount = interaction.options.get('amount')?.value as number;

    if (!recipientUser || !amount) {
      await interaction.editReply({ 
        content: '❌ Invalid parameters. Please tag a user and provide an amount.' 
      });
      return;
    }

    // Check if sender is verified
    const senderVerification = await serverConfigManager.getUserVerification(interaction.user.id, interaction.guild.id);
    if (!senderVerification || !senderVerification.verified) {
      await interaction.editReply({ 
        content: '❌ You must be verified to send CELO tokens! Use `/verify` first.' 
      });
      return;
    }

    // Check if recipient is verified
    const recipientVerification = await serverConfigManager.getUserVerification(recipientUser.id, interaction.guild.id);
    if (!recipientVerification || !recipientVerification.verified) {
      await interaction.editReply({ 
        content: `❌ ${recipientUser.username} is not verified yet! They need to use \`/verify\` first.` 
      });
      return;
    }

    console.log(`💸 ${interaction.user.username} sending ${amount} CELO to ${recipientUser.username}`);
    console.log(`🔍 Sender Discord ID: ${interaction.user.id}`);
    console.log(`🔍 Recipient Discord ID: ${recipientUser.id}`);

    // Convert recipient username to ENS format
    const ensName = `${recipientUser.username}.0xcryptonomads.eth`;
    console.log(`🏷️ Target ENS name: ${ensName}`);

    // Get sender's wallet ID from database mapping
    console.log(`🔍 Looking up sender's wallet mapping for Discord ID: ${interaction.user.id}`);
    const senderWalletMapping = await databaseManager.getUserMapping(interaction.user.id);
    console.log(`📋 Sender wallet mapping result:`, senderWalletMapping);
    
    if (!senderWalletMapping || !senderWalletMapping.privyWalletId) {
      console.log(`❌ Sender wallet mapping failed! User: ${interaction.user.username} (${interaction.user.id})`);
      console.log(`📊 Debug - senderWalletMapping:`, senderWalletMapping);
      console.log(`📊 Debug - privyWalletId:`, senderWalletMapping?.privyWalletId);
      
      await interaction.editReply({ 
        content: `❌ **Your wallet is not properly configured!**\n\n` +
                `💡 **Debug Info:**\n` +
                `• Your Discord ID: \`${interaction.user.id}\`\n` +
                `• Wallet mapping found: ${senderWalletMapping ? '✅' : '❌'}\n` +
                `• Privy wallet ID: ${senderWalletMapping?.privyWalletId || 'Not found'}\n\n` +
                `Please use \`/debug-wallet\` to check your wallet status.`
      });
      return;
    }
    
    console.log(`✅ Sender wallet mapping found! Privy ID: ${senderWalletMapping.privyWalletId}`);

    // Get recipient's wallet mapping from database  
    console.log(`🔍 Looking up recipient's wallet mapping for Discord ID: ${recipientUser.id}`);
    const recipientWalletMapping = await databaseManager.getUserMapping(recipientUser.id);
    console.log(`📋 Recipient wallet mapping result:`, recipientWalletMapping);
    
    if (!recipientWalletMapping || !recipientWalletMapping.privyWalletId) {
      console.log(`❌ Recipient wallet mapping failed! User: ${recipientUser.username} (${recipientUser.id})`);
      await interaction.editReply({ 
        content: `❌ **${recipientUser.username}'s wallet is not properly configured!**\n\n` +
                `💡 They need to complete verification first with \`/verify\`.`
      });
      return;
    }
    
    // Get recipient's wallet address directly from Privy
    console.log(`🔍 Getting recipient wallet details from Privy...`);
    const recipientWallet = await privyWalletManager.getWallet(recipientWalletMapping.privyWalletId);
    console.log(`📋 Recipient wallet details:`, recipientWallet);
    
    if (!recipientWallet || !recipientWallet.address) {
      console.log(`❌ Could not get recipient wallet address from Privy`);
      await interaction.editReply({ 
        content: `❌ **Could not find ${recipientUser.username}'s wallet address!**\n\n` +
                `💡 They may need to re-verify with \`/verify\`.`
      });
      return;
    }
    
    const recipientAddress = recipientWallet.address;
    console.log(`✅ Recipient address found: ${recipientAddress}`);

    // Check sender's CELO balance first
    console.log('1️⃣ Checking sender CELO balance...');
    const balance = await privyWalletManager.getCeloBalance(senderWalletMapping.privyWalletId, '42220');
    
    if (balance.error) {
      await interaction.editReply({ 
        content: `❌ Could not check your CELO balance: ${balance.error}` 
      });
      return;
    }

    console.log(`💼 Sender balance: ${balance.balance} CELO`);

    // Verify sufficient balance
    if (parseFloat(balance.balance) < amount) {
      await interaction.editReply({ 
        content: `❌ Insufficient CELO balance!\n\n💼 Your balance: **${balance.balance} CELO**\n💸 Amount needed: **${amount} CELO**\n\n💡 Use \`/deposit\` to get your wallet address and add funds.` 
      });
      return;
    }

    // Send CELO using Privy wallet manager
    console.log('2️⃣ Sending CELO tokens...');
    const result = await privyWalletManager.sendCeloTokens(
      senderWalletMapping.privyWalletId,
      recipientAddress,
      amount.toString(),
      '42220' // Celo Mainnet
    );

    if (result.success && result.txHash) {
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('💸 CELO Payment Sent!')
        .addFields(
          { name: '👤 From', value: `${serverConfigManager.getCountryFlag(senderVerification.selectedCountry || '')} ${interaction.user.username}`, inline: true },
          { name: '👤 To', value: `${serverConfigManager.getCountryFlag(recipientVerification.selectedCountry || '')} ${recipientUser.username}`, inline: true },
          { name: '💰 Amount', value: `${amount} CELO`, inline: true },
          { name: '📍 Recipient Address', value: `\`${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}\``, inline: true },
          { name: '🏷️ ENS Name', value: ensName, inline: true },
          { name: '🔗 Transaction', value: `[View on Celoscan](${result.explorerUrl})`, inline: false },
          { name: '⛽ Gas Used', value: result.gasUsed || '21000', inline: true },
          { name: '📊 Block', value: result.blockNumber || 'Pending', inline: true }
        )
        .setFooter({ text: 'CryptoNomads P2P Payment • Celo Network' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log the payment
      console.log(`✅ Payment sent: ${amount} CELO from ${interaction.user.username} to ${recipientUser.username} (${recipientAddress}) - TX: ${result.txHash}`);

    } else {
      await interaction.editReply({ 
        content: `❌ Payment failed: ${result.error || 'Unknown error'}\n\n💡 Make sure you have enough CELO balance and the recipient is verified.` 
      });
    }

  } catch (error) {
    console.error('❌ Error executing send command:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while processing the payment. Please try again later.' 
    });
  }
}

// DM Private Key command
export const dmPrivateKeyCommand = new SlashCommandBuilder()
  .setName('dm-private-key')
  .setDescription('Get your wallet private key sent to your DMs (use with extreme caution!)');

export async function executeDMPrivateKey(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Check if user is verified
    const userVerification = await serverConfigManager.getUserVerification(userId, guildId);
    if (!userVerification || !userVerification.verified) {
      await interaction.editReply({ 
        content: '❌ You must be verified to access your private key! Use `/verify` first.' 
      });
      return;
    }

    console.log(`🔐 ${interaction.user.username} (ID: ${userId}) requested their private key`);

    // Get user's wallet mapping from database
    console.log(`🔍 Looking for wallet mapping for Discord ID: ${userId}`);
    const userWalletMapping = await databaseManager.getUserMapping(userId);
    console.log(`📋 Wallet mapping result:`, userWalletMapping);
    
    if (!userWalletMapping || !userWalletMapping.privyWalletId) {
      console.log(`❌ No wallet mapping found for user ${interaction.user.username} (${userId})`);
      
      // Try to get wallet address from verification record instead
      const walletAddress = userVerification.walletAddress;
      if (walletAddress) {
        await interaction.editReply({ 
          content: `❌ **Wallet mapping not found in database!**\n\n` +
                  `💡 **Debug Info:**\n` +
                  `• Your wallet address: \`${walletAddress}\`\n` +
                  `• Your Discord ID: \`${userId}\`\n` +
                  `• Verification status: ${userVerification.verified ? '✅' : '❌'}\n\n` +
                  `Please contact support with this info.`
        });
      } else {
        await interaction.editReply({ 
          content: '❌ No wallet found for your account. Please contact support.' 
        });
      }
      return;
    }

    // Get private key from Privy using the wallet ID
    const privateKey = await privyWalletManager.getWalletPrivateKey(userWalletMapping.privyWalletId);
    
    if (!privateKey) {
      await interaction.editReply({ 
        content: '❌ Could not retrieve your private key. Please contact support.' 
      });
      return;
    }

    // Create DM embed with private key
    const dmEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🔐 Your Wallet Private Key')
      .setDescription('**⚠️ EXTREME CAUTION REQUIRED ⚠️**\n\nYour private key gives FULL ACCESS to your wallet. Never share it with anyone!')
      .addFields(
        { name: '🏷️ ENS Name', value: userVerification.ensName || 'Not minted', inline: true },
        { name: '📍 Wallet Address', value: `\`${userVerification.walletAddress}\``, inline: false },
        { name: '🔑 Private Key', value: `\`\`\`${privateKey}\`\`\``, inline: false }
      )
      .addFields(
        { name: '🛡️ Security Tips', value: 
          '• Never share this key with anyone\n' +
          '• Store it in a secure password manager\n' +
          '• Consider using a hardware wallet\n' +
          '• Delete this message after saving', inline: false }
      )
      .setFooter({ text: 'CryptoNomads Wallet • Keep This Safe!' })
      .setTimestamp();

    try {
      // Send DM to user
      await interaction.user.send({ embeds: [dmEmbed] });
      
      await interaction.editReply({ 
        content: '✅ **Private key sent to your DMs!**\n\n' +
                 '🔐 Check your direct messages for your wallet private key.\n' +
                 '⚠️ **Please read the security instructions carefully!**'
      });

      console.log(`✅ Private key sent to ${interaction.user.username} via DM`);

    } catch (dmError) {
      console.error('❌ Could not send DM:', dmError);
      await interaction.editReply({ 
        content: '❌ Could not send you a DM! Please enable DMs from server members and try again.'
      });
    }

  } catch (error) {
    console.error('❌ Error executing dm-private-key command:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while retrieving your private key. Please try again later.' 
    });
  }
}

// Emergency lockdown command (admin only)
export const emergencyLockdownCommand = new SlashCommandBuilder()
  .setName('emergency-lockdown')
  .setDescription('🚨 EMERGENCY: Lock down all country channels and re-grant access only to verified users')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeEmergencyLockdown(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ 
      content: '❌ You need Administrator permissions to use this command!', 
      ephemeral: true 
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await serverConfigManager.emergencyChannelLockdown(interaction.guild.id);
    
    await interaction.editReply({ 
      content: '🚨 **EMERGENCY LOCKDOWN COMPLETE!**\n\n' +
               '🔒 All country channels are now HIDDEN from everyone\n' +
               '✅ Only verified users can see their country channel\n' +
               '🛡️ Unverified users cannot see ANY country channels\n\n' +
               '**Channel access is now strictly enforced!**'
    });
    
  } catch (error) {
    console.error('❌ Error during emergency lockdown:', error);
    await interaction.editReply({ 
      content: '❌ Failed to complete emergency lockdown. Please check the bot logs for details.' 
    });
  }
}

// Nuclear lockdown command - immediately mute all unverified users
export const nuclearLockdownCommand = new SlashCommandBuilder()
  .setName('nuclear-lockdown')
  .setDescription('🚨🚨 NUCLEAR: Immediately mute all unverified users and lock ALL channels')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeNuclearLockdown(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ 
      content: '❌ You need Administrator permissions to use this command!', 
      ephemeral: true 
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    
    // Step 1: Create "Muted" role if it doesn't exist
    let mutedRole = guild.roles.cache.find(role => role.name === '🔇 Muted');
    if (!mutedRole) {
      mutedRole = await guild.roles.create({
        name: '🔇 Muted',
        color: 0x808080,
        permissions: [],
        reason: 'Nuclear lockdown - mute unverified users'
      });
    }

    // Step 2: Get all members and check verification status
    const allMembers = await guild.members.fetch();
    let mutedCount = 0;
    let verifiedCount = 0;

    for (const [memberId, member] of allMembers) {
      if (member.user.bot) continue; // Skip bots
      
      const userVerification = await serverConfigManager.getUserVerification(memberId, guild.id);
      
      if (!userVerification || !userVerification.verified || !userVerification.onChainVerified) {
        // MUTE unverified user
        try {
          await member.roles.add(mutedRole);
          mutedCount++;
          console.log(`🔇 MUTED unverified user: ${member.user.username}`);
        } catch (error) {
          console.error(`❌ Failed to mute ${member.user.username}:`, error);
        }
      } else {
        verifiedCount++;
        console.log(`✅ Verified user safe: ${member.user.username} (${userVerification.selectedCountry})`);
      }
    }

    // Step 3: Set muted role permissions for all channels
    const allChannels = guild.channels.cache.filter(channel => channel.isTextBased() && 'permissionOverwrites' in channel);
    for (const [channelId, channel] of allChannels) {
      try {
        if ('permissionOverwrites' in channel) {
          await (channel as any).permissionOverwrites.create(mutedRole, {
            SendMessages: false,
            AddReactions: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            SendMessagesInThreads: false
          });
        }
      } catch (error) {
        console.error(`❌ Failed to set muted permissions in ${(channel as any).name}:`, error);
      }
    }

    // Step 4: Run emergency lockdown as well
    await serverConfigManager.emergencyChannelLockdown(guild.id);

    await interaction.editReply({ 
      content: '🚨🚨 **NUCLEAR LOCKDOWN COMPLETE!** 🚨🚨\n\n' +
               `🔇 **Muted ${mutedCount} unverified users**\n` +
               `✅ **${verifiedCount} verified users safe**\n\n` +
               '🛡️ **Actions Taken:**\n' +
               '• All unverified users muted server-wide\n' +
               '• All country channels hidden from @everyone\n' +
               '• Only verified users can chat\n' +
               '• Channel isolation strictly enforced\n\n' +
               '**Server is now SECURE!**'
    });
    
  } catch (error) {
    console.error('❌ Error during nuclear lockdown:', error);
    await interaction.editReply({ 
      content: '❌ Failed to complete nuclear lockdown. Please check the bot logs for details.' 
    });
  }
}

// Debug command to check wallet mappings (temporary for troubleshooting)
export const debugWalletCommand = new SlashCommandBuilder()
  .setName('debug-wallet')
  .setDescription('Debug: Check your wallet mapping (temporary command)');

export async function executeDebugWallet(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    // Get user verification data
    const userVerification = await serverConfigManager.getUserVerification(userId, guildId);
    
    // Get user wallet mapping
    const userWalletMapping = await databaseManager.getUserMapping(userId);
    
    // Get all wallet mappings for comparison
    const allMappings = await databaseManager.getAllUserMappings();
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🔍 Wallet Mapping Debug Info')
      .addFields(
        { name: '👤 Your Discord ID', value: `\`${userId}\``, inline: true },
        { name: '📋 Username', value: interaction.user.username, inline: true },
        { name: '🗃️ Total Mappings in DB', value: allMappings.length.toString(), inline: true }
      );

    if (userVerification) {
      embed.addFields(
        { name: '✅ Verification Record', value: 'Found', inline: true },
        { name: '📱 Wallet Address (from verification)', value: userVerification.walletAddress ? `\`${userVerification.walletAddress.slice(0, 10)}...${userVerification.walletAddress.slice(-6)}\`` : 'None', inline: true },
        { name: '🔐 Verified Status', value: userVerification.verified ? '✅ Yes' : '❌ No', inline: true }
      );
    } else {
      embed.addFields({ name: '❌ Verification Record', value: 'Not found', inline: false });
    }

    if (userWalletMapping) {
      embed.addFields(
        { name: '✅ Wallet Mapping', value: 'Found', inline: true },
        { name: '🆔 Privy Wallet ID', value: `\`${userWalletMapping.privyWalletId}\``, inline: true },
        { name: '📱 Wallet Address (from mapping)', value: `\`${userWalletMapping.walletAddress.slice(0, 10)}...${userWalletMapping.walletAddress.slice(-6)}\``, inline: true },
        { name: '📅 Mapping Created', value: `<t:${Math.floor(userWalletMapping.createdAt.getTime() / 1000)}:R>`, inline: true }
      );
    } else {
      embed.addFields({ name: '❌ Wallet Mapping', value: 'Not found - this is the problem!', inline: false });
      
      // If verification exists but mapping doesn't, we can try to fix it
      if (userVerification && userVerification.walletAddress) {
        embed.addFields({ 
          name: '🔧 Potential Fix', 
          value: 'You have a verification record but no wallet mapping. This can happen with older accounts. Contact support to fix this.', 
          inline: false 
        });
      }
    }

    // Show some example mappings for comparison
    if (allMappings.length > 0) {
      const exampleMappings = allMappings.slice(0, 3).map((mapping, index) => 
        `${index + 1}. Discord ID: \`${mapping.discordId}\`\n   Privy ID: \`${mapping.privyWalletId}\`\n   Address: \`${mapping.walletAddress.slice(0, 6)}...${mapping.walletAddress.slice(-4)}\``
      ).join('\n\n');
      
      embed.addFields({ 
        name: '📋 Example Mappings in DB', 
        value: exampleMappings || 'No mappings found', 
        inline: false 
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('❌ Error in debug wallet command:', error);
    await interaction.editReply({ 
      content: `❌ Debug error: ${error.message}` 
    });
  }
}
