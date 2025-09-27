// NextJS API Route: app/api/user/[uuid]/route.ts
// Copy this file to your NextJS project

import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = 'cryptonomads-bot';

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

// GET: Fetch user data by UUID
export async function GET(
  request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  try {
    const { uuid } = params;

    if (!uuid) {
      return NextResponse.json(
        { success: false, error: 'UUID is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Looking up user by UUID: ${uuid}`);

    // Connect to MongoDB
    const client = await connectToDatabase();
    const db = client.db(DB_NAME);
    const collection = db.collection('users');

    // Find user by verifyUuid
    const user = await collection.findOne({ verifyUuid: uuid });

    if (!user) {
      console.log(`❌ User not found for UUID: ${uuid}`);
      return NextResponse.json(
        { success: false, error: 'Verification session not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Found user: ${user.username} (${user.discordUserId})`);

    // Return user data
    const userData = {
      discordUserId: user.discordUserId,
      username: user.username,
      walletAddress: user.walletAddress,
      guildId: user.guildId,
      verifyUuid: user.verifyUuid,
      verified: user.verified || false,
      onChainVerified: user.onChainVerified || false,
      country: user.country || null,
      gender: user.gender || null,
      isAdult: user.age18Plus || null,
      ensName: user.ensName || null,
      status: user.verified ? 'completed' : 'pending',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      verifiedAt: user.verifiedAt
    };

    return NextResponse.json({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Update user verification data after Self Protocol verification
export async function PATCH(
  request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  try {
    const { uuid } = params;
    const body = await request.json();

    if (!uuid) {
      return NextResponse.json(
        { success: false, error: 'UUID is required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Updating verification for UUID: ${uuid}`, body);

    // Connect to MongoDB
    const client = await connectToDatabase();
    const db = client.db(DB_NAME);
    const collection = db.collection('users');

    // Find the user first
    const existingUser = await collection.findOne({ verifyUuid: uuid });
    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'Verification session not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
      verifiedAt: new Date(),
      verified: true,
      onChainVerified: true
    };

    // Add verification fields from Self Protocol
    if (body.country) updateData.country = body.country;
    if (body.gender) updateData.gender = body.gender;
    if (typeof body.isAdult === 'boolean') updateData.age18Plus = body.isAdult;
    if (body.txHash) updateData.selfProtocolTxHash = body.txHash;
    if (body.verificationProof) updateData.verificationProof = body.verificationProof;

    // Generate ENS name
    const ensName = `${existingUser.username.toLowerCase()}.0xcryptonomads.eth`;
    updateData.ensName = ensName;

    // Update user in database
    const result = await collection.updateOne(
      { verifyUuid: uuid },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Updated verification for ${existingUser.username}:`, updateData);

    // Return updated user data
    const updatedUser = await collection.findOne({ verifyUuid: uuid });

    return NextResponse.json({
      success: true,
      message: 'Verification updated successfully',
      data: {
        discordUserId: updatedUser.discordUserId,
        username: updatedUser.username,
        walletAddress: updatedUser.walletAddress,
        verified: updatedUser.verified,
        onChainVerified: updatedUser.onChainVerified,
        country: updatedUser.country,
        gender: updatedUser.gender,
        isAdult: updatedUser.age18Plus,
        ensName: updatedUser.ensName,
        verifiedAt: updatedUser.verifiedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating verification:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Example usage in your NextJS frontend:
/*
// GET user data:
const response = await fetch(`/api/user/${uuid}`);
const data = await response.json();

// UPDATE verification:
const response = await fetch(`/api/user/${uuid}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    country: 'India',
    gender: 'male',
    isAdult: true,
    txHash: 'self-protocol-tx-hash',
    verificationProof: {...}
  })
});
*/
