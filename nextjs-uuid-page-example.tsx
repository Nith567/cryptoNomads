// NextJS Page: app/verification/[uuid]/page.tsx
// This goes in your NextJS verification site

"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { countries, getUniversalLink } from "@selfxyz/core";
import {
  SelfQRcodeWrapper,
  SelfAppBuilder,
  type SelfApp,
} from "@selfxyz/qrcode";

// Types for user data
interface UserData {
  discordUserId: string;
  username: string;
  walletAddress: string;
  guildId: string;
  status: 'pending' | 'completed' | 'failed';
  verified: boolean;
  onChainVerified: boolean;
  country?: string;
  gender?: 'male' | 'female';
  isAdult?: boolean;
  ensName?: string;
}

export default function VerificationPage() {
  const params = useParams();
  const router = useRouter();
  const uuid = params.uuid as string;
  
  // State
  const [linkCopied, setLinkCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [selfApp, setSelfApp] = useState<SelfApp | null>(null);
  const [universalLink, setUniversalLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // User data from Discord bot
  const [userData, setUserData] = useState<UserData | null>(null);
  
  const excludedCountries = useMemo(() => [countries.UNITED_STATES], []);

  // Fetch user data by UUID
  useEffect(() => {
    const fetchUserData = async () => {
      if (!uuid) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/user/${uuid}`);
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          // Handle specific error codes
          if (data.code === 'SESSION_NOT_FOUND') {
            throw new Error('Invalid verification link');
          }
          throw new Error(data.message || data.error || 'Failed to fetch user data');
        }
        
        setUserData(data.data);
        console.log('✅ User data loaded:', data.data);
        
      } catch (err) {
        console.error('❌ Error fetching user data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [uuid]);

  // Initialize Self Protocol app when user data is available
  useEffect(() => {
    if (!userData) return;
    
    try {
      const app = new SelfAppBuilder({
        version: 2,
        appName: "CryptoNomads Verification",
        scope: "cryptonomads-verification",
        endpoint: process.env.NEXT_PUBLIC_SELF_ENDPOINT || "",
        chainID: 11142220, // Celo Sepolia
        logoBase64: "https://i.postimg.cc/mrmVf9hm/self.png",
        userId: userData.walletAddress, // 🔥 Use Privy wallet address as userId
        endpointType: "staging_celo",
        userIdType: "hex", // Ethereum address format
        userDefinedData: userData.discordUserId, // 🔥 Use Discord ID as unique identifier
        disclosures: {
          minimumAge: 18,
          excludedCountries: excludedCountries,
          nationality: true,
          gender: true,
        }
      }).build();

      setSelfApp(app);
      setUniversalLink(getUniversalLink(app as any));
      
      console.log('✅ Self Protocol app initialized with wallet:', userData.walletAddress);
      
    } catch (error) {
      console.error("❌ Failed to initialize Self app:", error);
      setError("Failed to initialize verification app");
    }
  }, [userData, excludedCountries, uuid]);

  // Handle successful verification
  const handleSuccessfulVerification = async (verificationData?: any) => {
    if (!userData || !uuid) return;
    
    try {
      displayToast("🎉 Verification successful! Reading on-chain data...");
      
      // Step 1: Read verification data from smart contract
      const contractData = await readVerificationFromContract(userData.discordUserId);
      
      if (!contractData) {
        throw new Error('Failed to read verification data from smart contract');
      }
      
      console.log('✅ On-chain verification data:', contractData);
      
      // Step 2: Update verification status via your API with on-chain data
      displayToast("📝 Updating Discord with on-chain data...");
      
      const response = await fetch(`/api/user/${uuid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          country: contractData.nationality,
          gender: contractData.gender.toLowerCase(),
          isAdult: contractData.olderthan,
          txHash: 'self-protocol-verification',
          verificationProof: verificationData,
          onChainVerified: true,
          verificationTimestamp: contractData.verificationTimestamp
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update verification');
      }
      
      console.log('✅ Verification updated successfully:', result);
      
      // Show success and redirect
      displayToast(`✅ Welcome ${userData.username}! Gender: ${contractData.gender}, Country: ${contractData.nationality}`);
      
      setTimeout(() => {
        router.push(`/verification/success?uuid=${uuid}`);
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error in verification flow:', error);
      displayToast("❌ Error updating verification. Please try again.");
    }
  };

  // Function to read verification data from smart contract
  const readVerificationFromContract = async (discordId: string) => {
    try {
      // You'll need to implement this based on your Web3 setup
      // This is a placeholder - replace with your actual contract call
      
      const contractAddress = process.env.NEXT_PUBLIC_PROOF_OF_HUMAN_CONTRACT;
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
      
      if (!contractAddress || !rpcUrl) {
        throw new Error('Contract address or RPC URL not configured');
      }

      // Example using ethers.js (you'll need to install: npm install ethers)
      const { ethers } = await import('ethers');
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // ABI for the getVerificationDataByDiscordId function
      const contractABI = [
        "function getVerificationDataByDiscordId(string memory discordId) external view returns (string memory gender, string memory nationality, bool olderthan, address walletAddress, bool isVerified, uint256 verificationTimestamp)"
      ];
      
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      
      // Call the contract function
      const result = await contract.getVerificationDataByDiscordId(discordId);
      
      return {
        gender: result[0],
        nationality: result[1], 
        olderthan: result[2],
        walletAddress: result[3],
        isVerified: result[4],
        verificationTimestamp: Number(result[5])
      };
      
    } catch (error) {
      console.error('❌ Error reading from contract:', error);
      return null;
    }
  };

  const displayToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const copyToClipboard = () => {
    if (!universalLink) return;

    navigator.clipboard
      .writeText(universalLink)
      .then(() => {
        setLinkCopied(true);
        displayToast("📋 Universal link copied to clipboard!");
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
        displayToast("❌ Failed to copy link");
      });
  };

  const openSelfApp = () => {
    if (!universalLink) return;
    window.open(universalLink, "_blank");
    displayToast("📱 Opening Self App...");
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading verification session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !userData) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-lg">
          <div className="text-red-500 text-6xl mb-4">🔗❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Invalid Verification Link</h2>
          <p className="text-gray-600 mb-4">
            {error === 'Invalid verification link' ? 
              'This verification session was not found or has expired.' :
              error || "This verification link is no longer valid."
            }
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-blue-800 mb-2">💡 How to get a new link:</h3>
            <ol className="text-left text-blue-700 text-sm space-y-1">
              <li>1. Go back to your Discord server</li>
              <li>2. Run the <code className="bg-blue-100 px-1 rounded">/verify</code> command</li>
              <li>3. Click the new verification link</li>
            </ol>
          </div>
          <div className="flex gap-2 justify-center">
            <button 
              onClick={() => window.close()}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 text-sm"
            >
              Close Tab
            </button>
            <button 
              onClick={() => window.location.href = '/'}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
      {/* Header with Discord Info */}
      <div className="mb-6 md:mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-800">
          🔐 CryptoNomads Verification
        </h1>
        <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
          <p className="text-sm text-gray-600 mb-2">Verifying Discord User:</p>
          <p className="font-bold text-lg text-blue-600">@{userData.username}</p>
          <p className="text-xs text-gray-500 mt-1">ID: {userData.discordUserId}</p>
        </div>
        <p className="text-sm sm:text-base text-gray-600 px-2">
          Scan QR code with Self Protocol App to verify your identity
        </p>
      </div>

      {/* Main Verification Content */}
      <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 w-full max-w-xs sm:max-w-sm md:max-w-md mx-auto">
        <div className="flex justify-center mb-4 sm:mb-6">
          {selfApp ? (
            <SelfQRcodeWrapper
              selfApp={selfApp}
              onSuccess={handleSuccessfulVerification}
              onError={(error) => {
                console.error('Self Protocol error:', error);
                displayToast("❌ Verification failed. Please try again.");
              }}
            />
          ) : (
            <div className="w-[256px] h-[256px] bg-gray-200 animate-pulse flex items-center justify-center">
              <p className="text-gray-500 text-sm">Loading QR Code...</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2 mb-4 sm:mb-6">
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!universalLink}
            className="flex-1 bg-gray-800 hover:bg-gray-700 transition-colors text-white p-2 rounded-md text-sm sm:text-base disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {linkCopied ? "📋 Copied!" : "📋 Copy Link"}
          </button>

          <button
            type="button"
            onClick={openSelfApp}
            disabled={!universalLink}
            className="flex-1 bg-blue-600 hover:bg-blue-500 transition-colors text-white p-2 rounded-md text-sm sm:text-base mt-2 sm:mt-0 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            📱 Open Self App
          </button>
        </div>

        {/* Wallet Address Display */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <span className="text-gray-500 text-xs uppercase tracking-wide">
            🏦 Privy Wallet Address
          </span>
          <div className="bg-gray-100 rounded-md px-3 py-2 w-full text-center break-all text-sm font-mono text-gray-800 border border-gray-200">
            {userData.walletAddress}
          </div>
        </div>

        {/* Verification Status */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Status:</span>
            <span className={`font-medium ${userData.verified ? 'text-green-600' : 'text-orange-600'}`}>
              {userData.verified ? '✅ Verified' : '⏳ Pending'}
            </span>
          </div>
          {userData.country && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-600">Country:</span>
              <span className="font-medium">{userData.country}</span>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white py-3 px-4 rounded-lg shadow-lg animate-fade-in text-sm max-w-sm">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
