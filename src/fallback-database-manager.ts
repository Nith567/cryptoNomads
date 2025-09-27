// Fallback database manager that works with both MongoDB and JSON
import { MongoClient, ServerApiVersion } from 'mongodb';
import { promises as fs } from 'fs';
import path from 'path';

interface UserWalletMapping {
  discordId: string;
  privyWalletId: string;
  walletAddress: string;
  chainType: string;
  createdAt: Date;
}

interface WhaleRole {
  discordId: string;
  hasWhaleRole: boolean;
  lastChecked: Date;
  ethBalance?: string;
}

class FallbackDatabaseManager {
  private client: MongoClient | null = null;
  private isMongoConnected = false;
  private dataDir = './data';
  private usersFile = path.join(this.dataDir, 'users.json');
  private whaleRolesFile = path.join(this.dataDir, 'whale-roles.json');

  constructor() {
    this.initializeFallback();
    this.tryMongoConnection();
  }

  private async initializeFallback() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize JSON files if they don't exist
      try {
        await fs.access(this.usersFile);
      } catch {
        await fs.writeFile(this.usersFile, JSON.stringify([], null, 2));
      }
      
      try {
        await fs.access(this.whaleRolesFile);
      } catch {
        await fs.writeFile(this.whaleRolesFile, JSON.stringify([], null, 2));
      }
      
      console.log('📁 Fallback JSON storage initialized');
    } catch (error) {
      console.error('❌ Failed to initialize fallback storage:', error);
    }
  }

  private async tryMongoConnection() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.log('📁 No MongoDB URI found, using JSON fallback');
      return;
    }

    try {
      this.client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        tls: true,
      });

      await this.client.connect();
      await this.client.db("admin").command({ ping: 1 });
      this.isMongoConnected = true;
      console.log('✅ Connected to MongoDB Atlas');
    } catch (error) {
      console.log('⚠️ MongoDB connection failed, using JSON fallback');
      console.log('Error:', error.message);
      this.client = null;
      this.isMongoConnected = false;
    }
  }

  async connect(): Promise<boolean> {
    if (this.isMongoConnected) return true;
    await this.tryMongoConnection();
    return this.isMongoConnected;
  }

  async ping(): Promise<boolean> {
    if (this.isMongoConnected && this.client) {
      try {
        await this.client.db("admin").command({ ping: 1 });
        return true;
      } catch {
        this.isMongoConnected = false;
        return false;
      }
    }
    return true; // JSON fallback is always "available"
  }

  // User mapping methods
  async createUserMapping(mapping: UserWalletMapping): Promise<boolean> {
    if (this.isMongoConnected && this.client) {
      try {
        const db = this.client.db("discord_bot");
        const collection = db.collection("user_mappings");
        await collection.insertOne(mapping);
        return true;
      } catch (error) {
        console.error('❌ MongoDB createUserMapping failed:', error);
        this.isMongoConnected = false;
      }
    }
    
    // Fallback to JSON
    try {
      const data = await fs.readFile(this.usersFile, 'utf-8');
      const users = JSON.parse(data);
      users.push({
        ...mapping,
        createdAt: mapping.createdAt.toISOString()
      });
      await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
      return true;
    } catch (error) {
      console.error('❌ JSON createUserMapping failed:', error);
      return false;
    }
  }

  async getUserMapping(discordId: string): Promise<UserWalletMapping | null> {
    if (this.isMongoConnected && this.client) {
      try {
        const db = this.client.db("discord_bot");
        const collection = db.collection("user_mappings");
        const result = await collection.findOne({ discordId });
        return result as unknown as UserWalletMapping | null;
      } catch (error) {
        console.error('❌ MongoDB getUserMapping failed:', error);
        this.isMongoConnected = false;
      }
    }
    
    // Fallback to JSON
    try {
      const data = await fs.readFile(this.usersFile, 'utf-8');
      const users = JSON.parse(data);
      const user = users.find((u: any) => u.discordId === discordId);
      if (user && user.createdAt) {
        user.createdAt = new Date(user.createdAt);
      }
      return user || null;
    } catch (error) {
      console.error('❌ JSON getUserMapping failed:', error);
      return null;
    }
  }

  async hasUserMapping(discordId: string): Promise<boolean> {
    const mapping = await this.getUserMapping(discordId);
    return mapping !== null;
  }

  // Whale role methods
  async setWhaleRole(discordId: string, hasRole: boolean, ethBalance?: string): Promise<boolean> {
    const whaleRole: WhaleRole = {
      discordId,
      hasWhaleRole: hasRole,
      lastChecked: new Date(),
      ethBalance
    };

    if (this.isMongoConnected && this.client) {
      try {
        const db = this.client.db("discord_bot");
        const collection = db.collection("whale_roles");
        await collection.replaceOne(
          { discordId },
          whaleRole,
          { upsert: true }
        );
        return true;
      } catch (error) {
        console.error('❌ MongoDB setWhaleRole failed:', error);
        this.isMongoConnected = false;
      }
    }
    
    // Fallback to JSON
    try {
      const data = await fs.readFile(this.whaleRolesFile, 'utf-8');
      const roles = JSON.parse(data);
      const index = roles.findIndex((r: any) => r.discordId === discordId);
      
      const roleData = {
        ...whaleRole,
        lastChecked: whaleRole.lastChecked.toISOString()
      };
      
      if (index >= 0) {
        roles[index] = roleData;
      } else {
        roles.push(roleData);
      }
      
      await fs.writeFile(this.whaleRolesFile, JSON.stringify(roles, null, 2));
      return true;
    } catch (error) {
      console.error('❌ JSON setWhaleRole failed:', error);
      return false;
    }
  }

  async getWhaleRole(discordId: string): Promise<WhaleRole | null> {
    if (this.isMongoConnected && this.client) {
      try {
        const db = this.client.db("discord_bot");
        const collection = db.collection("whale_roles");
        const result = await collection.findOne({ discordId });
        return result as unknown as WhaleRole | null;
      } catch (error) {
        console.error('❌ MongoDB getWhaleRole failed:', error);
        this.isMongoConnected = false;
      }
    }
    
    // Fallback to JSON
    try {
      const data = await fs.readFile(this.whaleRolesFile, 'utf-8');
      const roles = JSON.parse(data);
      const role = roles.find((r: any) => r.discordId === discordId);
      if (role && role.lastChecked) {
        role.lastChecked = new Date(role.lastChecked);
      }
      return role || null;
    } catch (error) {
      console.error('❌ JSON getWhaleRole failed:', error);
      return null;
    }
  }

  async getAllWhaleRoles(): Promise<WhaleRole[]> {
    if (this.isMongoConnected && this.client) {
      try {
        const db = this.client.db("discord_bot");
        const collection = db.collection("whale_roles");
        const results = await collection.find({}).toArray();
        return results as unknown as WhaleRole[];
      } catch (error) {
        console.error('❌ MongoDB getAllWhaleRoles failed:', error);
        this.isMongoConnected = false;
      }
    }
    
    // Fallback to JSON
    try {
      const data = await fs.readFile(this.whaleRolesFile, 'utf-8');
      const roles = JSON.parse(data);
      return roles.map((r: any) => ({
        ...r,
        lastChecked: new Date(r.lastChecked)
      }));
    } catch (error) {
      console.error('❌ JSON getAllWhaleRoles failed:', error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isMongoConnected = false;
    }
  }

  getStatus(): string {
    return this.isMongoConnected ? 'MongoDB' : 'JSON Fallback';
  }
}

export const fallbackDatabaseManager = new FallbackDatabaseManager();
export { UserWalletMapping, WhaleRole };
