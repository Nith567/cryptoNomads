import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

class PrivyWalletTester {
  constructor() {
    this.appId = process.env.PRIVY_APP_ID;
    this.appSecret = process.env.PRIVY_APP_SECRET;
    this.baseUrl = 'https://api.privy.io';
    
    if (!this.appId || !this.appSecret) {
      throw new Error('Missing Privy credentials');
    }
    
    console.log('🔑 Privy App ID:', this.appId);
    console.log('🔐 Privy Secret:', this.appSecret ? 'Set' : 'Missing');
  }

  getAuthHeaders() {
    const credentials = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'privy-app-id': this.appId,
      'Content-Type': 'application/json'
    };
  }

  async createWallet(discordId) {
    try {
      console.log(`\n🔄 Creating wallet for Discord ID: ${discordId}`);
      
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets`,
        {
          chain_type: 'ethereum'
        },
        { headers: this.getAuthHeaders() }
      );

      const wallet = response.data;
      console.log('✅ Wallet created successfully!');
      console.log('📋 Wallet Details:');
      console.log('   - ID:', wallet.id);
      console.log('   - Address:', wallet.address);
      console.log('   - Chain:', wallet.chain_type);
      console.log('   - Created:', new Date(wallet.created_at * 1000).toISOString());
      
      return wallet;
    } catch (error) {
      console.error('❌ Error creating wallet:', error.response?.data || error.message);
      return null;
    }
  }

  async getWalletPrivateKey(walletId) {
    try {
      console.log(`\n🔄 Getting private key for wallet: ${walletId}`);
      
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'eth_exportPrivateKey',
          params: {}
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data && response.data.data) {
        const privateKey = response.data.data;
        console.log('✅ Private key retrieved successfully!');
        console.log('🔑 Private Key:', privateKey);
        return privateKey;
      }

      console.log('❌ No private key data returned');
      return null;
    } catch (error) {
      console.error('❌ Error getting private key:', error.response?.data || error.message);
      return null;
    }
  }

  async getCeloBalance(walletId) {
    try {
      console.log(`\n🔄 Getting CELO balance for wallet: ${walletId}`);
      
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'eth_getBalance',
          params: ['latest']
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data && response.data.data) {
        const balanceWei = response.data.data;
        const balanceCelo = (parseInt(balanceWei, 16) / Math.pow(10, 18)).toFixed(6);
        console.log('✅ Balance retrieved successfully!');
        console.log('💰 Balance:', balanceCelo, 'CELO');
        return balanceCelo;
      }

      console.log('❌ No balance data returned');
      return '0';
    } catch (error) {
      console.error('❌ Error getting balance:', error.response?.data || error.message);
      return '0';
    }
  }

  async sendCeloTokens(walletId, recipientAddress, amountCelo) {
    try {
      console.log(`\n🔄 Sending ${amountCelo} CELO from ${walletId} to ${recipientAddress}`);

      // Convert CELO to Wei (18 decimals)
      const amountWei = Math.floor(parseFloat(amountCelo) * Math.pow(10, 18)).toString(16);
      const amountWeiHex = '0x' + amountWei;

      console.log('📊 Transaction details:');
      console.log('   - Amount (CELO):', amountCelo);
      console.log('   - Amount (Wei hex):', amountWeiHex);
      console.log('   - To address:', recipientAddress);

      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'eth_sendTransaction',
          params: [{
            to: recipientAddress,
            value: amountWeiHex,
            gasLimit: '0x5208' // 21000 in hex
          }]
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data && response.data.data) {
        const txHash = response.data.data;
        const explorerUrl = `https://celoscan.io/tx/${txHash}`;
        
        console.log('✅ Transaction sent successfully!');
        console.log('🔗 Transaction Hash:', txHash);
        console.log('🌐 Explorer URL:', explorerUrl);
        
        return {
          success: true,
          txHash,
          explorerUrl
        };
      }

      console.log('❌ Transaction failed - no data returned');
      return { success: false, error: 'No transaction data returned' };

    } catch (error) {
      console.error('❌ Error sending transaction:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }

  async listWallets() {
    try {
      console.log('\n🔄 Listing all wallets...');
      
      const response = await axios.get(
        `${this.baseUrl}/v1/wallets?limit=50`,
        { headers: this.getAuthHeaders() }
      );

      const wallets = response.data.data || [];
      console.log(`✅ Found ${wallets.length} wallets:`);
      
      wallets.forEach((wallet, index) => {
        console.log(`   ${index + 1}. ID: ${wallet.id}`);
        console.log(`      Address: ${wallet.address}`);
        console.log(`      Chain: ${wallet.chain_type}`);
        console.log(`      Created: ${new Date(wallet.created_at * 1000).toISOString()}`);
        console.log('');
      });

      return wallets;
    } catch (error) {
      console.error('❌ Error listing wallets:', error.response?.data || error.message);
      return [];
    }
  }
}

async function runTests() {
  console.log('🚀 Starting Privy Wallet Tests...');
  console.log('=' .repeat(50));

  const tester = new PrivyWalletTester();
  const testDiscordId = '1234567890123456789'; // Example Discord ID

  try {
    // Step 1: List existing wallets
    console.log('\n📋 STEP 1: List existing wallets');
    const existingWallets = await tester.listWallets();

    // Step 2: Create a new wallet
    console.log('\n🔑 STEP 2: Create new wallet');
    const newWallet = await tester.createWallet(testDiscordId);
    
    if (!newWallet) {
      console.log('❌ Failed to create wallet, stopping tests');
      return;
    }

    // **THIS IS THE ADDRESS TO FUND ON CELO MAINNET** 
    console.log('\n💰 ═══════════════════════════════════════');
    console.log('🎯 FUND THIS ADDRESS ON CELO MAINNET:');
    console.log('📍 Address:', newWallet.address);
    console.log('⛓️  Network: Celo Mainnet');
    console.log('💰 ═══════════════════════════════════════\n');

    // Step 3: Get private key
    console.log('🔐 STEP 3: Get private key');
    const privateKey = await tester.getWalletPrivateKey(newWallet.id);
    
    // Step 4: Check balance
    console.log('💰 STEP 4: Check CELO balance');
    const balance = await tester.getCeloBalance(newWallet.id);

    // Step 5: Test transaction (only if balance > 0)
    if (parseFloat(balance) > 0) {
      console.log('💸 STEP 5: Test CELO transaction');
      
      // Test recipient address (you can change this)
      const testRecipient = '0x742d35Cc6634C0532925a3b8D4fDaE5B05aa2Dd8';
      const testAmount = '0.01'; // Send 0.01 CELO
      
      const txResult = await tester.sendCeloTokens(newWallet.id, testRecipient, testAmount);
      
      if (txResult.success) {
        console.log('🎉 Transaction test successful!');
      } else {
        console.log('❌ Transaction test failed:', txResult.error);
      }
    } else {
      console.log('⚠️  STEP 5: Skipping transaction test - no balance');
      console.log('💡 Fund the address above with CELO and run the test again');
    }

    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('═'.repeat(50));
    console.log('Wallet Created:', newWallet ? '✅' : '❌');
    console.log('Private Key Retrieved:', privateKey ? '✅' : '❌');
    console.log('Balance Check:', balance !== '0' ? `✅ (${balance} CELO)` : '⚠️  (0 CELO)');
    console.log('');
    console.log('🔥 NEXT STEPS:');
    console.log('1. Fund the address above with CELO');
    console.log('2. Run this script again to test transactions');
    console.log('3. Use this wallet ID in your Discord bot:', newWallet.id);

  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the tests
runTests().catch(console.error);
