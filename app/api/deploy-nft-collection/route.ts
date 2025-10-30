/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ethers, Log } from "ethers";
import { GelatoRelay, type SponsoredCallRequest } from "@gelatonetwork/relay-sdk";

// Ensure this runs in Node.js runtime for better compatibility with ethers.js
export const runtime = 'nodejs';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS_NFT_ONLY!;
const SUPABASE_URL    = process.env.SUPABASE_URL!;
const SUPABASE_SVC    = process.env.SUPABASE_SERVICE_KEY!;

// Gelato Gas Sponsorship Configuration
const GELATO_API_KEY = process.env.GELATO_API_KEY!;
const GELATO_RELAY_URL = process.env.GELATO_RELAY_URL || "https://api.gelato.digital";
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';

// Gelato Relay SDK instance
const gelatoRelay = new GelatoRelay({ url: GELATO_RELAY_URL });

const FACTORY_ABI = [
  {
    name: "createCollection",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name",            type: "string"  },
          { name: "symbol",          type: "string"  },
          { name: "baseURI",         type: "string"  },
          { name: "maxSupply",       type: "uint256" },
          { name: "mintPrice",       type: "uint256" },
          { name: "royaltyBps",      type: "uint96"  },
          { name: "royaltyReceiver", type: "address" },
          { name: "owner",           type: "address" }
        ]
      }
    ],
    outputs: [{ name: "clone", type: "address" }]
  },
  {
    name: "CollectionDeployed",
    type: "event",
    anonymous: false,
    inputs: [
      { indexed: true,  name: "creator",    type: "address" },
      { indexed: false, name: "collection", type: "address" }
    ]
  }
] as const;

const safeParse = (iface: ethers.Interface, log: Log): ethers.LogDescription | undefined => {
  try {
    return iface.parseLog(log) || undefined;
  } catch {
    return undefined;
  }
};

// Gelato gas sponsorship functions
async function submitGelatoTransaction(target: string, data: string): Promise<string> {
  // Try sponsored call first (requires contract whitelisting)
  try {
    const request: SponsoredCallRequest = {
      chainId: BigInt(84532), // Base Sepolia
      target,
      data,
    };

    const { taskId } = await gelatoRelay.sponsoredCall(request, GELATO_API_KEY);
    return taskId;
  } catch (error: any) {
    if (error.message.includes("Unauthorized sponsored targ")) {
      throw new Error(`Contract not whitelisted for gas sponsorship. Please whitelist contract ${target} in your Gelato dashboard at https://relay.gelato.network/`);
    }
    throw error;
  }
}

async function waitForGelatoTask(taskId: string, timeoutMs: number = 300000): Promise<string> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const taskStatus = await gelatoRelay.getTaskStatus(taskId);
      
      if (taskStatus?.taskState === "ExecSuccess") {
        return taskStatus.transactionHash!;
      }
      
      if (taskStatus?.taskState === "ExecReverted") {
        throw new Error(`Gelato task failed: ${taskStatus.lastCheckMessage || "Unknown error"}`);
      }
      
      if (taskStatus?.taskState === "Cancelled") {
        throw new Error("Gelato task cancelled");
      }
      
      await new Promise(res => setTimeout(res, 2000));
    } catch (error) {
      console.error('Error polling Gelato task:', error);
      await new Promise(res => setTimeout(res, 2000));
    }
  }
  
  throw new Error(`Gelato task polling timed out after ${timeoutMs}ms`);
}


export async function POST(req: NextRequest) {
  try {
    
    // Validate required environment variables
    const requiredEnvVars = {
      NEXT_PUBLIC_FACTORY_ADDRESS_NFT_ONLY: process.env.NEXT_PUBLIC_FACTORY_ADDRESS_NFT_ONLY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      GELATO_API_KEY: process.env.GELATO_API_KEY
    };


    const missingEnvVars = Object.entries(requiredEnvVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingEnvVars.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required environment variables: ${missingEnvVars.join(', ')}`
      }, { status: 500 });
    }

    const {
      name, symbol, description, baseUri,
      maxSupply, mintPrice, royaltyBps,
      royaltyRecipient, ownerAddress
    } = await req.json();


    if (!name || !symbol || !baseUri || !maxSupply || !ownerAddress) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    if (maxSupply < 5 || maxSupply > 1000) {
      return NextResponse.json({ success: false, error: "Max supply must be between 5 and 1000" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid authentication" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles").select("credits").eq("id", user.id).single();

    if (!profile || profile.credits < 20) {
      return NextResponse.json({ success: false, error: "Insufficient credits (need 20)" }, { status: 400 });
    }

    let mintWei, ipfsURL, createCollectionData;
    try {
      mintWei = ethers.parseEther(mintPrice.toString());
      ipfsURL = baseUri.replace("https://gateway.pinata.cloud/ipfs/", "ipfs://");

      // Prepare the transaction data for the relayer
      const factoryInterface = new ethers.Interface(FACTORY_ABI);
      createCollectionData = factoryInterface.encodeFunctionData("createCollection", [{
        name, symbol, baseURI: ipfsURL,
        maxSupply, mintPrice: mintWei,
        royaltyBps, royaltyReceiver: royaltyRecipient,
        owner: ownerAddress
      }]);
    } catch (ethersError) {
      console.error("❌ Ethers operation failed:", ethersError);
      throw ethersError;
    }

    const createTaskId = await submitGelatoTransaction(FACTORY_ADDRESS, createCollectionData);

    // Wait for the transaction hash
    const txHash = await waitForGelatoTask(createTaskId);

    // Wait for transaction confirmation
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const receipt = await provider.waitForTransaction(txHash);
    if (!receipt) {
      return NextResponse.json({
        success: false,
        error: 'Transaction receipt not found'
      }, { status: 502 });
    }

    // Parse event (creator, collection)
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    const iface = factory.interface;
    const parsedLog = receipt.logs.map(l => safeParse(iface, l))
                                  .find(l => l?.name === "CollectionDeployed");
    if (!parsedLog) {
      return NextResponse.json({
        success: false,
        error: "CollectionDeployed event not found"
      }, { status: 502 });
    }
    const collectionAddress: string = (parsedLog!.args as any).collection;

    // Verify the collection owner matches the requested owner
    let onChainOwner: string | undefined;
    try {
      const colAbi = ["function owner() view returns (address)"];
      const collection = new ethers.Contract(collectionAddress, colAbi, provider);
      onChainOwner = await collection.owner();
    } catch (verifyError) {
      console.warn("Unable to verify collection owner", verifyError);
    }

    if (onChainOwner && onChainOwner.toLowerCase() !== ownerAddress.toLowerCase()) {
      console.error(`Collection ownership mismatch. Expected ${ownerAddress}, got ${onChainOwner}`);
      return NextResponse.json({
        success: false,
        error: `Collection ownership mismatch. Expected ${ownerAddress}, got ${onChainOwner}`
      }, { status: 502 });
    }

    // Persist to DB
    const cid = (() => {
      try {
        const [, id] = new URL(baseUri).pathname.split("/ipfs/");
        return id ?? null;
      } catch { return null; }
    })();

    await supabase.from("nft_collections").insert({
      collection_address: collectionAddress.toLowerCase(),
      owner_address:      ownerAddress.toLowerCase(),
      user_id:            user.id,
      name, symbol, description,
      base_uri:   ipfsURL,
      image_uri:  baseUri,
      max_supply: maxSupply,
      mint_price: mintWei.toString(),
      royalty_bps: royaltyBps,
      royalty_recipient: royaltyRecipient.toLowerCase(),
      cid,
      active: true
    });

    await supabase.from("profiles")
      .update({ credits: profile.credits - 20 })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      collectionAddress,
      transactionHash: txHash,
      creditsDeducted: 20,
      message: "NFT collection deployed successfully using Gelato gas sponsorship!"
    });

  } catch (err: any) {
    // eslint-disable-next-line no-console
    return NextResponse.json({ success: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
