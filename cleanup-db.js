import { MongoClient } from 'mongodb';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = 'cryptonomads-bot';

async function cleanupDatabase() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔗 Connecting to MongoDB...');
    await client.connect();
    
    const db = client.db(DB_NAME);
    
    // Delete all user verifications
    console.log('🧹 Cleaning up user_verifications collection...');
    const userVerificationsResult = await db.collection('user_verifications').deleteMany({});
    console.log(`✅ Deleted ${userVerificationsResult.deletedCount} user verification records`);
    
    // Delete all server configs
    console.log('🧹 Cleaning up server_configs collection...');
    const serverConfigsResult = await db.collection('server_configs').deleteMany({});
    console.log(`✅ Deleted ${serverConfigsResult.deletedCount} server config records`);
    
    // Delete all wallet mappings
    console.log('🧹 Cleaning up wallet_mappings collection...');
    const walletMappingsResult = await db.collection('wallet_mappings').deleteMany({});
    console.log(`✅ Deleted ${walletMappingsResult.deletedCount} wallet mapping records`);
    
    console.log('🎉 Database cleanup complete! Ready for fresh testing.');
    
  } catch (error) {
    console.error('❌ Error cleaning up database:', error);
  } finally {
    await client.close();
    console.log('🔐 Database connection closed');
  }
}

// Run the cleanup
cleanupDatabase().catch(console.error);
