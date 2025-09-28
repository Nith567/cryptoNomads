import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

declare var process: any;

interface PrivyWallet {
  id: string;
  address: string;
  chain_type: string;
  created_at: number;
}

interface PrivyTransactionResult {
  method: string;
  data: {
    hash: string;
    caip2: string;
    transaction_id: string;
  };
}

export class PrivyWalletManager {
  private appId: string;
  private appSecret: string;
  private baseUrl: string = 'https://api.privy.io';

  constructor() {
    this.appId = process.env.PRIVY_APP_ID || '';
    this.appSecret = process.env.PRIVY_APP_SECRET || '';
    
    if (!this.appId || !this.appSecret) {
      throw new Error('Missing Privy credentials. Please set PRIVY_APP_ID and PRIVY_APP_SECRET in your .env file.');
    }
  }

  private getAuthHeaders() {
    const credentials = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`,
      'privy-app-id': this.appId,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a new wallet for a Discord user
   * Note: We track Discord ID -> wallet mapping in our own MongoDB database
   */
  async createWallet(discordId: string, chainType: string = 'ethereum'): Promise<PrivyWallet | null> {
    try {
      console.log(`🔑 Creating new Privy wallet for Discord ID: ${discordId}`);

      const response = await axios.post(
        `${this.baseUrl}/v1/wallets`,
        {
          chain_type: chainType
          // Note: Privy API doesn't support metadata in wallet creation
          // We'll track Discord ID -> wallet mapping in our own database
        },
        { headers: this.getAuthHeaders() }
      );

      console.log(`✅ Created new wallet for Discord ID ${discordId}: ${response.data.address}`);
      return response.data;
    } catch (error) {
      console.error('Error creating Privy wallet:', error);
      if (error.response) {
        console.error('Privy API response:', error.response.data);
      }
      return null;
    }
  }

  /**
   * Get wallet by Discord ID (searches through wallet metadata)
   */
  async getWalletByDiscordId(discordId: string): Promise<PrivyWallet | null> {
    try {
      // List all wallets and find one with matching Discord ID
      const wallets = await this.listWallets(100); // Get more wallets to search
      
      for (const wallet of wallets) {
        // Check if this wallet has Discord ID metadata
        // Note: This is a simple approach. In production, you'd want a more efficient lookup
        const walletDetails = await this.getWallet(wallet.id);
        if (walletDetails && (walletDetails as any).metadata?.discord_id === discordId) {
          return walletDetails;
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding wallet by Discord ID:', error);
      return null;
    }
  }

  /**
   * Get wallet by Privy wallet ID
   */
  async getWallet(walletId: string): Promise<PrivyWallet | null> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/wallets/${walletId}`,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting Privy wallet:', error);
      return null;
    }
  }

  /**
   * List all wallets (with pagination)
   */
  async listWallets(limit: number = 50): Promise<PrivyWallet[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/wallets?limit=${limit}`,
        { headers: this.getAuthHeaders() }
      );

      return response.data.data || [];
    } catch (error) {
      console.error('Error listing Privy wallets:', error);
      return [];
    }
  }

  /**
   * Send a transaction
   */
  async sendTransaction(
    walletId: string,
    transactionData: {
      to: string;
      data?: string;
      value?: string;
      gasLimit?: string;
      gasPrice?: string;
    },
    chainId: string = '1'
  ): Promise<PrivyTransactionResult | null> {
    try {
      const caip2 = `eip155:${chainId}`;
      
      // Format transaction data for Privy API
      const formattedTransaction: any = {
        to: transactionData.to
      };

      // Add data if provided
      if (transactionData.data) {
        formattedTransaction.data = transactionData.data;
      }

      // Add value in hex format if provided
      if (transactionData.value) {
        // Convert to hex if it's a decimal string
        const valueStr = transactionData.value;
        if (valueStr.startsWith('0x')) {
          formattedTransaction.value = valueStr;
        } else {
          // Convert decimal to hex
          const valueInt = BigInt(valueStr);
          formattedTransaction.value = '0x' + valueInt.toString(16);
        }
      }

      // Note: Privy doesn't accept gasLimit or gasPrice fields
      // The network will estimate gas automatically
      
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'eth_sendTransaction',
          caip2: caip2,
          chain_type: 'ethereum',
          params: {
            transaction: formattedTransaction
          }
        },
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      if (error.response && error.response.data) {
        console.error('Privy error response:', JSON.stringify(error.response.data, null, 2));
      }
      return null;
    }
  }

  /**
   * Sign a message
   */
  async signMessage(
    walletId: string,
    message: string,
    encoding: string = 'utf-8'
  ): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'personal_sign',
          params: {
            message: message,
            encoding: encoding
          }
        },
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error signing message:', error);
      return null;
    }
  }



  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/transactions/${transactionId}`,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting transaction status:', error);
      return null;
    }
  }

  /**
   * Get wallet private key (use with caution!)
   */
  async getWalletPrivateKey(walletId: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {

          method: 'eth_exportPrivateKey',
          params: {}
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data && response.data.data) {
        return response.data.data;
      }

      return null;
    } catch (error) {
      console.error('Error getting private key:', error);
      return null;
    }
  }

  /**
   * Get CELO balance for a wallet
   */
  async getCeloBalance(walletId: string, chainId: string = '42220'): Promise<{
    balance: string;
    error?: string;
  }> {
    try {
      console.log(`💰 Getting balance for wallet ${walletId} on chain ${chainId}`);
      
      // Skip Privy balance API (doesn't work) - go directly to external RPC
      const wallet = await this.getWallet(walletId);
      if (!wallet) {
        return { balance: '0', error: 'Wallet not found' };
      }

      console.log(`🔍 Wallet address: ${wallet.address}`);
      
      // Use external Celo RPC directly
      const celoRpc = 'https://forno.celo.org';
      const balanceResponse = await axios.post(celoRpc, {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [wallet.address, 'latest'],
        id: 1
      });

      if (balanceResponse.data && balanceResponse.data.result) {
        const balanceWei = balanceResponse.data.result;
        const balanceCelo = (parseInt(balanceWei, 16) / Math.pow(10, 18)).toFixed(6);
        console.log(`✅ Balance retrieved: ${balanceCelo} CELO`);
        return { balance: balanceCelo };
      }

      return { balance: '0', error: 'Could not get balance from RPC' };
    } catch (error) {
      console.error('Error getting CELO balance:', error);
      return { balance: '0', error: error.response?.data?.error || error.message || 'Unknown error' };
    }
  }

  /**
   * Send CELO tokens to an address
   */
  async sendCeloTokens(
    walletId: string, 
    recipientAddress: string, 
    amountCelo: string, 
    chainId: string = '42220'
  ): Promise<{
    success: boolean;
    txHash?: string;
    explorerUrl?: string;
    gasUsed?: string;
    blockNumber?: string;
    error?: string;
  }> {
    try {
      console.log(`💸 Sending ${amountCelo} CELO from wallet ${walletId} to ${recipientAddress}`);

      // Get wallet details first
      const wallet = await this.getWallet(walletId);
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      // Convert CELO to Wei (18 decimals)
      const amountWei = BigInt(Math.floor(parseFloat(amountCelo) * Math.pow(10, 18)));
      const amountWeiHex = '0x' + amountWei.toString(16);

      console.log(`💰 Sending ${amountCelo} CELO (${amountWeiHex} Wei) to ${recipientAddress}`);

      // Use the correct Privy API format for eth_sendTransaction
      const response = await axios.post(
        `${this.baseUrl}/v1/wallets/${walletId}/rpc`,
        {
          method: 'eth_sendTransaction',
          caip2: `eip155:${chainId}`, // Celo mainnet
          params: {
            transaction: {
              to: recipientAddress,
              value: amountWeiHex
            }
          }
        },
        { headers: this.getAuthHeaders() }
      );

      if (response.data && response.data.data) {
        // Extract hash from response data object
        const responseData = response.data.data;
        console.log(`📋 Full Privy response data:`, JSON.stringify(responseData, null, 2));
        
        // Try different ways to extract the hash
        let txHash = null;
        if (typeof responseData === 'string') {
          txHash = responseData;
        } else if (responseData.hash) {
          txHash = responseData.hash;
        } else if (responseData.transaction_id) {
          txHash = responseData.transaction_id;
        } else if (responseData.txHash) {
          txHash = responseData.txHash;
        } else {
          console.error('❌ Could not find transaction hash in response:', responseData);
          txHash = 'unknown';
        }
        
        const explorerUrl = `https://celoscan.io/tx/${txHash}`;
        
        console.log(`✅ CELO sent! TX Hash: ${txHash}`);
        
        return {
          success: true,
          txHash: txHash.toString(), // Ensure it's a string
          explorerUrl,
          gasUsed: '21000', // Standard gas for simple transfer
          blockNumber: 'Pending'
        };
      }

      return {
        success: false,
        error: 'Transaction failed - no data returned'
      };

    } catch (error) {
      console.error('Error sending CELO tokens:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Unknown error'
      };
    }
  }
}

export const privyWalletManager = new PrivyWalletManager();
