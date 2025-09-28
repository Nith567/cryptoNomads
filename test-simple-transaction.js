import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

class PrivyWalletTester {
  constructor() {
    this.appId = process.env.PRIVY_APP_ID;
    this.appSecret = process.env.PRIVY_APP_SECRET;
    this.baseUrl = 'https://api.privy.io';
  }

  getAuthHeaders() {
    const credentials = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'privy-app-id': this.appId,
      'Content-Type': 'application/json'
    };
  }

  async getCeloBalance(walletId) {
    try {
      console.log(`💰 Getting balance for wallet: ${walletId}`);
      
      // Try Privy's getBalance method
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'getBalance',
          caip2: 'eip155:42220', // Celo mainnet
          currency: 'CELO'
        },
        { headers: this.getAuthHeaders() }
      );

      console.log('Privy balance response:', response.data);
      
      if (response.data && response.data.data) {
        return response.data.data.balance || response.data.data;
      }

      return '0';
    } catch (error) {
      console.log('❌ Privy balance failed, using external RPC...');
      
      // Fallback: External Celo RPC
      try {
        const celoRpc = 'https://forno.celo.org';
        const balanceResponse = await axios.post(celoRpc, {
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: ['0x6a0899aF7528E95492A4252E2639bd630c0a2b7a', 'latest'],
          id: 1
        });

        if (balanceResponse.data && balanceResponse.data.result) {
          const balanceWei = balanceResponse.data.result;
          const balanceCelo = (parseInt(balanceWei, 16) / Math.pow(10, 18)).toFixed(6);
          return balanceCelo;
        }
      } catch (rpcError) {
        console.error('RPC also failed:', rpcError.message);
      }
      
      return '0';
    }
  }

  async sendCeloTokens(walletId, recipientAddress, amountCelo) {
    try {
      console.log(`💸 Sending ${amountCelo} CELO to ${recipientAddress}`);

      // Convert CELO to Wei (18 decimals)
      const amountWei = BigInt(Math.floor(parseFloat(amountCelo) * Math.pow(10, 18)));
      const amountWeiHex = '0x' + amountWei.toString(16);

      console.log(`💰 Amount: ${amountCelo} CELO = ${amountWeiHex} Wei`);

      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'eth_sendTransaction',
          caip2: 'eip155:42220', // Celo mainnet
          params: {
            transaction: {
              to: recipientAddress,
              value: amountWeiHex
            }
          }
        },
        { headers: this.getAuthHeaders() }
      );

      console.log('Transfer response:', response.data);

      if (response.data && response.data.data) {
        const txHash = response.data.data;
        const explorerUrl = `https://celoscan.io/tx/${txHash}`;
        
        return {
          success: true,
          txHash,
          explorerUrl
        };
      }

      return {
        success: false,
        error: 'No transaction data returned'
      };

    } catch (error) {
      console.error('Transfer error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }
}

async function runTransactionTest() {
  console.log('🚀 Testing CELO Transaction...');
  console.log('=' .repeat(50));

  const tester = new PrivyWalletTester();
  const walletId = 'p1ifcnzjbsifim5yrzlxdybo';
  const recipient = '0x742d35Cc6634C0532925a3b8D4fDaE5B05aa2Dd8';
  const amount = '0.012';

  // Step 1: Check balance
  const balance = await tester.getCeloBalance(walletId);
  console.log(`\n💰 Current balance: ${balance} CELO`);

  if (parseFloat(balance) < parseFloat(amount)) {
    console.log('❌ Insufficient balance');
    return;
  }

  // Step 2: Send transaction
  console.log(`\n💸 Sending ${amount} CELO...`);
  const result = await tester.sendCeloTokens(walletId, recipient, amount);

  if (result.success) {
    console.log('\n🎉 SUCCESS!');
    console.log('🔗 TX Hash:', result.txHash);
    console.log('🌐 Explorer:', result.explorerUrl);
  } else {
    console.log('\n❌ Failed:', result.error);
  }

  // Step 3: Check balance again
  console.log('\n💰 Checking final balance...');
  const finalBalance = await tester.getCeloBalance(walletId);
  console.log(`Final balance: ${finalBalance} CELO`);
}

runTransactionTest().catch(console.error);
