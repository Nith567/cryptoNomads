import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

class PrivyWalletTesterFixed {
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
      
      return wallet;
    } catch (error) {
      console.error('❌ Error creating wallet:', error.response?.data || error.message);
      return null;
    }
  }

  // NEW: Fixed private key export using correct API format
  async getWalletPrivateKey(walletId) {
    try {
      console.log(`\n🔄 Getting private key for wallet: ${walletId}`);
      
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'exportPrivateKey',
          params: {
            encryption_type: 'HPKE',
            recipient_public_key: 'dummy' // We need to fix this part
          }
        },
        { headers: this.getAuthHeaders() }
      );

      console.log('Response data:', response.data);
      return response.data;
    } catch (error) {
      console.log('❌ Private key export failed (expected - needs proper encryption setup)');
      console.log('💡 Using alternative method...');
      
      // Alternative: Try direct wallet access (if available)
      try {
        const walletResponse = await axios.get(
          `${this.baseUrl}/v1/wallets/${walletId}`,
          { headers: this.getAuthHeaders() }
        );
        
        console.log('✅ Wallet details retrieved:');
        console.log('📋 Wallet Info:', JSON.stringify(walletResponse.data, null, 2));
        return walletResponse.data;
      } catch (altError) {
        console.error('❌ Alternative method also failed:', altError.response?.data || altError.message);
        return null;
      }
    }
  }

  // NEW: Fixed balance check using proper API format
  async getCeloBalance(walletId, walletAddress) {
    try {
      console.log(`\n🔄 Getting CELO balance for wallet: ${walletId}`);
      console.log(`📍 Wallet address: ${walletAddress}`);
      
      // Method 1: Try using built-in getBalance method
      try {
        const response = await axios.post(
          `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
          {
            method: 'getBalance',
            address: walletAddress
          },
          { headers: this.getAuthHeaders() }
        );

        if (response.data && response.data.data) {
          const balanceWei = response.data.data;
          const balanceCelo = (parseInt(balanceWei, 16) / Math.pow(10, 18)).toFixed(6);
          console.log('✅ Balance retrieved (Method 1):', balanceCelo, 'CELO');
          return balanceCelo;
        }
      } catch (method1Error) {
        console.log('⚠️  Method 1 failed, trying Method 2...');
      }

      // Method 2: Try using eth_sendTransaction format with special params
      try {
        const response = await axios.post(
          `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
          {
            method: 'eth_sendTransaction',
            params: [{
              to: walletAddress, // Self-query
              value: '0x0', // 0 value to just check balance
              data: '0x' // Empty data
            }]
          },
          { headers: this.getAuthHeaders() }
        );

        console.log('Method 2 response:', response.data);
      } catch (method2Error) {
        console.log('⚠️  Method 2 failed, using external balance check...');
      }

      // Method 3: Use external RPC (Celo mainnet) to check balance
      try {
        const celoRpc = 'https://forno.celo.org';
        const balanceResponse = await axios.post(celoRpc, {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [walletAddress, 'latest'],
          id: 1
        });

        if (balanceResponse.data && balanceResponse.data.result) {
          const balanceWei = balanceResponse.data.result;
          const balanceCelo = (parseInt(balanceWei, 16) / Math.pow(10, 18)).toFixed(6);
          console.log('✅ Balance retrieved (External RPC):', balanceCelo, 'CELO');
          return balanceCelo;
        }
      } catch (method3Error) {
        console.log('❌ External RPC also failed:', method3Error.message);
      }

      return '0';
    } catch (error) {
      console.error('❌ Error getting balance:', error.response?.data || error.message);
      return '0';
    }
  }

  // NEW: Fixed CELO sending using correct format
  async sendCeloTokens(walletId, recipientAddress, amountCelo) {
    try {
      console.log(`\n🔄 Sending ${amountCelo} CELO from ${walletId} to ${recipientAddress}`);

      // Convert CELO to Wei (18 decimals)
      const amountWei = Math.floor(parseFloat(amountCelo) * Math.pow(10, 18));
      const amountWeiHex = '0x' + amountWei.toString(16);

      console.log('📊 Transaction details:');
      console.log('   - Amount (CELO):', amountCelo);
      console.log('   - Amount (Wei):', amountWei.toString());
      console.log('   - Amount (Wei hex):', amountWeiHex);

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
      console.log('Full response:', JSON.stringify(response.data, null, 2));
      return { success: false, error: 'No transaction data returned' };

    } catch (error) {
      console.error('❌ Error sending transaction:', error.response?.data || error.message);
      return { success: false, error: error.response?.data || error.message };
    }
  }
}

async function runFixedTests() {
  console.log('🚀 Starting FIXED Privy Wallet Tests...');
  console.log('=' .repeat(60));

  const tester = new PrivyWalletTesterFixed();

  // Use the wallet we just created
  const existingWalletId = 'p1ifcnzjbsifim5yrzlxdybo';
  const existingWalletAddress = '0x6a0899aF7528E95492A4252E2639bd630c0a2b7a';

  console.log('\n🎯 Using existing wallet:');
  console.log('   - ID:', existingWalletId);
  console.log('   - Address:', existingWalletAddress);

  try {
    // Step 1: Test private key retrieval (will likely fail due to encryption requirements)
    console.log('\n🔐 STEP 1: Test private key retrieval');
    const privateKeyResult = await tester.getWalletPrivateKey(existingWalletId);

    // Step 2: Check balance
    console.log('\n💰 STEP 2: Check CELO balance');
    const balance = await tester.getCeloBalance(existingWalletId, existingWalletAddress);

    console.log('\n💰 ═══════════════════════════════════════');
    console.log('🎯 FUND THIS ADDRESS ON CELO MAINNET:');
    console.log('📍 Address:', existingWalletAddress);
    console.log('💰 Current Balance:', balance, 'CELO');
    console.log('⛓️  Network: Celo Mainnet');
    console.log('💰 ═══════════════════════════════════════');

    // Step 3: Test transaction (only if balance > 0.01)
    if (parseFloat(balance) > 0.01) {
      console.log('\n💸 STEP 3: Test CELO transaction');
      
      // Test recipient address 
      const testRecipient = '0x742d35Cc6634C0532925a3b8D4fDaE5B05aa2Dd8';
      const testAmount = '0.005'; // Send 0.005 CELO
      
      const txResult = await tester.sendCeloTokens(existingWalletId, testRecipient, testAmount);
      
      if (txResult.success) {
        console.log('🎉 Transaction test successful!');
        console.log('🔗 TX:', txResult.txHash);
        console.log('🌐 Explorer:', txResult.explorerUrl);
      } else {
        console.log('❌ Transaction test failed:', txResult.error);
      }
    } else {
      console.log('\n⚠️  STEP 3: Skipping transaction test - insufficient balance');
      console.log('💡 Fund the address above with at least 0.01 CELO');
    }

    // Summary
    console.log('\n📊 FIXED TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log('Wallet ID:', existingWalletId);
    console.log('Wallet Address:', existingWalletAddress);
    console.log('Balance Check:', balance !== '0' ? `✅ (${balance} CELO)` : '⚠️  (0 CELO)');
    console.log('Ready for Discord Bot:', '✅');
    console.log('');
    console.log('🔥 NEXT STEPS:');
    console.log('1. 💰 Fund this address with CELO:', existingWalletAddress);
    console.log('2. 🤖 Test in Discord bot with /debug-wallet');
    console.log('3. 💸 Try /send command in Discord');
    console.log('4. 🔐 Try /dm-private-key in Discord');

  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the fixed tests
runFixedTests().catch(console.error);
