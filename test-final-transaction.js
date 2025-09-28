import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testTransaction() {
  console.log('🚀 TESTING TRANSACTION NOW!!!');
  
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const walletId = 'p1ifcnzjbsifim5yrzlxdybo';
  const recipient = '0x742d35Cc6634C0532925a3b8D4fDaE5B05aa2Dd8';
  const amount = '0.012';
  
  // Convert CELO to Wei
  const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, 18)));
  const amountWeiHex = '0x' + amountWei.toString(16);
  
  console.log('💰 Amount:', amount, 'CELO =', amountWeiHex, 'Wei');
  
  const headers = {
    'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
    'privy-app-id': appId,
    'Content-Type': 'application/json'
  };
  
  try {
    const response = await axios.post(
      `https://api.privy.io/v1/wallets/${walletId}/rpc`,
      {
        method: 'eth_sendTransaction',
        caip2: 'eip155:42220', // Celo mainnet
        params: {
          transaction: {
            to: recipient,
            value: amountWeiHex
          }
        }
      },
      { headers }
    );
    
    if (response.data && response.data.data) {
      const txHash = response.data.data;
      const explorerUrl = `https://celoscan.io/tx/${txHash}`;
      
      console.log('🎉 SUCCESS!');
      console.log('🔗 TX Hash:', txHash);
      console.log('🌐 Explorer:', explorerUrl);
    } else {
      console.log('❌ No transaction data returned');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Transaction failed:', error.response?.data || error.message);
  }
}

testTransaction();
