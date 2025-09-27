/* import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds
  ] 
});

async function fixServerPermissions() {
  try {
    console.log('🔧 Fixing server permissions...');
    
    // Show available servers
    console.log(`📊 Bot is in ${client.guilds.cache.size} servers:`);
    client.guilds.cache.forEach(guild => {
      console.log(`   ${guild.name} (ID: ${guild.id})`);
    });
    
    // Target specific test servers where we have permissions
    const targetServers = ['tests okx', 'selfdiscordbot', 'ajay__anvesh123\'s server'];
    
    for (const [guildId, guild] of client.guilds.cache) {
      if (!targetServers.includes(guild.name)) {
        console.log(`⏭️ Skipping ${guild.name} (not a target server)`);
        continue;
      }
      
      console.log(`\n📍 Working on server: ${guild.name} (${guild.id})`);
    
    // Create roles if they don't exist
    let verifiedRole = guild.roles.cache.find(role => role.name === 'Verified');
    if (!verifiedRole) {
      verifiedRole = await guild.roles.create({
        name: 'Verified',
        color: 0x00FF00,
        reason: 'CryptoNomads verification system',
        permissions: []
      });
      console.log('✅ Created "Verified" role');
    }
    
    let unverifiedRole = guild.roles.cache.find(role => role.name === 'Unverified');
    if (!unverifiedRole) {
      unverifiedRole = await guild.roles.create({
        name: 'Unverified',
        color: 0xFF0000,
        reason: 'CryptoNomads verification system - no channel access',
        permissions: []
      });
      console.log('✅ Created "Unverified" role');
    }
    
    // Set up channel permissions - KEEP GENERAL ACCESSIBLE, restrict others
    const textChannels = guild.channels.cache.filter(channel => 
      (channel.type === 0 || channel.type === 5) && // TEXT or ANNOUNCEMENT channels
      !channel.name.includes('general') && 
      !channel.name.includes('welcome')
    );
    
    console.log(`🔒 Setting permissions for ${textChannels.size} channels (keeping #general open)...`);
    
    // Make sure general channel is accessible to everyone
    const generalChannel = guild.channels.cache.find(channel => 
      channel.name.includes('general') || channel.name.includes('welcome')
    );
    
    if (generalChannel && 'permissionOverwrites' in generalChannel) {
      try {
        // Allow unverified users to see and use #general (for /verify command)
        await generalChannel.permissionOverwrites.create(unverifiedRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
        console.log(`✅ Made #${generalChannel.name} accessible to unverified users`);
      } catch (permError) {
        console.log(`⚠️ Could not set permissions for #${generalChannel.name}`);
      }
    }
    
    // Restrict all other channels
    for (const [channelId, channel] of textChannels) {
      if ('permissionOverwrites' in channel) {
        try {
          // Deny access to unverified users
          await channel.permissionOverwrites.create(unverifiedRole, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false
          });
          
          // Allow access to verified users
          await channel.permissionOverwrites.create(verifiedRole, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
          
          console.log(`🔒 Restricted access to #${channel.name}`);
        } catch (permError) {
          console.log(`⚠️ Could not set permissions for #${channel.name}:`, permError.message);
        }
      }
    }
    
    console.log('� Note: Existing members will need to run /verify to get the Verified role and access channels.');
    
      console.log(`✅ Permission fix complete for ${guild.name}!`);
    }
    
    console.log('\n🎉 All servers processed! Users now need to verify to access channels.');
    console.log('🔗 Users should run /verify to get access back.');
    
  } catch (error) {
    console.error('❌ Error fixing permissions:', error);
  } finally {
    process.exit(0);
  }
}

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await fixServerPermissions();
});

client.login(process.env.CLIENT_TOKEN);
 */