import { MongoClient } from 'mongodb';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = 'cryptonomads-bot';

async function clearVerificationData() {
    let client;
    
    try {
        // Connect to MongoDB
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('🔗 Connected to MongoDB');
        
        const db = client.db(DB_NAME);
        const collection = db.collection('user_verifications');
        
        // Get count before deletion
        const countBefore = await collection.countDocuments();
        console.log(`📊 Found ${countBefore} user(s) in database`);
        
        if (countBefore === 0) {
            console.log('✅ Database is already empty - nothing to clear');
            return;
        }
        
        // Show users before deletion
        const users = await collection.find({}).toArray();
        console.log('\n👥 Users to be deleted:');
        users.forEach((user, index) => {
            console.log(`${index + 1}. Username: ${user.username} (${user.userId})`);
            console.log(`   UUID: ${user.verifyUuid}`);
            console.log(`   Wallet: ${user.walletAddress}`);
            console.log(`   Status: ${user.verified ? 'Verified' : 'Pending'}`);
        });
        
        // Delete all verification data
        const result = await collection.deleteMany({});
        
        console.log(`\n🗑️ Deleted ${result.deletedCount} user verification record(s)`);
        console.log('✅ Database cleared successfully!');
        console.log('\n🔄 You can now run /verify in Discord to start fresh verification');
        
    } catch (error) {
        console.error('❌ Error clearing verification data:', error);
    } finally {
        if (client) {
            await client.close();
            console.log('🔌 Disconnected from MongoDB');
        }
    }
}

// Run the clearing function
clearVerificationData();
