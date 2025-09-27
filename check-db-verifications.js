import { MongoClient } from 'mongodb';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = 'cryptonomads-bot';

async function checkDatabaseVerifications() {
    let client;
    
    try {
        // Connect to MongoDB
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('🔗 Connected to MongoDB');
        
        const db = client.db(DB_NAME);
        const collection = db.collection('user_verifications');
        
        // Get all users from the database
        const allUsers = await collection.find({}).toArray();
        
        console.log('\n📊 DATABASE VERIFICATION SUMMARY');
        console.log('=====================================');
        console.log(`Total users in database: ${allUsers.length}\n`);
        
        if (allUsers.length === 0) {
            console.log('❌ No users found in database');
            return;
        }
        
        // Categorize users by verification status
        const verified = allUsers.filter(user => user.verified === true);
        const unverified = allUsers.filter(user => !user.verified || user.verified === false);
        const onChainVerified = allUsers.filter(user => user.onChainVerified === true);
        
        console.log(`✅ Verified users: ${verified.length}`);
        console.log(`⏳ Unverified users: ${unverified.length}`);
        console.log(`🔗 On-chain verified users: ${onChainVerified.length}\n`);
        
        // Show detailed information for each user
        console.log('👥 DETAILED USER LIST');
        console.log('=====================');
        
        allUsers.forEach((user, index) => {
            console.log(`\n${index + 1}. User: ${user.username} (ID: ${user.userId})`);
            console.log(`   Discord User ID: ${user.userId}`);
            console.log(`   Wallet Address: ${user.walletAddress || 'Not set'}`);
            console.log(`   Guild ID: ${user.guildId || 'Not set'}`);
            console.log(`   Verify UUID: ${user.verifyUuid || 'Not set'}`);
            console.log(`   Status: ${user.verified ? '✅ VERIFIED' : '⏳ PENDING'}`);
            console.log(`   On-chain Verified: ${user.onChainVerified ? '✅ YES' : '❌ NO'}`);
            console.log(`   Country: ${user.selectedCountry || user.country || 'Not set'}`);
            console.log(`   Gender: ${user.gender || 'Not set'}`);
            console.log(`   Is Adult: ${user.isAdult !== undefined ? (user.isAdult ? 'Yes' : 'No') : 'Not set'}`);
            console.log(`   ENS Name: ${user.ensName || 'Not set'}`);
            console.log(`   Created At: ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Not set'}`);
            console.log(`   Updated At: ${user.updatedAt ? new Date(user.updatedAt).toLocaleString() : 'Not set'}`);
            console.log(`   Verified At: ${user.verifiedAt ? new Date(user.verifiedAt).toLocaleString() : 'Not set'}`);
            
            if (user.selfProtocolTxHash) {
                console.log(`   Self Protocol TX: ${user.selfProtocolTxHash}`);
            }
        });
        
        // Show verification statistics
        console.log('\n📈 VERIFICATION STATISTICS');
        console.log('===========================');
        
        const usersWithCountry = allUsers.filter(user => user.selectedCountry || user.country);
        const usersWithGender = allUsers.filter(user => user.gender);
        const usersWithAge = allUsers.filter(user => user.isAdult !== undefined);
        const usersWithWallet = allUsers.filter(user => user.walletAddress);
        const usersWithENS = allUsers.filter(user => user.ensName);
        
        console.log(`Users with country data: ${usersWithCountry.length}/${allUsers.length}`);
        console.log(`Users with gender data: ${usersWithGender.length}/${allUsers.length}`);
        console.log(`Users with age data: ${usersWithAge.length}/${allUsers.length}`);
        console.log(`Users with wallet: ${usersWithWallet.length}/${allUsers.length}`);
        console.log(`Users with ENS name: ${usersWithENS.length}/${allUsers.length}`);
        
        // Show countries breakdown
        if (usersWithCountry.length > 0) {
            console.log('\n🌍 COUNTRIES BREAKDOWN');
            console.log('======================');
            const countryCount = {};
            usersWithCountry.forEach(user => {
                const country = user.selectedCountry || user.country;
                countryCount[country] = (countryCount[country] || 0) + 1;
            });
            
            Object.entries(countryCount).forEach(([country, count]) => {
                console.log(`${country}: ${count} user(s)`);
            });
        }
        
        // Show recent activity
        console.log('\n⏰ RECENT ACTIVITY');
        console.log('==================');
        const recentUsers = allUsers
            .filter(user => user.createdAt)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);
            
        if (recentUsers.length > 0) {
            recentUsers.forEach((user, index) => {
                console.log(`${index + 1}. ${user.username} - ${new Date(user.createdAt).toLocaleString()}`);
            });
        } else {
            console.log('No recent activity found');
        }
        
    } catch (error) {
        console.error('❌ Error checking database:', error);
    } finally {
        if (client) {
            await client.close();
            console.log('\n🔌 Disconnected from MongoDB');
        }
    }
}

// Run the check
checkDatabaseVerifications();
