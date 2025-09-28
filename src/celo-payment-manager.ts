import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { privyWalletManager } from './privy-wallet-manager.js';
import { serverConfigManager } from './server-config-manager.js';

dotenv.config();

declare var process: any;

export class CeloPaymentManager {
  private provider: ethers.JsonRpcProvider;
  private celoMainnetRpc: string = 'https://forno.celo.org';
  private celoTestnetRpc: string = 'https://alfajores-forno.celo-testnet.org';
  private serverWalletId: string;

  constructor() {
    // Use testnet for development, mainnet for production
    const useTestnet = process.env.CELO_NETWORK === 'testnet';
    this.provider = new ethers.JsonRpcProvider(useTestnet ? this.celoTestnetRpc : this.celoMainnetRpc);
    this.serverWalletId = process.env.PRIVY_SERVER_WALLET_ID || '';
    
    if (!this.serverWalletId) {
      console.warn('⚠️ No Wallet Set, please kindly verify it  ');
    }
  }

  /**
   * Resolve ENS name to wallet address using the API endpoint
   */
  async resolveENSToAddress(ensName: string): Promise<string | null> {
    try {
      const apiUrl = `http://localhost:3000/resolve/${ensName}`;
      console.log(`🔍 Resolving ENS: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.log(`❌ API returned ${response.status} for ${ensName}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data && data.owner) {
        console.log(`✅ Resolved ${ensName} → ${data.owner}`);
        return data.owner;
      }
      
      console.log(`❌ No owner address found for ENS name: ${ensName}`);
      return null;
    } catch (error) {
      console.error('❌ Error resolving ENS name:', error);
      return null;
    }
  }

  /**
   * Send CELO tokens to an address
   */
  async sendCELO(toAddress: string, amountInCELO: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      if (!this.serverWalletId) {
        return {
          success: false,
          error: 'Server wallet not configured'
        };
      }

      console.log(`💸 Sending ${amountInCELO} CELO to ${toAddress}`);

      // Convert CELO amount to Wei (18 decimals)
      const amountInWei = ethers.parseEther(amountInCELO);

      // Use Privy to send the transaction
      const transactionResult = await privyWalletManager.sendTransaction(
        this.serverWalletId,
        {
          to: toAddress,
          value: amountInWei.toString(),
          gasLimit: '21000'
        },
        '42220' // Celo Mainnet chain ID (use '44787' for testnet)
      );

      if (transactionResult && transactionResult.data.hash) {
        console.log(`✅ CELO sent! TX Hash: ${transactionResult.data.hash}`);
        return {
          success: true,
          txHash: transactionResult.data.hash
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed'
        };
      }

    } catch (error) {
      console.error('❌ Error sending CELO:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Send CELO to user by ENS name (using server wallet)
   */
  async sendCELOByENS(ensName: string, amountInCELO: string): Promise<{
    success: boolean;
    txHash?: string;
    resolvedAddress?: string;
    error?: string;
  }> {
    try {
      // First resolve the ENS name via API
      const resolvedAddress = await this.resolveENSToAddress(ensName);
      
      if (!resolvedAddress) {
        return {
          success: false,
          error: `Could not resolve ENS name: ${ensName}`
        };
      }

      // Send CELO to the resolved address using server wallet
      const result = await this.sendCELO(resolvedAddress, amountInCELO);
      
      return {
        ...result,
        resolvedAddress
      };

    } catch (error) {
      console.error('❌ Error sending CELO by ENS:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Send CELO from user's individual wallet to another address
   */
  async sendCELOFromUserWallet(senderWalletId: string, toAddress: string, amountInCELO: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      console.log(`💸 Sending ${amountInCELO} CELO from user wallet ${senderWalletId} to ${toAddress}`);

      // Convert CELO amount to Wei (18 decimals)
      const amountInWei = ethers.parseEther(amountInCELO);

      // Use Privy to send the transaction from user's wallet
      const transactionResult = await privyWalletManager.sendTransaction(
        senderWalletId,
        {
          to: toAddress,
          value: amountInWei.toString(),
          gasLimit: '21000'
        },
        '42220' // Celo Mainnet chain ID (use '44787' for testnet)
      );

      if (transactionResult && transactionResult.data.hash) {
        console.log(`✅ CELO sent from user wallet! TX Hash: ${transactionResult.data.hash}`);
        return {
          success: true,
          txHash: transactionResult.data.hash
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed'
        };
      }

    } catch (error) {
      console.error('❌ Error sending CELO from user wallet:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Send CELO from user's wallet to another user by ENS name
   */
  async sendCELOFromUserWalletByENS(senderWalletId: string, ensName: string, amountInCELO: string): Promise<{
    success: boolean;
    txHash?: string;
    resolvedAddress?: string;
    error?: string;
  }> {
    try {
      // First resolve the ENS name via API
      const resolvedAddress = await this.resolveENSToAddress(ensName);
      
      if (!resolvedAddress) {
        return {
          success: false,
          error: `Could not resolve ENS name: ${ensName}`
        };
      }

      // Send CELO from user's wallet to the resolved address
      const result = await this.sendCELOFromUserWallet(senderWalletId, resolvedAddress, amountInCELO);
      
      return {
        ...result,
        resolvedAddress
      };

    } catch (error) {
      console.error('❌ Error sending CELO from user wallet by ENS:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Get CELO balance of an address
   */
  async getCELOBalance(address: string): Promise<string | null> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('❌ Error getting CELO balance:', error);
      return null;
    }
  }

  /**
   * Get server wallet balance
   */
  async getServerBalance(): Promise<string | null> {
    try {
      if (!this.serverWalletId) {
        return null;
      }

      // Get server wallet address from Privy
      const walletInfo = await privyWalletManager.getWallet(this.serverWalletId);
      if (!walletInfo || !walletInfo.address) {
        return null;
      }

      return await this.getCELOBalance(walletInfo.address);
    } catch (error) {
      console.error('❌ Error getting server balance:', error);
      return null;
    }
  }
}

export const celoPaymentManager = new CeloPaymentManager();
