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
}

export const privyWalletManager = new PrivyWalletManager();
