// app/api/nft/erc1155/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { GelatoRelay, type SponsoredCallRequest } from "@gelatonetwork/relay-sdk";

/* ──────────────────────────────────────────────────────────────────────────
   ✅ ABI: must match your deployed Solidity exactly
   - constructor(address mp)
   - createCollection(
       string baseUri,
       string name_,
       string symbol_,
       string description,
       uint256 mintPrice,
       uint256 maxSupply,
       address royaltyRecip,
       uint96  royaltyBps,
       address owner_,
       bytes32[] codeHashes
     ) returns (address)
   - event CollectionDeployed(address indexed creator, address collection, address owner)
   - setMarketplace(address)
   - isCardifyCollection(address) view returns (bool)
   ------------------------------------------------------------------------- */
const erc1155FactoryAbi = [
  {
    inputs: [{ internalType: "address", name: "mp", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "creator", type: "address" },
      { indexed: true, internalType: "address", name: "collection", type: "address" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
    ],
    name: "CollectionDeployed",
    type: "event",
  },
  {
    inputs: [
      { internalType: "string", name: "baseUri", type: "string" },
      { internalType: "string", name: "name_", type: "string" },
      { internalType: "string", name: "symbol_", type: "string" },
      { internalType: "string", name: "description", type: "string" },
      { internalType: "uint256", name: "mintPrice", type: "uint256" },
      { internalType: "uint256", name: "maxSupply", type: "uint256" },
      { internalType: "address", name: "royaltyRecip", type: "address" },
      { internalType: "uint96", name: "royaltyBps", type: "uint96" },
      { internalType: "address", name: "owner_", type: "address" },
      { internalType: "bytes32[]", name: "codeHashes", type: "bytes32[]" },
    ],
    name: "createCollection",
    outputs: [{ internalType: "address", name: "col", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "mp", type: "address" }],
    name: "setMarketplace",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "col", type: "address" }],
    name: "isCardifyCollection",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/* ──────────────────────────────────────────────────────────────────────────
   Types
   ------------------------------------------------------------------------- */
interface GenerateCollectionRequest {
  collectionNumber?: number; // Optional: not used in validation/processing
  name: string;
  symbol: string;
  image: string; // Gateway URL or ipfs://
  description?: string;
  maxSupply: number | string; // Accept number or string (will be normalized)
  royaltyRecipient?: string; // Deprecated - will be set to owner address
  royaltyBps?: number; // default 250 = 2.5%
  ownerAddress: string; // Required: wallet address to set as owner
}

interface GenerateCollectionResponse {
  success: boolean;
  collectionAddress?: string;
  codes?: string[];
  transactionHash?: string;
  error?: string;
  creditsDeducted?: number;
  newCreditBalance?: number | "unknown";
  collection?: {
    address: string;
    name: string;
    symbol: string;
    maxSupply: number;
    active: boolean;
    type: "erc1155";
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Env / Config
   ------------------------------------------------------------------------- */
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  NEXT_PUBLIC_FACTORY_ADDRESS_ERC1155,
  NEXT_PUBLIC_RPC_URL,
  GELATO_API_KEY,
  DEFAULT_ROYALTY_RECIPIENT,
} = process.env;

const RPC_URL =
  NEXT_PUBLIC_RPC_URL ||
  "https://sepolia.base.org"; // Base Sepolia fallback

const FACTORY_ADDRESS = NEXT_PUBLIC_FACTORY_ADDRESS_ERC1155 || "";
const GELATO_RELAY_URL = process.env.GELATO_RELAY_URL || "https://api.gelato.digital";

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

// Initialize Gelato Relay
const gelatoRelay = new GelatoRelay({ url: GELATO_RELAY_URL });

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ------------------------------------------------------------------------- */

// Normalize any gateway URL (or raw CID) to ipfs://CID/
function toIpfsBaseUri(input: string): string {
  // Already ipfs://
  if (input.startsWith("ipfs://")) {
    // ensure trailing slash for base URIs
    return input.endsWith("/") ? input : `${input}/`;
  }
  // If full gateway URL or path, try to pull CID
  const cid = extractCidFromPinataUrl(input);
  if (cid) return `ipfs://${cid}/`;
  // As a last resort, pass through, but base URIs should end with '/'
  return input.endsWith("/") ? input : `${input}/`;
}

// Extract CID from common gateway URLs
function extractCidFromPinataUrl(pinataUrl: string): string | null {
  try {
    if (!pinataUrl.includes("://")) {
      // Maybe the user passed a bare CID
      if (pinataUrl.startsWith("Qm") || pinataUrl.startsWith("bafy")) return pinataUrl;
      return null;
    }
    const url = new URL(pinataUrl);
    // Forms like /ipfs/<cid>/...
    const parts = url.pathname.split("/").filter(Boolean);
    const ipfsIdx = parts.findIndex((p) => p === "ipfs");
    if (ipfsIdx !== -1 && parts[ipfsIdx + 1]) return parts[ipfsIdx + 1];

    // Fallback: last segment looks like a CID
    const last = parts[parts.length - 1];
    if (last && (last.startsWith("Qm") || last.startsWith("bafy"))) return last;

    return null;
  } catch {
    return null;
  }
}

function generateRandomCodes(count: number): string[] {
  const codes: string[] = [];
  const used = new Set<string>();
  while (codes.length < count) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    if (!used.has(code)) {
      used.add(code);
      codes.push(code);
    }
  }
  return codes;
}

// Gelato helper functions
async function submitGelatoTransaction(target: string, data: string): Promise<string> {
  try {
    const request: SponsoredCallRequest = {
      chainId: BigInt(84532), // Base Sepolia
      target,
      data,
    };
    const { taskId } = await gelatoRelay.sponsoredCall(request, GELATO_API_KEY!);
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

function ensureEnv(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_KEY) missing.push("SUPABASE_SERVICE_KEY");
  if (!FACTORY_ADDRESS) missing.push("NEXT_PUBLIC_FACTORY_ADDRESS_ERC1155");
  if (!RPC_URL) missing.push("NEXT_PUBLIC_RPC_URL");
  if (!GELATO_API_KEY) missing.push("GELATO_API_KEY");
  if (!DEFAULT_ROYALTY_RECIPIENT) missing.push("DEFAULT_ROYALTY_RECIPIENT");
  return missing;
}

/* ──────────────────────────────────────────────────────────────────────────
   POST handler
   ------------------------------------------------------------------------- */
export async function POST(
  req: NextRequest
): Promise<NextResponse<GenerateCollectionResponse>> {
  console.log("🚀 [NFT Collection] Starting collection generation...");

  const missing = ensureEnv();
  if (missing.length) {
    return NextResponse.json(
      {
        success: false,
        error: `Missing env: ${missing.join(", ")}`,
      },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as GenerateCollectionRequest;

    console.log("📝 [NFT Collection] Raw request body:", body);

    // Strict validation (no truthy/falsy pitfalls)
    const errors: string[] = [];

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("name");

    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    if (!symbol) errors.push("symbol");

    const image = typeof body.image === "string" ? body.image.trim() : "";
    if (!image) errors.push("image");

    const description = typeof body.description === "string" ? body.description : "";

    let maxSupplyNum: number | null = null;
    if (typeof body.maxSupply === "number") {
      maxSupplyNum = body.maxSupply;
    } else if (typeof body.maxSupply === "string" && body.maxSupply.trim() !== "") {
      const n = Number(body.maxSupply);
      if (!Number.isNaN(n)) maxSupplyNum = n;
    }
    if (maxSupplyNum === null || !Number.isInteger(maxSupplyNum) || maxSupplyNum <= 0) {
      errors.push("maxSupply (positive integer)");
    }

    // Get ownerAddress: try ownerAddress first, then royaltyRecipient, then DEFAULT_ROYALTY_RECIPIENT
    let ownerAddress: string | null = null;
    const ownerAddressRaw = typeof body.ownerAddress === "string" ? body.ownerAddress.trim() : "";
    const royaltyRecipientRaw = typeof body.royaltyRecipient === "string" ? body.royaltyRecipient.trim() : "";
    
    // Try ownerAddress first, then fallback to royaltyRecipient, then env default
    const addressToValidate = ownerAddressRaw || royaltyRecipientRaw || DEFAULT_ROYALTY_RECIPIENT || "";
    
    try {
      if (addressToValidate) {
        ownerAddress = ethers.getAddress(addressToValidate);
      } else {
        errors.push("ownerAddress");
      }
    } catch {
      errors.push("ownerAddress (valid checksum or hex address)");
    }

    const royaltyBps = (() => {
      const v = body.royaltyBps ?? 250;
      if (typeof v !== "number" || v < 0 || v > 10_000) {
        if (typeof v === "number") errors.push("royaltyBps (0..10000)");
        return 250;
      }
      return v;
    })();

    if (errors.length) {
      return NextResponse.json(
        { success: false, error: `Missing/invalid: ${errors.join(", ")}` },
        { status: 400 }
      );
    }

    /* ── Auth: Bearer Supabase JWT ─────────────────────────────────────── */
    console.log("🔐 [NFT Collection] Checking authentication...");
    const authHeader = req.headers.get("authorization");
    console.log("🔑 [NFT Collection] Auth header present:", !!authHeader);

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    console.log("👤 [NFT Collection] User authenticated:", !!user, "Error:", authError?.message);
    if (!user || authError) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    /* ── Credits check ─────────────────────────────────────────────────── */
    console.log("💰 [NFT Collection] Checking user credits...");
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    console.log("💳 [NFT Collection] Profile data:", {
      credits: profile?.credits,
      error: profileError?.message,
    });

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "User profile not found" },
        { status: 404 }
      );
    }

    const requiredCredits = 10;
    console.log("💵 [NFT Collection] Credit check:", {
      userCredits: profile.credits,
      required: requiredCredits,
    });

    if (profile.credits < requiredCredits) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. You need ${requiredCredits} credits for NFT generation.`,
        },
        { status: 400 }
      );
    }

    /* ── Chain setup ───────────────────────────────────────────────────── */
    console.log("🔗 [NFT Collection] Setting up blockchain connection...");
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Verify factory address has code (catch wrong network / bad address)
    const code = await provider.getCode(FACTORY_ADDRESS);
    if (!code || code === "0x") {
      return NextResponse.json(
        {
          success: false,
          error: `No code at FACTORY_ADDRESS (${FACTORY_ADDRESS}) on current RPC; check network/env.`,
        },
        { status: 500 }
      );
    }

    /* ── Build call args with CORRECT ORDER ─────────────────────────────── */
    // Use normalized/parsed values from here on:
    // Convert any gateway URL to base ipfs://CID/
    const baseUri = toIpfsBaseUri(image); // ensure trailing "/"
    const name_ = name;
    const symbol_ = symbol;
    const mintPriceWei = BigInt(0); // free mints as per your spec
    const maxSupply = BigInt(maxSupplyNum!);
    // Set royalty recipient to owner address automatically
    const royaltyRecip = ownerAddress!;

    console.log("🏭 [NFT Collection] Factory address:", FACTORY_ADDRESS);
    console.log("📋 [NFT Collection] Collection params:", {
      baseUri,
      name: name_,
      symbol: symbol_,
      description,
      mintPriceWei: mintPriceWei.toString(),
      maxSupply: maxSupply.toString(),
      royaltyRecip,
      royaltyBps,
      ownerAddress,
    });

    // Generate codes BEFORE deployment (needed for createCollection)
    console.log("🎲 [NFT Collection] Generating codes...");
    const codes = generateRandomCodes(maxSupplyNum!);
    const hashes = codes.map((c) => ethers.keccak256(ethers.toUtf8Bytes(c)));
    console.log("🔐 [NFT Collection] Generated", codes.length, "codes with hashes");

    /* ── Execute tx with Gelato ─────────────────────────────────────────── */
    console.log("📄 [NFT Collection] Deploying contract with Gelato...");
    
    // Encode the function call
    const factoryInterface = new ethers.Interface(erc1155FactoryAbi);
    const createCollectionData = factoryInterface.encodeFunctionData("createCollection", [
      baseUri,       // string baseUri
      name_,         // string name_
      symbol_,       // string symbol_
      description,   // string description
      mintPriceWei,  // uint256 mintPrice
      maxSupply,     // uint256 maxSupply
      royaltyRecip,  // address royaltyRecip (set to owner)
      royaltyBps,    // uint96  royaltyBps
      ownerAddress,  // address owner_
      hashes         // bytes32[] codeHashes
    ]);

    // Submit to Gelato
    const createTaskId = await submitGelatoTransaction(FACTORY_ADDRESS, createCollectionData);
    console.log("⏳ [NFT Collection] Gelato task created:", createTaskId);
    
    // Wait for completion
    const txHash = await waitForGelatoTask(createTaskId);
    console.log("✅ [NFT Collection] Transaction confirmed:", txHash);
    
    // Get transaction receipt
    const receipt = await provider.waitForTransaction(txHash);
    if (!receipt) {
      return NextResponse.json({
        success: false,
        error: 'Transaction receipt not found'
      }, { status: 502 });
    }

    // Parse CollectionDeployed event
    let collectionAddress = "";
    try {
      const iface = new ethers.Interface(erc1155FactoryAbi as any);
      for (const log of receipt!.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "CollectionDeployed") {
            collectionAddress = parsed.args.collection as string;
            break;
          }
        } catch {
          // ignore non-matching log
        }
      }
    } catch (e) {
      // fallback: try to read from return (not always available with proxies)
    }

    if (!collectionAddress) {
      // As a fallback, call a view (if you maintain an index) or throw:
      throw new Error("Collection deployment event not found");
    }

    console.log("📍 [NFT Collection] Collection address:", collectionAddress);

    // ✅ Codes are now added during deployment via constructor/InitParams
    // No need for separate addValidCodes call - codes are set atomically during collection creation
    console.log("✅ [NFT Collection] Codes were added during collection deployment");

    /* ── DB writes ──────────────────────────────────────────────────────── */
    const pinataCid = extractCidFromPinataUrl(image);
    // Convert image URI to ipfs:// format for consistency
    const imageUriIpfs = toIpfsBaseUri(image); // This returns ipfs://cid/ format
    
    console.log("💾 [NFT Collection] Storing collection in database...", {
      address: collectionAddress.toLowerCase(),
      name: name_,
      symbol: symbol_,
      maxSupply: maxSupplyNum,
      cid: pinataCid,
      baseUri: baseUri,
      imageUri: imageUriIpfs,
      active: true,
    });

    const { error: collectionError } = await supabaseAdmin.from("collections").insert({
      address: collectionAddress.toLowerCase(),
      owner: user.id,
      cid: pinataCid,
      collection_type: "erc1155",
      name: name_,
      symbol: symbol_,
      description: description,
      max_supply: maxSupplyNum!,
      mint_price: 0,
      image_uri: imageUriIpfs, // Save as ipfs://cid/ format
      base_uri: baseUri, // normalized ipfs://cid/ format (already correct)
      royalty_recipient: royaltyRecip, // Set to owner address
      royalty_bps: royaltyBps,
      active: true,
      created_at: new Date().toISOString(),
    });

    if (collectionError) {
      return NextResponse.json(
        { success: false, error: "Failed to store collection in database" },
        { status: 500 }
      );
    }

    // Store codes if you use codes on frontend later
    try {
      const codesRows = codes.map((code, i) => ({
        collection_address: collectionAddress.toLowerCase(),
        code,
        hash: hashes[i],
        used: false,
        used_by: null,
        used_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      const { error: codesError } = await supabaseAdmin
        .from("collection_codes")
        .insert(codesRows);
      if (codesError) {
        console.log("⚠️ [NFT Collection] Error storing codes:", codesError.message);
      }
    } catch (e) {
      console.log("⚠️ [NFT Collection] Skipping code rows:", (e as Error)?.message);
    }

    // Deduct credits
    const { error: creditError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: profile.credits - requiredCredits })
      .eq("id", user.id);

    if (creditError) {
      return NextResponse.json(
        { success: false, error: "Failed to deduct credits" },
        { status: 500 }
      );
    }

    // Verify credits
    const { data: updatedProfile } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      success: true,
      collectionAddress,
      codes,
      transactionHash: txHash,
      creditsDeducted: requiredCredits,
      newCreditBalance: updatedProfile?.credits ?? "unknown",
      collection: {
        address: collectionAddress,
        name: name_,
        symbol: symbol_,
        maxSupply: Number(maxSupplyNum!),
        active: true,
        type: "erc1155",
      },
      message: "NFT collection deployed successfully using Gelato gas sponsorship!"
    });
  } catch (error) {
    console.error("💥 [NFT Collection] Error generating collection:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
