import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

// MongoDB connection - replace with your connection string
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
    const collection = db.collection('user_verifications'); // Fixed: Use correct collection name

    // Find user by verifyUuid
    const user = await collection.findOne({ verifyUuid: uuid });

    if (!user) {
      console.log(`❌ No verification session found for UUID: ${uuid}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid verification link',
          message: 'This verification session was not found. Please run /verify in Discord to get a new link.',
          code: 'SESSION_NOT_FOUND'
        },
        { status: 404 }
      );
    }

    console.log(`✅ Found user: ${user.username} (${user.userId})`);

    // Return user data (mapping database field names to frontend expected names)
    const userData = {
      discordUserId: user.userId,        // Database field: userId → Frontend: discordUserId
      username: user.username,
      walletAddress: user.walletAddress,
      guildId: user.guildId,
      verifyUuid: user.verifyUuid,
      verified: user.verified || false,
      onChainVerified: user.onChainVerified || false,
      country: user.selectedCountry || null,  // Database field: selectedCountry
      gender: user.gender || null,
      isAdult: user.isAdult || null,          // Database field: isAdult (not age18Plus)
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
    const collection = db.collection('user_verifications'); // Fixed: Use correct collection name

    // Find the user first
    const existingUser = await collection.findOne({ verifyUuid: uuid });
    if (!existingUser) {
      console.log(`❌ Cannot update - no verification session found for UUID: ${uuid}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid verification session',
          message: 'Cannot update verification - session not found. Please start verification again.',
          code: 'UPDATE_SESSION_NOT_FOUND'
        },
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

    // Add verification fields from Self Protocol (now coming from on-chain data)
    if (body.country) updateData.selectedCountry = body.country;        // Database field: selectedCountry
    if (body.gender) updateData.gender = body.gender;
    if (typeof body.isAdult === 'boolean') updateData.isAdult = body.isAdult;  // Database field: isAdult
    if (body.txHash) updateData.selfProtocolTxHash = body.txHash;
    if (body.verificationProof) updateData.verificationProof = body.verificationProof;
    if (typeof body.onChainVerified === 'boolean') updateData.onChainVerified = body.onChainVerified;

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

    if (!updatedUser) {
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve updated user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification updated successfully',
      data: {
        discordUserId: updatedUser.userId,           // Database field: userId
        username: updatedUser.username,
        walletAddress: updatedUser.walletAddress,
        verified: updatedUser.verified,
        onChainVerified: updatedUser.onChainVerified,
        country: updatedUser.selectedCountry,       // Database field: selectedCountry
        gender: updatedUser.gender,
        isAdult: updatedUser.isAdult,               // Database field: isAdult
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
