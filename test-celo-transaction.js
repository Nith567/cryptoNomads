import { PrivyWalletManager } from './src/privy-wallet-manager.js';

async function testCeloTransaction() {
  console.log('🚀 Testing CELO Transaction with Fixed API...');
  console.log('=' .repeat(60));

  const walletManager = new PrivyWalletManager();
  
  // Your funded wallet
  const walletId = 'p1ifcnzjbsifim5yrzlxdybo';
  const walletAddress = '0x6a0899aF7528E95492A4252E2639bd630c0a2b7a';
  
  console.log('\n💰 Step 1: Check current balance');
  const balanceResult = await walletManager.getCeloBalance(walletId, '42220');
  console.log(`Balance: ${balanceResult.balance} CELO`);
  
  if (parseFloat(balanceResult.balance) < 0.012) {
    console.log('❌ Insufficient balance for transaction');
    return;
  }
  
  console.log('\n💸 Step 2: Send 0.012 CELO transaction');
  const recipient = '0x742d35Cc6634C0532925a3b8D4fDaE5B05aa2Dd8'; // Test recipient
  const amount = '0.012';
  
  const txResult = await walletManager.sendCeloTokens(
    walletId,
    recipient,
    amount,
    '42220' // Celo mainnet
  );
  
  if (txResult.success) {
    console.log('\n🎉 TRANSACTION SUCCESSFUL!');
    console.log('🔗 TX Hash:', txResult.txHash);
    console.log('🌐 Explorer:', txResult.explorerUrl);
    console.log('⛽ Gas Used:', txResult.gasUsed);
  } else {
    console.log('\n❌ Transaction failed:', txResult.error);
  }
  
  console.log('\n📊 Final balance check...');
  const finalBalance = await walletManager.getCeloBalance(walletId, '42220');
  console.log(`Final Balance: ${finalBalance.balance} CELO`);
  
  console.log('\n✅ Test complete!');
}

testCeloTransaction().catch(console.error);
