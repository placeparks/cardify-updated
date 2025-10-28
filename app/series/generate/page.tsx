"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/components/navigation";
import { FlippableCardPreview } from "@/components/flippable-card-preview";
import { CustomCardCheckoutModal } from "@/components/custom-card-checkout-modal";
import { useNavigationVisibility } from "@/hooks/use-navigation-visibility";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  RotateCcw,
  ExternalLink,
  Zap,
  Star,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowDown,
  Wand2,
  ImageIcon,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  X,
  Download,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSupabaseBrowserClient,
  signInWithGoogle,
} from "@/lib/supabase-browser";
import { uploadGeneratedImage, uploadTempReference, deleteTempReference, uploadToSupabase } from "@/lib/supabase-storage";

import { cropImageToAspectRatio } from "@/lib/image-processing";
import { v4 as uuidv4 } from "uuid";
import { track } from "../../../lib/analytics-client"
import { toast } from "@/hooks/use-toast"
import { NFTGenerationOption } from "@/components/nft-generation-option"
import { NFTCollectionForm } from "@/components/nft-collection-form"

const DEVICE_STORAGE_KEY = "cardify.device_id";

/** Return a UUID that stays the same for this browser until local-storage is cleared */
export function getDeviceId(): string {
  // try localStorage first
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (cached) return cached;

    const fresh = uuidv4();
    localStorage.setItem(DEVICE_STORAGE_KEY, fresh);
    return fresh;
  }

  // SSR – just fallback to a random v4 (won’t be persisted)
  return uuidv4();
}

// Frame styles from AI modal
const FRAME_STYLES = [
  {
    id: "none",
    name: "No Frame",
    description: "Pure artwork with no frame elements",
    basePrompt:
      "Create FULL-BLEED artwork with no frame elements. The artwork must extend completely to all four edges of the image with NO borders, NO margins, NO rounded corners - fill the entire image frame edge-to-edge.",
    titleTextPrompt:
      "Overlay the title text directly on the artwork in a bold, readable font with a subtle shadow or glow effect to ensure visibility against the background.",
    additionalTextPrompt:
      "Place additional text in a complementary position with similar styling to maintain readability.",
    bothTextsPrompt:
      "Position the title prominently and the additional text as supporting information, both with effects to ensure visibility against the artwork.",
  },
  {
    id: "pokemon",
    name: "TCG Style",
    description: "Full-art layout with blue capsule and red header",
    basePrompt:
      "Use a Pokémon-style card layout with FULL-BLEED artwork that extends completely to all four edges of the image. NO white borders, NO margins, NO rounded corners - the card fills the entire image frame edge-to-edge. Include a dark red header bar at the top with the card name, a blue stage capsule in the top left corner, HP display in top right, and semi-transparent attack/ability boxes in the lower portion overlaid on the full-bleed artwork.",
    titleTextPrompt:
      "Place the card name in bold white serif font on a dark red rectangular header at the top left. The top right displays HP in bold white text next to a circular energy symbol.",
    additionalTextPrompt:
      "Include attack descriptions in clean white sans-serif font directly over the artwork with semi-transparent boxes. The lower portion includes semi-transparent boxes for weakness, resistance, and retreat symbols.",
    bothTextsPrompt:
      "Place the card name in bold white serif font on a dark red rectangular header at the top left. The top right displays HP in bold white text next to a circular energy symbol. Use the additional text as attack names and descriptions, placed directly over the artwork in bold black text with energy icons to the left. Attack descriptions in clean white sans-serif font. The lower portion includes semi-transparent boxes for weakness, resistance, and retreat symbols. Flavor text appears in a thin, italicized box in the bottom right corner.",
  },
  {
    id: "magic",
    name: "Magic Fantasy",
    description: "Fantasy frame with curved banner and flourishes",
    basePrompt:
      "Use a Magic: The Gathering-inspired card frame with FULL-BLEED artwork extending to all edges. NO borders, NO margins, NO rounded corners - sharp 90-degree corners only. The artwork must fill the entire image from edge to edge. CRITICAL: This is NOT a photograph of a card - the entire image IS the card face. Do not show the card as an object floating in space or on a background. The image boundaries ARE the card boundaries.",
    titleTextPrompt:
      "Place the card name at the top left in a bold serif font, enclosed in a curved, 50% transparent banner. Align mana cost symbols to the top right.",
    additionalTextPrompt:
      "Include a wide, rounded 50% transparent textbox in the lower third that varies in size with the amount of text (should be positioned as far down as it can), containing the text in a legible serif font. Show a power/toughness box in the bottom right corner, clearly visible against the art.",
    bothTextsPrompt:
      "Place the card name at the top left in a bold serif font, enclosed in a curved, 50% transparent banner. Align mana cost symbols to the top right. Include the additional text as a type line (bold) and rules text in a wide, rounded 50% transparent textbox in the lower third that varies in size with the amount of text (should be positioned as far down as it can). Show a power/toughness box in the bottom right corner, clearly visible against the art.",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Style",
    description: "Digital interface with circuit borders and HUD elements",
    basePrompt:
      "Use a full-art digital trading card frame with a high-tech, cyber interface design extending to all image edges. Create THICK, PROMINENT neon-glowing circuit borders forming a solid rectangular frame around the card edges. Add heavy corner connectors with holographic panels. Include bold HUD-style interface elements that create clear frame boundaries. The frame should have substantial visual weight with glowing edges that the character can dramatically break through. NO white space, NO margins, NO rounded corners.",
    titleTextPrompt:
      "Display the character name in bold, all-caps text with digital styling, integrated into the cyber interface.",
    additionalTextPrompt:
      "Include subtitle text in a matching digital font style, positioned to complement the interface design.",
    bothTextsPrompt:
      "Display the title in bold, all-caps text centered near the bottom of the card within the digital interface. Place the additional text as a smaller subtitle below it in matching font style. Integrate both text elements seamlessly with the HUD-style graphical elements and circuit patterns.",
  },
];


// Generator Art Styles
const ART_STYLES = [
  {
    id: "anime",
    name: "Anime Style",
    description: "Pokemon-inspired artwork",
    stylePrompt: "in vibrant anime style, cel-shaded, clean lines, pokemon tcg aesthetic, bright saturated colors, luminous effects, cheerful and energetic mood, dynamic pose"
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Style",
    description: "Futuristic digital aesthetic",
    stylePrompt: "in cyberpunk style, bright neon colors, vivid pink and cyan lights, luminous digital art, glowing holographic effects, colorful LED accents, vibrant futuristic technology, high contrast with bright highlights"
  },
  {
    id: "fantasy",
    name: "Fantasy Style",
    description: "Magic the Gathering inspired",
    stylePrompt: "in epic fantasy style, painterly, vibrant colors, magical glow effects, bright dramatic lighting, colorful spell effects, radiant energy, MTG card art style with vivid palette"
  }
];

// Random character archetypes for Generator
const CHARACTER_ARCHETYPES = [
  // Warriors & Knights
  "a battle-hardened knight with glowing runic armor",
  "a fierce samurai warrior with ethereal cherry blossoms swirling around",
  "a cybernetic gladiator with energy weapons",
  "a valkyrie with radiant wings and divine spear",
  "a ronin with spirit blade and honor tattoos",
  "a crusader with holy fire armor",
  
  // Mages & Wizards
  "a powerful wizard channeling cosmic energy",
  "an elemental sorceress controlling fire and ice",
  "a technomancer hacking reality with digital magic",
  "a necromancer summoning spectral forces",
  "a chaos mage with reality-warping aura",
  "a blood mage with crimson power",
  
  // Creatures & Beasts
  "a majestic dragon with crystalline scales",
  "a mythical phoenix rising from cosmic flames",
  "a biomechanical beast with glowing circuits",
  "a celestial wolf with starry fur",
  "a void kraken with dimensional tentacles",
  "a storm eagle with lightning wings",
  
  // Rogues & Assassins
  "a shadow assassin emerging from darkness",
  "a cyberpunk hacker with holographic displays",
  "a mystic thief with time-bending abilities",
  "a void walker phasing between dimensions",
  "a phantom blade with ghost weapons",
  "a mirror assassin with reflection clones",
  
  // Cyberpunk Specialists (NEW)
  "a biomech symbiote host with living techno-organic armor and adaptive nanite swarms",
  "a cyborg street medic with surgical arm attachments and emergency drone swarm",
  "a gene-spliced courier with raptor legs and optical camouflage skin",
  "a resistance broadcaster with pirate signal equipment and holographic disguises",
  "an underground fight club champion with kinetic absorbing implants",
  "a black market dealer with concealed weapon compartments and crypto displays",
  "a megacorp executive with luxury chrome plating and personal security field",
  "an AI researcher with neural interface crown and quantum processors",
  "an orbital station pilot with zero-g mods and vacuum-sealed armor",
  "a neon graffiti artist with paint-dispensing fingers and AR tag projectors",
  "a cyber-shaman with technomystic implants and digital spirit guides",
  "an underground racer with reflex boosters and vehicle interface ports",
  "a memory thief with neural extraction cables and stolen identity overlays",
  "a drone controller with swarm command interface and surveillance access",
  "a virtual architect with reality-bending gloves and holographic tools",
  "a data smuggler with encrypted storage implants and blackout tech",
  "a corpo assassin with stealth field generator and smart targeting system",
  "a street samurai with monomolecular blade arms and enhanced reflexes",
  "a netrunner with ice breaker implants and daemon summoning ability",
  "a techno-priest with cybernetic third eye and machine communion",
  
  // Fantasy Heroes
  "an ancient tree spirit with bioluminescent features",
  "a cosmic entity made of pure starlight",
  "a steampunk inventor with mechanical companions",
  "an angelic warrior with burning sword",
  "a demon lord with molten armor",
  "a nature guardian with living vines",
  "a time traveler with chronos artifacts",
  "a psychic warrior with mind shields",
  "a dream walker with nightmare powers",
  "a soul reaper with ethereal scythe",
  
  // Mythological
  "a thunder god wielding lightning",
  "a sea deity controlling ocean waves",
  "a forest nymph with magical butterflies",
  "a titan breaking free from chains",
  "a medusa with serpent hair and stone gaze",
  "a minotaur warrior with labyrinth powers",
  
  // Sci-fi
  "a space marine in powered exosuit",
  "an AI construct materializing in physical form",
  "a galactic explorer with alien technology",
  "a mutant with crystalline growths",
  "a void pilot with quantum navigation implants",
  "a xenobiologist with symbiotic alien companion",
  
  // Dark Fantasy
  "a vampire lord with blood magic aura",
  "a lich with soul phylactery floating nearby",
  "a shadow demon with void portals",
  "a plague doctor with toxic miasma",
  "a bone collector with skeleton army",
  "a nightmare fuel with fear incarnate form",
];

// Object/logo trading card styles
const OBJECT_TRADING_CARD_STYLES = [
  "professional trading card design with deep blue to black gradient background, logo with soft white glow and drop shadow, minimalist geometric patterns in corners, premium matte finish effect",
  "modern card style with clean silver to white gradient, logo elevated with subtle 3D effect, thin accent lines, soft particle effects in background, metallic sheen",
  "dark mode trading card with deep black background, logo with neon glow accents, subtle digital noise texture, modern aesthetic"
];

// Transformation archetypes for reference images
const REFERENCE_IMAGE_TRANSFORMATIONS = {
  human: {
    anime: [
      "beast tamer with open-face cap showing hair, mystical creature companion, dynamic action pose with energy effects",
      "magical warrior with flowing hair adorned with ribbons, transformation sequence effects, sparkles, and prismatic magic",
      "mecha pilot in sleek anime-style power armor with transparent visor showing face and hair, energy wings deployed"
    ],
    cyberpunk: [
      "netrunner hacker with neon-colored hair streaks, minimal facial implants, holographic displays, and digital glitch effects",
      "street samurai with stylized cyberpunk hair, LED tattoos on skin (not covering hair), and cyber katana",
      "corporate enforcer with slicked-back hair visible, tactical visor (not helmet), and plasma weapons"
    ],
    fantasy: [
      "planeswalker with glowing hair flowing with magical energy, channeling mana from multiple worlds",
      "archmage with long flowing hair and beard (if applicable), pointed hat pushed back, ancient staff, and swirling magic",
      "dragon lord with hair transformed into flowing scales at the tips, partial draconic features, wings, and fire breath"
    ]
  },
  creature: {
    anime: [
      "legendary beast with energy aura, evolution transformation effects, and elemental powers radiating outward",
      "spirit guardian creature with ethereal form, glowing markings, and mystical energy trails",
      "mecha-enhanced creature with cyber armor plating, energy weapons, and holographic wings"
    ],
    cyberpunk: [
      "cyber-beast with LED strips along body, holographic camouflage, and integrated weapon systems",
      "data construct creature made of pure information, digital glitch effects, and code streams",
      "bio-mechanical hybrid with exposed circuitry, neon blood vessels, and tech-organic fusion"
    ],
    fantasy: [
      "ancient dragon with elemental breath, treasure hoard aura, and reality-bending presence",
      "mythical phoenix with rebirth flames, healing feathers, and immortal essence",
      "dire beast alpha with pack leader aura, primal fury, and territorial dominance"
    ]
  },
  object: {
    anime: [
      "legendary weapon spirit manifested, energy blade extensions, special attack sequences with dramatic effects",
      "cursed artifact awakened, dark energy tendrils, corruption spreading, and sealed power breaking free",
      "divine relic activated, holy light emanating, protective barriers, and miracle granting powers"
    ],
    cyberpunk: [
      "weaponized AI core, holographic interfaces, hack attacks visualized, and system override",
      "black market cyberware, illegal modifications, power surges, and corporate secrets",
      "data blade materialized, information cutting through reality, code streams, and firewall breaker"
    ],
    fantasy: [
      "legendary blade unsheathed, ancient power awakening, destiny calling, and evil's bane",
      "grimoire opening itself, spells casting automatically, knowledge manifesting, and reality rewriting",
      "artifact of power activated, ley lines connecting, mana flowing, and planar convergence"
    ]
  }
};

// Generator frame styles
const FRAME_STYLES_GENERATOR = [
  {
    id: "pokemon",
    name: "Poke Style",
    description: "Full-art layout with blue capsule and red header",
    basePrompt:
      "Use a Pokémon-style card layout with FULL-BLEED artwork that extends completely to all four edges of the image. NO white borders, NO margins, NO rounded corners - the card fills the entire image frame edge-to-edge. Include a dark red header bar at the top with the card name, a blue stage capsule in the top left corner, HP display in top right, and semi-transparent attack/ability boxes in the lower portion overlaid on the full-bleed artwork.",
    titleTextPrompt:
      "Place the card name in bold white serif font on a dark red rectangular header at the top left. The top right displays HP in bold white text next to a circular energy symbol.",
  },
  {
    id: "magic",
    name: "Magic Fantasy",
    description: "Fantasy frame with curved banner and flourishes",
    basePrompt:
      "Use a Magic: The Gathering-inspired card frame with FULL-BLEED artwork extending to all edges. NO borders, NO margins, NO rounded corners - sharp 90-degree corners only. The artwork must fill the entire image from edge to edge. CRITICAL: This is NOT a photograph of a card - the entire image IS the card face. Do not show the card as an object floating in space or on a background. The image boundaries ARE the card boundaries.",
    titleTextPrompt:
      "Place the card name at the top left in a bold serif font, enclosed in a curved, 50% transparent banner. Align mana cost symbols to the top right.",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Style",
    description: "Digital interface with circuit borders and HUD elements",
    basePrompt:
      "Use a full-art digital trading card frame with a high-tech, cyber interface design extending to all image edges. Create THICK, PROMINENT neon-glowing circuit borders forming a solid rectangular frame around the card edges. Add heavy corner connectors with holographic panels. Include bold HUD-style interface elements that create clear frame boundaries. The frame should have substantial visual weight with glowing edges that the character can dramatically break through. NO white space, NO margins, NO rounded corners.",
    titleTextPrompt:
      "Display the character name in bold, all-caps text with digital styling, integrated into the cyber interface.",
  },
  {
    id: "none",
    name: "No Frame",
    description: "Pure artwork with no frame elements",
    basePrompt:
      "Create FULL-BLEED artwork with no frame elements. The artwork must extend completely to all four edges of the image with NO borders, NO margins, NO rounded corners - fill the entire image frame edge-to-edge.",
    titleTextPrompt:
      "Overlay the title text directly on the artwork in a bold, readable font with a subtle shadow or glow effect to ensure visibility against the background.",
  },
];

// Track recently used characters to avoid repeats
let recentCharacters: string[] = [];

// Helper functions for Generator
function getRandomCharacter(): string {
  // Filter out recently used characters (keep last 3)
  const availableCharacters = CHARACTER_ARCHETYPES.filter(
    char => !recentCharacters.includes(char)
  );
  
  // If we've used most characters, reset the recent list
  if (availableCharacters.length < 3) {
    recentCharacters = recentCharacters.slice(-1); // Keep only the most recent
  }
  
  // Use crypto.getRandomValues for better randomness if available
  let index: number;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    index = array[0] % availableCharacters.length;
  } else {
    // Fallback to Math.random with better distribution
    index = Math.floor(Math.random() * Date.now()) % availableCharacters.length;
  }
  
  const selected = availableCharacters[index];
  
  // Add to recent list and maintain max size of 3
  recentCharacters.push(selected);
  if (recentCharacters.length > 3) {
    recentCharacters.shift();
  }
  
  return selected;
}

function getRandomObjectStyle(): string {
  const index = Math.floor(Math.random() * OBJECT_TRADING_CARD_STYLES.length);
  return OBJECT_TRADING_CARD_STYLES[index];
}

function getRandomTransformation(artStyle: string, subjectType: 'transform' | 'character' | 'creature' | 'object'): string {
  const styleKey = artStyle || 'fantasy';
  const mappedType = subjectType === 'transform' || subjectType === 'character' ? 'human' : subjectType;
  const transformations = REFERENCE_IMAGE_TRANSFORMATIONS[mappedType]?.[styleKey as keyof typeof REFERENCE_IMAGE_TRANSFORMATIONS[typeof mappedType]] 
    || REFERENCE_IMAGE_TRANSFORMATIONS[mappedType]?.fantasy 
    || REFERENCE_IMAGE_TRANSFORMATIONS.human.fantasy;
  
  const index = Math.floor(Math.random() * transformations.length);
  return transformations[index];
}

// Generator interfaces
interface PromptFields {
  artStyle: string;
  background: string;
  frameStyle: string;
  titleText: string;
}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: Date;
  purchased: boolean;
}

type ProfileRow = {
  credits: number | null;
  free_generations_used: number | null;
};

const FREE_LIMIT = 1;

export default function AuthenticatedGeneratePage() {
  /* ───────── auth & credits ───────────────── */
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  /* ───────── series auto-linking ───────────────── */
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [seriesType, setSeriesType] = useState<string | null>(null);
  
  /* ───────── NFT+Card linking ───────────────── */
  const [generatedCardId, setGeneratedCardId] = useState<string | null>(null);
  
  useEffect(() => {
    // Check if there's an active series in localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('activeSeries');
      if (stored) {
        try {
          const { seriesId, series_type, timestamp } = JSON.parse(stored);
          console.log('🔍 Series type from localStorage:', series_type);
          // Only use if created within last 10 minutes
          if (Date.now() - timestamp < 600000) {
            setActiveSeriesId(seriesId);
            setSeriesType(series_type || 'physical_only');
            console.log('✅ Series type set to:', series_type || 'physical_only');
          } else {
            localStorage.removeItem('activeSeries');
          }
        } catch (e) {
          localStorage.removeItem('activeSeries');
        }
      }
    }
  }, []);

  /* ── NEW: persistent per-browser id ───────────────────────── */
  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const migrateGuestQuota = async (
    sb: ReturnType<typeof getSupabaseBrowserClient>,
    userId: string,
    deviceId: string,
    row: ProfileRow
  ): Promise<ProfileRow> => {
    /* ── how many freebies this device already burned ── */
    const { data: quota } = await sb
      .from("guest_quotas")
      .select("used")
      .eq("device_id", deviceId)
      .maybeSingle<{ used: number }>();

    const guestUsed = Number(quota?.used ?? 0);
    if (guestUsed === 0) return row;

    // ── merge with the user’s profile ──
    const alreadyUsed = row.free_generations_used ?? 0;
    const combinedUsage = Math.min(FREE_LIMIT, alreadyUsed + guestUsed);

    if (combinedUsage !== alreadyUsed) {
      const { data } = await sb
        .from("profiles") // Updated table name
        .update({ free_generations_used: combinedUsage })
        .eq("id", userId)
        .select("credits, free_generations_used")
        .single<ProfileRow>();

      // wipe the guest-quota row so it cannot be re-merged
      await sb.from("guest_quotas").delete().eq("device_id", deviceId);

      return data ?? row;
    }

    // still wipe even if nothing changed (prevents replay attacks)
    await sb.from("guest_quotas").delete().eq("device_id", deviceId);
    return row;
  };

  /* ──────────────────────────────────────────────────────────────
   auth bootstrap + realtime profile listener
─────────────────────────────────────────────────────────────────*/
useEffect(() => {
  const sb = getSupabaseBrowserClient()
  if (!deviceId) return                

  // bootstrap auth
  sb.auth.getUser().then(({ data }) => {
    setUser(data.user ?? null);
    setAuthChecked(true);
  });
  const { data: authSub } =
    sb.auth.onAuthStateChange((_e, sess) => {
      setUser(sess?.user ?? null);
      setAuthChecked(true);
    });

  return () => authSub.subscription.unsubscribe()
}, [deviceId])

/** NEW effect that actually loads / merges the profile ------ */
useEffect(() => {
  if (!deviceId || !user?.id) return       

  const sb   = getSupabaseBrowserClient()
  let chan: ReturnType<typeof sb.channel> | null = null

  ;(async () => {
    const { data } = await sb
      .from("profiles") // Updated table name
      .select("credits, free_generations_used")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>()

    const merged = await migrateGuestQuota(
      sb,
      user.id,
      deviceId,
      data ?? { credits: 0, free_generations_used: 0 },
    )

    setCredits(Number(merged.credits ?? 0))
    setFreeGenerationsUsed(Number(merged.free_generations_used ?? 0))
    setProfileLoaded(true)

    /* realtime — optional but handy */
    chan = sb.channel(`profile-${user.id}`).on(
      "postgres_changes",
      {
        event:  "UPDATE",
        schema: "public",
        table:  "profiles", // Updated table name
        filter: `id=eq.${user.id}`,
      },
      ({ new: r }) => {
        setCredits(Number((r as ProfileRow).credits ?? 0))
        setFreeGenerationsUsed(Number((r as ProfileRow).free_generations_used ?? 0))
        setProfileLoaded(true)
      }
    ).subscribe()
  })()

  return () => { if (chan) sb.removeChannel(chan) }
}, [deviceId, user?.id])        

  /* ─────────────────────────── guest free quota - 3 ────────────────────────── */

  const [remainingGenerations, setRemainingGenerations] = useState(FREE_LIMIT);

  const freebiesLeftDB = Math.max(0, FREE_LIMIT - freeGenerationsUsed); // ⬅️ NEW
  const guestQuotaLeft = remainingGenerations;
  const paidCreditsLeft = credits;

  const usableCredits =
    paidCreditsLeft + (user ? freebiesLeftDB : guestQuotaLeft);
  // Generation costs 200 credits, so check if user has enough
  const freeGenerationsAvailable = user ? freebiesLeftDB > 0 : guestQuotaLeft > 0;
  const isOutOfCredits = paidCreditsLeft < 200 && !freeGenerationsAvailable;

  useEffect(() => {
    if (typeof window === "undefined" || user) return;
    const saved = Number(
      localStorage.getItem("cardify.freeGens.v1") ?? FREE_LIMIT
    );
    setRemainingGenerations(Math.max(0, saved));
  }, [user]);

  const isOutOfFreeAndLoggedOut = !user && remainingGenerations <= 0;

  /* ─────────────────────────── builder state ──────────────────── */


  const [isGenerating, setIsGenerating] = useState(false);
  // const [showGameModal, setShowGameModal] = useState(false); // Removed - now using integrated game in card preview
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );
  const [generationElapsedTime, setGenerationElapsedTime] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [processedImageBlob, setProcessedImageBlob] = useState<Blob | null>(
    null
  );
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [sessionImages, setSessionImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [isUploadingToDatabase, setIsUploadingToDatabase] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const freeLeft = user ? freebiesLeftDB : remainingGenerations;
  
  // NFT generation state
  const [generateNFT, setGenerateNFT] = useState(false);
  const [showNFTForm, setShowNFTForm] = useState(false);
  const [collectionNumber, setCollectionNumber] = useState(0);
  const [pinataImageUrl, setPinataImageUrl] = useState<string | null>(null);
  
  /* ───────────────────────────── Generator state ───────────────────────────── */
  const [fields, setFields] = useState<PromptFields>({
    artStyle: "anime", // Default to Anime Style
    background: "",
    frameStyle: "pokemon", // Default to TCG/Poke Style
    titleText: "",
  });
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [referenceImageName, setReferenceImageName] = useState<string | null>(null);
  const [subjectType, setSubjectType] = useState<'transform' | 'character' | 'creature' | 'object'>('transform');
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Advanced Options state for Generator
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [mainCharacter, setMainCharacter] = useState("");
  const [additionalText, setAdditionalText] = useState("");
  const [editedPrompt, setEditedPrompt] = useState("");
  const [subtleBreakout, setSubtleBreakout] = useState(false);

  // No longer auto-updating editedPrompt since it's now used for additional instructions only

  /* ─────────────────────────── helper functions ───────────────── */

  // Helper function to create a preview URL for display
  const createPreviewUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };
      reader.readAsDataURL(file);
    });
  };


  // Navigation functions for cycling through generated images
  const handlePreviousImage = () => {
    if (currentImageIndex > 0) {
      const newIndex = currentImageIndex - 1;
      setCurrentImageIndex(newIndex);
      setGeneratedImage(sessionImages[newIndex]);
    }
  };

  const handleNextImage = () => {
    if (currentImageIndex < sessionImages.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      setGeneratedImage(sessionImages[newIndex]);
    }
  };


  const freeQuotaLeft = remainingGenerations;
  
  // Upload image to Pinata for NFT collections using chunked upload
  const uploadToPinata = async (imageUrl: string): Promise<string | null> => {
    try {
      // First, fetch the image to get its data
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch image');
      }
      
      const imageBlob = await imageResponse.blob();
      const file = new File([imageBlob], 'generated-card.jpg', { type: 'image/jpeg' });
      
      // Generate a unique file ID
      const fileId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      // Convert file to base64
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1]; // Remove data URL prefix
            
            // Split into 2MB chunks (to stay under Vercel's limit)
            const chunkSize = 2 * 1024 * 1024; // 2MB
            const chunks = [];
            for (let i = 0; i < base64Data.length; i += chunkSize) {
              chunks.push(base64Data.slice(i, i + chunkSize));
            }

            // Upload chunks
            for (let i = 0; i < chunks.length; i++) {
              const response = await fetch('/api/upload-chunk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chunk: chunks[i],
                  chunkIndex: i,
                  totalChunks: chunks.length,
                  fileId
                })
              });

              if (!response.ok) {
                throw new Error('Chunk upload failed');
              }

              const result = await response.json();
              
              // If this was the last chunk and upload is complete
              if (result.pinataUrl) {
                resolve(result.pinataUrl);
                return;
              }
            }
          } catch (error) {
            console.error('Chunked upload failed:', error);
            reject(error);
          }
        };
        
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('Error uploading to Pinata:', error);
      return null;
    }
  };

  /* REPLACE the whole burnFreeQuota helper */
const burnFreeQuota = async () => {
  if (remainingGenerations <= 0 || !deviceId) return
  
  // Calculate the new remaining value first
  const newRemaining = remainingGenerations - 1;
  const used = FREE_LIMIT - newRemaining;
  
  // Update local state
  setRemainingGenerations(newRemaining);
  localStorage.setItem("cardify.freeGens.v1", String(newRemaining));

  // Update database
  const sb = getSupabaseBrowserClient();
  await sb
    .from("guest_quotas")
    .upsert({
      device_id: deviceId,
      used,
      last_used: new Date().toISOString(),
    });
  };



  /* ─────────── download card ─────────── */
  const handleDownload = async () => {
    const currentImage = sessionImages.length
      ? sessionImages[currentImageIndex]
      : generatedImage;
    if (!currentImage) return;

    try {
      // Fetch the image and convert to blob
      const response = await fetch(currentImage);
      const blob = await response.blob();

      // Crop the image to trading card aspect ratio
      const file = new File([blob], "card.png", { type: blob.type });
      const croppedBlob = await cropImageToAspectRatio(file);

      // Create a download link with the cropped image
      const url = window.URL.createObjectURL(croppedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cardify-card-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL object
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading image:', error);
      setGenerationError('Failed to download image');
    }
  };

  /* ─────────── finalize card ─────────── */
  const handleFinalizeClick = async () => {
    if (!user) return signInWithGoogle("/generate");

    const currentImage = sessionImages.length
      ? sessionImages[currentImageIndex]
      : generatedImage;
    if (!currentImage) return;

    // Check if NFT generation is enabled
    if (generateNFT) {
      // Generate a collection number and show NFT form
      const newCollectionNumber = Math.floor(Math.random() * 1000000) + 1
      setCollectionNumber(newCollectionNumber)
      setShowNFTForm(true)
      return
    }

    /* If the image was already uploaded during generate, simply open checkout. 
     Otherwise (should only happen in edge cases), fall back to upload flow. */
    if (uploadedImageUrl) {
      setShowCheckoutModal(true);
      return;
    }

    setIsUploadingToDatabase(true);
    setUploadError(null);

    try {
      
      // Retry logic for intermittent fetch failures
      let retries = 3;
      let lastError: Error | null = null;
      let blob: Blob | null = null;
      
      while (retries > 0 && !blob) {
        try {
          const response = await fetch(currentImage);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          blob = await response.blob();
        } catch (err) {
          lastError = err as Error;
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
          }
        }
      }
      
      if (!blob) {
        throw lastError || new Error("Failed to fetch image after retries");
      }
      
      const cropped = await cropImageToAspectRatio(
        new File([blob], "card.png", { type: blob.type })
      );
      setProcessedImageBlob(cropped);

      // Use new uploadGeneratedImage function
      const { publicUrl } = await uploadGeneratedImage(
        cropped,
        generatePrompt(),
        {
          frameStyle: fields.frameStyle,
          maintainLikeness: true,
          referenceImage: referenceImageFile ? true : false,
          generationParams: {
            model: "dall-e-3",
            style: fields.frameStyle,
            maintainLikeness: true,
          }
        },
        undefined, // metadata
        undefined, // title
        activeSeriesId ? true : false, // featured if part of series
        activeSeriesId || undefined // seriesId
      );
      
      setUploadedImageUrl(publicUrl ?? null);
      
      // Refresh profile data to update free generations count immediately
      const sb = getSupabaseBrowserClient();
      const { data: updatedProfile } = await sb
        .from("profiles")
        .select("credits, free_generations_used")
        .eq("id", user.id)
        .single();
        

      if (updatedProfile) {
        setCredits(Number(updatedProfile.credits ?? 0));
        setFreeGenerationsUsed(Number(updatedProfile.free_generations_used ?? 0));
      }
      
      setShowCheckoutModal(true);
    } catch (e: any) {
      setUploadError("Failed to prepare image for checkout");
    } finally {
      setIsUploadingToDatabase(false);
    }
  };

  /* ─────────────────────── Generator helper functions ─────────────────── */
  const getVisiblePrompt = () => {
    let visiblePrompt = "";
    
    // Add reference image mode if selected
    if (referenceImageFile) {
      const modeNames = {
        'transform': 'Transform Mode',
        'character': 'Character Mode',
        'creature': 'Creature Mode',
        'object': 'Object Mode'
      };
      visiblePrompt += `• Reference Image: ${referenceImageName || 'Uploaded'} (${modeNames[subjectType]})\n`;
    }
    
    // Add title if provided
    if (fields.titleText) {
      visiblePrompt += `• Card Title: "${fields.titleText}"\n`;
    }
    
    // Add art style if selected
    if (fields.artStyle) {
      const style = ART_STYLES.find(s => s.id === fields.artStyle);
      if (style) {
        visiblePrompt += `• Art Style: ${style.name}\n`;
      }
    }
    
    // Add background if specified
    if (fields.background) {
      visiblePrompt += `• Background: ${fields.background}\n`;
    }
    
    // Add frame style if selected
    if (fields.frameStyle) {
      const frame = FRAME_STYLES_GENERATOR.find(f => f.id === fields.frameStyle);
      if (frame) {
        visiblePrompt += `• Frame Style: ${frame.name}\n`;
      }
    }
    
    // Add advanced fields if they have values
    if (mainCharacter) {
      visiblePrompt += `• Main Character: ${mainCharacter}\n`;
    }
    
    if (additionalText) {
      visiblePrompt += `• Additional Text: "${additionalText}"\n`;
    }
    
    return visiblePrompt.trim() || "Fill in the fields above to generate your prompt...";
  };
  
  const generatePrompt = () => {
    if (!fields.artStyle && !fields.background && !fields.frameStyle && !fields.titleText && !referenceImageFile && !mainCharacter && !additionalText) {
      return "";
    }
    
    let prompt = "Create a full-bleed trading card artwork that fills the ENTIRE image frame from edge to edge with no borders, margins, or empty space around it. The artwork must extend completely to all four edges of the image. Use sharp 90-degree corners with no rounding. The aspect ratio is 2.5:3.5 (portrait orientation).\n\n";
    
    // Handle reference image if provided
    if (referenceImageFile) {
      // Only generate random transformation for Transform mode
      const epicTransformation = subjectType === 'transform' 
        ? getRandomTransformation(fields.artStyle, subjectType)
        : null;
      
      if (subjectType === 'transform') {
        prompt += "REFERENCE IMAGE GUIDANCE: ";
        prompt += "Transform the person in the reference image into an epic trading card character while preserving their exact facial features and recognizable likeness. ";
        // Use Main Character Description if provided, otherwise use random transformation
        const transformation = mainCharacter || epicTransformation;
        prompt += `Character transformation: Transform them into ${transformation}. `;
        prompt += "CRITICAL: Maintain their exact facial structure, facial features, and especially their HAIR COLOR and HAIR STYLE (length, texture, curl pattern). ";
        prompt += "Preserve their eye color, skin tone, and any distinctive features. ";
        prompt += "The person should look like themselves as this epic character. ";
        prompt += "Show complete subject filling the full height of the card from top to bottom.\n\n";
      } else if (subjectType === 'character') {
        prompt += "REFERENCE IMAGE GUIDANCE: ";
        prompt += "Create an epic trading card artwork inspired by the character in the reference image. ";
        
        // Apply Main Character Description if provided
        if (mainCharacter) {
          prompt += `Character modifications: ${mainCharacter}. `;
          prompt += "Apply these specific changes to the character's appearance, clothing, or equipment while maintaining their recognizable identity. ";
        }
        
        if (fields.titleText.trim()) {
          prompt += `Use "${fields.titleText}" as the card title. `;
        }
        
        if (mainCharacter) {
          prompt += "IMPORTANT: Create an interpretation that incorporates the specified modifications while preserving the character's core identity. ";
        } else {
          prompt += "IMPORTANT: Create an original interpretation that captures the spirit and theme of the character. ";
        }

        prompt += "Enhancement approach - Create a dynamic hero card with energy effects and epic background. ";
        prompt += "Show complete subject filling the full height of the card from top to bottom.\n\n";
      } else if (subjectType === 'creature') {
        prompt += "REFERENCE IMAGE GUIDANCE: ";
        prompt += "Transform the creature in the reference image into an epic trading card version while maintaining its core creature type. ";
        // Use Main Character Description for creature modifications if provided
        if (mainCharacter) {
          prompt += `Creature modifications: ${mainCharacter}. `;
        } else {
          // No random transformation for creatures - they're already creatures
          prompt += "Enhancement: Make the creature look epic with dramatic lighting, energy effects, and powerful presence. ";
        }
        prompt += "CRITICAL: Keep the creature's essential anatomy and species intact. ";
        prompt += "Show complete subject filling the full height of the card from top to bottom.\n\n";
      } else { // object/logo
        prompt += "REFERENCE IMAGE GUIDANCE: ";
        prompt += "Transform the object or logo in the reference image into an epic trading card element. ";
        // For logos, the title text should NOT affect the artwork - it's only for the card frame header
        if (fields.titleText.trim()) {
          prompt += `NOTE: The card title "${fields.titleText}" is ONLY for the frame header text. `;
          prompt += "DO NOT let this title influence or change the logo artwork itself. ";
        }
        // Use the selected art style to guide the enhancement if one is chosen
        if (fields.artStyle) {
          prompt += "Enhancement approach: Apply the selected art style while preserving logo integrity. ";
        } else {
          prompt += "Enhancement approach: Professional trading card presentation with subtle effects. ";
        }
        // Use Main Character Description for object/logo enhancements if provided
        if (mainCharacter) {
          prompt += `Additional enhancement details: ${mainCharacter}. `;
        }
        prompt += "CRITICAL LOGO INTEGRITY: Maintain ALL key elements of the logo while adding epic enhancements: ";
        prompt += "- Keep ALL symbols, icons, shapes, and design elements present in the original logo. ";
        prompt += "- FONT PRESERVATION: If the logo contains text or letters, preserve the EXACT font, typeface, and typography. ";
        prompt += "DO NOT change fonts, letterforms, or text styling - maintain the original font characteristics completely. ";
        prompt += "Text must remain readable and in their exact original arrangement with identical font style. ";
        prompt += "- Preserve the logo's structural composition and the relationships between its parts. ";
        prompt += "- DO NOT add any characters, people, creatures, or living beings to the scene. ";
        prompt += "- The logo/object should be the ONLY subject - no additional characters or creatures. ";
        prompt += "- You can enhance with effects (glow, metallic finish, energy auras, 3D depth, holographic shimmer) ";
        prompt += "but ensure every component including exact fonts is still clearly visible and recognizable. ";
        prompt += "- Add dramatic background effects and environmental integration to create epic card presence. ";
        prompt += "Think of it as making the logo look powerful while keeping ALL original components and fonts intact. ";
        prompt += "Position elements to avoid obstruction by card frame overlays. ";
        if (fields.titleText.trim()) {
          prompt += "IMPORTANT: The title text is ONLY for labeling the card, not for modifying the logo artwork. ";
        }
        prompt += "The result should be a powerful, enhanced version with dynamic energy and trading card presence.\n\n";
      }
    } else if (mainCharacter) {
      // Use the Main Character Description from advanced options if provided
      prompt += `Main subject: ${mainCharacter}. Show complete subject filling the full height of the card from top to bottom.\n\n`;
    } else if (!fields.titleText.trim()) {
      // No reference image and no title - use a random character
      const randomCharacter = getRandomCharacter();
      prompt += `Main subject: ${randomCharacter}. Show complete subject filling the full height of the card from top to bottom.\n\n`;
    } else if (fields.titleText.trim() && !referenceImageFile) {
      // We have a title but no reference image
      prompt += `**CARD TITLE**: The card is titled "${fields.titleText}". `;
      prompt += `Create a character or creature that embodies the concept of "${fields.titleText}". `;
      prompt += "Show complete subject filling the full height of the card from top to bottom.\n\n";
    }
    
    // Add art style if selected, or use professional object style for Object Mode without art style
    if (fields.artStyle) {
      const selectedStyle = ART_STYLES.find(style => style.id === fields.artStyle);
      if (selectedStyle) {
        let stylePrompt = selectedStyle.stylePrompt;

        // Remove effect-heavy terms when subtle breakout is selected
        if (subtleBreakout) {
          if (fields.artStyle === 'anime') {
            stylePrompt = stylePrompt.replace(', luminous effects', ', no energy effects');
          } else if (fields.artStyle === 'fantasy') {
            stylePrompt = stylePrompt.replace(', magical glow effects', '').replace(', colorful spell effects', '');
          }
        }

        prompt += `Art style: ${stylePrompt}\n`;
      }
    } else if (referenceImageFile && subjectType === 'object') {
      // For Object Mode without an art style selected, use a random professional trading card style
      const objectStyle = getRandomObjectStyle();
      prompt += `Style: ${objectStyle}\n`;
      prompt += "IMPORTANT: Maintain complete logo integrity while adding these professional trading card enhancements.\n";
    }
    
    // Add background if specified
    if (fields.background) {
      prompt += `Background: ${fields.background}\n`;
    } else if (fields.titleText.trim() && !referenceImageFile) {
      // If no background specified but we have a title AND no reference image, suggest an appropriate background
      prompt += `Background: Create an appropriate epic background that enhances "${fields.titleText}" - consider the character's domain, powers, or origin.\n`;
    } else if (referenceImageFile) {
      // For reference images without specified background, use generic epic background
      prompt += `Background: Create an epic, dynamic background appropriate for a trading card.\n`;
    }
    
    // Add frame technical instructions if a frame is selected
    if (fields.frameStyle) {
      const selectedFrame = FRAME_STYLES_GENERATOR.find(
        (style) => style.id === fields.frameStyle
      );
      if (selectedFrame) {
        prompt += `\nFrame implementation: ${selectedFrame.basePrompt}\n`;
        
        // Add title text styling if provided
        if (fields.titleText.trim() !== "" || additionalText.trim() !== "") {
          if (fields.titleText.trim() !== "" && additionalText.trim() !== "") {
            // Both title and additional text - use combined prompt from FRAME_STYLES
            const frameStyle = FRAME_STYLES.find(style => style.id === fields.frameStyle);
            if (frameStyle?.bothTextsPrompt) {
              prompt += `Text layout: ${frameStyle.bothTextsPrompt}\n`;
            }
            prompt += `Title text to display: "${fields.titleText}"\n`;
            prompt += `Additional text to display: "${additionalText}"\n`;
          } else if (fields.titleText.trim() !== "") {
            prompt += `Text layout: ${selectedFrame.titleTextPrompt}\n`;
            prompt += `Title text to display: "${fields.titleText}"\n`;
          } else if (additionalText.trim() !== "") {
            // Only additional text - use additional text prompt from FRAME_STYLES
            const frameStyle = FRAME_STYLES.find(style => style.id === fields.frameStyle);
            if (frameStyle?.additionalTextPrompt) {
              prompt += `Text layout: ${frameStyle.additionalTextPrompt}\n`;
            }
            prompt += `Additional text to display: "${additionalText}"\n`;
          }
        }
        
        // Add frame-specific card text elements for authenticity
        const characterName = fields.titleText.trim() || "Hero";
        
        if (fields.frameStyle === "pokemon") {
          // Check if this is a logo/object
          const isLogo = referenceImageFile && subjectType === 'object';
          
          if (isLogo) {
            // For logos: NO overlay text at all to preserve logo text visibility
            prompt += "LOGO MODE - NO OVERLAY TEXT: Since this is a logo/object, DO NOT add any overlay text elements. ";
            prompt += "NO attack boxes, NO ability text, NO HP numbers, NO weakness/resistance bars. ";
            prompt += "Keep the Pokemon frame border and header bar ONLY. ";
            prompt += "The artwork and any text within it must be completely unobstructed. ";
            prompt += "Include only the minimal frame elements: the red header bar at top and blue stage capsule. ";
            prompt += "This ensures any text in the logo remains fully visible and unobstructed.\n";
          } else {
            // For non-logos: normal Pokemon card overlay elements
            prompt += "Card text elements: Include HP value (e.g., 'HP 120') in top right corner. ";
            prompt += `Add ONLY ONE attack name that relates to ${characterName}'s abilities with energy cost icons and damage value. Keep the attack name short (2-3 words max). `;
            prompt += "MANDATORY: At the very bottom of the card, create a clearly visible horizontal bar with three distinct sections showing: ";
            prompt += "Weakness (fire or appropriate type icon), Resistance (water or appropriate type icon with -30), and Retreat Cost (1-3 colorless energy symbols). ";
            prompt += "These bottom elements must be clearly visible with proper icons on a semi-transparent background bar. ";
            prompt += "Include evolution stage indicator (Basic, Stage 1, or Stage 2) in the blue capsule. ";
            prompt += "CRITICAL: Keep all text minimal - one short attack name, damage number, and the bottom bar elements only. ";
            prompt += "DO NOT add flavor text, extra attacks, ability descriptions, or any other text. ";
            prompt += "DO NOT add copyright text, set symbols, card numbers, or artist credits.\n";
          }
        } else if (fields.frameStyle === "magic") {
          const isLogo = referenceImageFile && subjectType === 'object';
          
          if (isLogo) {
            // For logos: NO overlay text
            prompt += "LOGO MODE - NO OVERLAY TEXT: Since this is a logo/object, DO NOT add any overlay text elements. ";
            prompt += "NO mana costs, NO card type lines, NO ability text, NO power/toughness boxes. ";
            prompt += "Keep only the Magic frame border and title area. ";
            prompt += "The artwork and any text within it must be completely unobstructed.\n";
          } else {
            // For non-logos: normal Magic card elements
            prompt += "Card text elements: Include 2-3 small mana cost symbols in top right. ";
            prompt += `Add SHORT card type line (e.g., 'Creature - Dragon'). `;
            prompt += "Include ONE ability name OR single line of italicized flavor text (max 10 words). ";
            prompt += "Add power/toughness box in bottom right (e.g., '5/4'). ";
            prompt += "CRITICAL: Minimal text only - type line, one ability/flavor text, P/T. ";
            prompt += "DO NOT add copyright text, set symbols, or artist credits.\n";
          }
        } else if (fields.frameStyle === "cyberpunk") {
          const isLogo = referenceImageFile && subjectType === 'object';
          
          if (isLogo) {
            // For logos: NO overlay text except minimal title if provided
            prompt += "LOGO MODE - MINIMAL OVERLAY: Since this is a logo/object, ";
            if (fields.titleText.trim()) {
              prompt += `display ONLY the title "${characterName}" in the cyber interface, positioned to not obscure logo text. `;
            } else {
              prompt += "DO NOT add any overlay text. ";
            }
            prompt += "NO stats, NO subtitles, NO other text elements. ";
            prompt += "Keep the cyber frame elements but ensure the logo and its text remain fully visible.\n";
          } else {
            // For non-logos: minimal text like free generator
            prompt += `Card text elements: Display ${characterName} in bold, all-caps digital font integrated into the cyber interface. `;
            
            // Only add additional elements if specifically provided in the additional text field
            if (additionalText.trim()) {
              prompt += `Include the following additional text: "${additionalText}". `;
            } else {
              prompt += "OPTIONAL: Add a SHORT subtitle below the name in matching digital font (e.g., 'ELITE HUNTER' or 'NETRUNNER'). ";
            }
            
            prompt += "CRITICAL: Keep text extremely minimal - just the name and optional short subtitle. ";
            prompt += "Integrate text seamlessly with the HUD-style graphical elements and circuit patterns. ";
            prompt += "DO NOT add stats, abilities, descriptions, or any other text elements unless specifically provided. ";
            prompt += "DO NOT add copyright text, barcodes, QR codes, or manufacturer logos.\n";
          }
        }
      }
    }
    
    // Add 3D breakout effect for frames
    if (fields.frameStyle && fields.frameStyle !== 'none') {
      if (subtleBreakout) {
        prompt += "\n**SUBTLE 3D BREAKOUT EFFECT**: The main character/creature should slightly extend past the frame borders, breaking the frame by 10-20% of their body. All backgrounds, energy effects, particles, and environmental elements MUST remain completely inside the frame.\n";
      } else {
        prompt += "\n**MANDATORY 3D BREAKOUT EFFECT**: The subject MUST dramatically break through and extend beyond the card frame borders.\n";
      }
    }
    
    prompt += "\n**CRITICAL FULL-BLEED REQUIREMENTS**: The final image must be a print-ready, full-bleed design. The artwork and all card elements MUST extend completely to all four edges of the image frame.\n";
    prompt += "IMPORTANT: Use a bright, vibrant, and colorful palette throughout the image with sharp, crisp details and clear edge definition.\n";
    
    return prompt;
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      setGenerationError("Please upload an image file");
      return;
    }
    
    if (file.size > 4 * 1024 * 1024) {
      setGenerationError("Image must be less than 4MB");
      return;
    }
    
    setPendingImageFile(file);
    setShowModeSelector(true);
  };
  
  const handleModeSelection = (mode: 'transform' | 'character' | 'creature' | 'object') => {
    // If we have a pending file (initial upload), use it
    // Otherwise we're just changing the mode for an existing image
    if (pendingImageFile) {
      setReferenceImageFile(pendingImageFile);
      setReferenceImageName(pendingImageFile.name);
    }
    
    setSubjectType(mode);
    
    // Auto-configure settings based on mode
    if (mode === 'object') {
      setFields(prev => ({
        ...prev,
        artStyle: '', // Clear art style for object mode
        frameStyle: 'none' // Default to no frame for clean logo presentation
      }));
    }
    
    setShowModeSelector(false);
    setPendingImageFile(null);
    setGenerationError(null);
  };
  
  const handleCancelModeSelection = () => {
    setShowModeSelector(false);
    setPendingImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleRemoveImage = () => {
    setReferenceImageFile(null);
    setReferenceImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleViewCard = () => {
    // Simply reset the generation complete state
    // The game will automatically disappear from the card preview
    setGenerationComplete(false);
    setIsGenerating(false);
  };
  
  const handleReset = () => {
    setFields({
      artStyle: "anime", // Reset to default
      background: "",
      frameStyle: "pokemon", // Reset to default
      titleText: "",
    });
    setReferenceImageFile(null);
    setReferenceImageName(null);
    setSubjectType('transform');
    setMainCharacter("");
    setAdditionalText("");
    setEditedPrompt(""); // This now clears the Additional Instructions field
    setSubtleBreakout(false); // Reset the breakout toggle
    setShowAdvancedOptions(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleGenerate = async (): Promise<void> => {
    // Game now shows in card preview instead of modal
    // setShowGameModal(true);
    setGenerationComplete(false);

    // Set UI state immediately for instant feedback
    setIsGenerating(true);
    setGenerationStartTime(Date.now());
    setGenerationError(null);

    // Scroll to card preview section on mobile (or small screens)
    setTimeout(() => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        const cardPreviewSection = document.getElementById('card-preview-section');
        if (cardPreviewSection) {
          const offset = 80; // Account for navigation bar height
          const elementPosition = cardPreviewSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - offset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }
    }, 100);

    const supabase = getSupabaseBrowserClient();
    const t0 = performance.now();

    // Quota pre-flight
    const paidCreditsLeft = Number(credits);
    const dbFreebiesLeft = Math.max(0, FREE_LIMIT - Number(freeGenerationsUsed));
    const guestQuotaLeft = Number(remainingGenerations);

    // Non-blocking analytics
    track("generate", {
      action: "preflight",
      generator: "standard",
      authed: !!user,
      paidCreditsLeft,
      dbFreebiesLeft,
      guestQuotaLeft,
    }).catch(console.error);

    if (!user) {
      if (guestQuotaLeft <= 0) {
        track("generate", { action: "blocked", reason: "guest_no_quota" }).catch(console.error);
        setIsGenerating(false); // Reset state since we're not proceeding
        // setShowGameModal(false);
        signInWithGoogle("/generate");
        return;
      }
    } else if (paidCreditsLeft < 200 && dbFreebiesLeft <= 0) {
      track("generate", { action: "blocked", reason: "insufficient_credits_need_200" }).catch(console.error);
      setIsGenerating(false); // Reset state since we're not proceeding
      // setShowGameModal(false);
      setGenerationError("You need at least 200 credits to generate a card. You currently have " + paidCreditsLeft + " credits.");
      setTimeout(() => {
        window.location.href = "/credits?returnTo=/generate";
      }, 2000);
      return;
    }

    // Generate base prompt and append additional instructions if provided
    let prompt = generatePrompt();
    if (editedPrompt && editedPrompt.trim()) {
      prompt += `\n\nAdditional instructions: ${editedPrompt}`;
    }
    if (!prompt) {
      setGenerationError("Please select at least one option to generate a card");
      track("generate", { action: "blocked", reason: "no_options_selected" }).catch(console.error);
      setIsGenerating(false); // Reset state since we're not proceeding
      // setShowGameModal(false);
      return;
    }
    
    try {
      // Use FormData for file upload
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("maintainLikeness", String(true));
      
      if (referenceImageFile) {
        formData.append("referenceImage", referenceImageFile);
      }
      
      track("generate", { action: "request_start", generator: "standard" }).catch(console.error); // Non-blocking
      
      const res = await fetch("/api/generate-image", {
        method: "POST",
        body: formData,
      });
      
      const json = await res.json() as { imageUrl?: string; error?: string; code?: string; revisedPrompt?: string };
      
      if (!res.ok || !json.imageUrl) {
        track("generate", {
          action: "request_error",
          status: res.status,
          code: json.code ?? null,
          message: json.error ?? "Unknown error",
        }).catch(console.error); // Non-blocking
        setGenerationError(json.error ?? "Failed to generate image");
        if (json.code === "RATE_LIMIT_EXCEEDED" && !user) setRemainingGenerations(0);
        return;
      }

      const imageUrl = json.imageUrl!;
      setGeneratedImage(imageUrl);
      setSessionImages((prev) => [...prev, imageUrl]);
      setCurrentImageIndex(sessionImages.length); // Set to the index of the newly added image
      track("generate", { action: "preview_ready", generator: "standard" }).catch(console.error); // Non-blocking

      // Pinata upload will happen later when user chooses NFT generation

      // Burn guest quota if required
      if (!user) {
        await burnFreeQuota();
        track("generate", { action: "guest_quota_burned" }).catch(console.error); // Non-blocking
      }
      
      // Upload for signed-in users
      if (user) {
        setIsUploadingToDatabase(true);
        setUploadError(null);
        
        try {
          track("generate", { action: "upload_start" }).catch(console.error); // Non-blocking
          
          
          // Retry logic for intermittent fetch failures
          let retries = 3;
          let lastError: Error | null = null;
          let blob: Blob | null = null;
          
          while (retries > 0 && !blob) {
            try {
              const response = await fetch(imageUrl);
              if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
              }
              blob = await response.blob();
            } catch (err) {
              lastError = err as Error;
              retries--;
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
              }
            }
          }
          
          if (!blob) {
            throw lastError || new Error("Failed to fetch image after retries");
          }
          const file = new File([blob], "card.png", { type: blob.type });
          const cropped = await cropImageToAspectRatio(file);
          setProcessedImageBlob(cropped);
          
          const cardTitle = fields.titleText || 'Generated Card';
          
          const { publicUrl, imageRecordId } = await uploadGeneratedImage(
            cropped,
            prompt,
            {
              frameStyle: fields.frameStyle,
              artStyle: fields.artStyle,
              maintainLikeness: true,
              referenceImage: referenceImageFile ? true : false,
              generationParams: {
                model: "dall-e-3",
                style: fields.frameStyle,
                maintainLikeness: true,
              }
            },
            undefined, // metadata
            cardTitle, // title
            activeSeriesId ? true : false, // featured if part of series
            activeSeriesId || undefined // seriesId
          );
          
          // Clear activeSeries from localStorage after successful upload
          if (activeSeriesId && typeof window !== 'undefined') {
            localStorage.removeItem('activeSeries');
          }

          setUploadedImageUrl(publicUrl ?? null);
          
          // Get the user_assets ID (not generated_images ID)
          if (imageRecordId) {
            try {
              const supabase = getSupabaseBrowserClient();
              const { data: assetData } = await supabase
                .from('user_assets')
                .select('id')
                .eq('source_id', imageRecordId)
                .single<{ id: string }>();
              
              setGeneratedCardId(assetData?.id ?? null);
              console.log('💾 [Generate] Card ID for NFT linking:', assetData?.id);
            } catch (error) {
              console.error('Failed to get user_assets ID:', error);
              setGeneratedCardId(null);
            }
          }
          
          track("generate", { action: "upload_ok" }).catch(console.error); // Non-blocking

          // Show success toast with longer duration
          toast({
            variant: "success",
            title: "Card Generated Successfully! 🎉",
            description: "Your card has been saved to your profile and is ready to list on the marketplace.",
            duration: 8000, // Show for 8 seconds instead of default 5
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Generator: Failed to upload generated image:", e);
          console.error("Generator: Error details:", {
            message: msg,
            errorType: e?.constructor?.name,
            error: e
          });
          setUploadError("Upload failed — image won't be purchasable");

          // Show error toast for upload failures
          toast({
            variant: "destructive",
            title: "Upload Failed",
            description: "Your card was generated but couldn't be saved to your profile. Please try again or contact support if the issue persists.",
            duration: 8000,
          });

          track("generate", { action: "upload_fail", message: msg }).catch(console.error); // Non-blocking
        } finally {
          setIsUploadingToDatabase(false);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenerationError(msg ?? "Unknown error");
      track("generate", { action: "unexpected_error", message: msg }).catch(console.error); // Non-blocking
    } finally {
      track("generate", {
        action: "done",
        generator: "standard",
        duration_ms: Math.round(performance.now() - t0),
      }).catch(console.error); // Non-blocking
      setIsGenerating(false);
      setGenerationComplete(true);  // Mark as complete instead of closing
      setGenerationStartTime(null);
      setGenerationElapsedTime(0);
    }
  };

  /* ─────────────────────── generate/finalize enable flags ─────────────────── */
  // Enable button if: has prompt, not generating, and either has 200+ credits OR has free generations
  const canGenerate = (paidCreditsLeft >= 200) || freeGenerationsAvailable;
  const remainingFree = user ? freebiesLeftDB : remainingGenerations;

  // Generator validation
  const hasInput = fields.artStyle || fields.background || fields.frameStyle || fields.titleText || referenceImageFile || mainCharacter || additionalText;
  const generateBtnEnabled = hasInput && !isGenerating && canGenerate;

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden font-mono">
      {/* ────── background scan-lines & grid ────── */}
      <div className="fixed inset-0 cyber-grid opacity-10 pointer-events-none" />
      <div className="fixed inset-0 scanlines  opacity-20 pointer-events-none" />

      <Navigation />

      {/* ────── Mode Selector Modal - Generator ────── */}
      {showModeSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleCancelModeSelection}
          />
          
          {/* Modal Content */}
          <div className="relative bg-cyber-dark border-2 border-cyber-cyan/50 rounded-xl p-4 sm:p-6 max-w-2xl w-full shadow-[0_0_30px_rgba(0,255,255,0.3)] max-h-[90vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={handleCancelModeSelection}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3 pr-8">
              Choose Generation Mode
            </h2>
            <p className="text-sm sm:text-base text-gray-400 mb-4 sm:mb-6">
              Choose the mode that best matches your uploaded image for optimal results
            </p>
            
            {/* Mode Options Grid - Single column on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Transform Mode */}
              <button
                onClick={() => handleModeSelection('transform')}
                className="relative p-3 sm:p-4 rounded-lg border-2 border-cyber-cyan/30 bg-cyber-darker/50 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50 transition-all duration-300 text-left group"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl flex-shrink-0">👤</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-cyber-cyan transition-colors">
                      Transform Mode
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-400">
                      Transform regular people into epic heroes
                    </p>
                  </div>
                </div>
              </button>
              
              {/* Character Mode */}
              <button
                onClick={() => handleModeSelection('character')}
                className="relative p-3 sm:p-4 rounded-lg border-2 border-cyber-cyan/30 bg-cyber-darker/50 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50 transition-all duration-300 text-left group"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl flex-shrink-0">🦸</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-cyber-cyan transition-colors">
                      Character Mode
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-400">
                      Keep costume & identity of character
                    </p>
                  </div>
                </div>
              </button>
              
              {/* Creature Mode */}
              <button
                onClick={() => handleModeSelection('creature')}
                className="relative p-3 sm:p-4 rounded-lg border-2 border-cyber-cyan/30 bg-cyber-darker/50 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50 transition-all duration-300 text-left group"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl flex-shrink-0">🐉</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-cyber-cyan transition-colors">
                      Creature Mode
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-400">
                      For creature or animal images
                    </p>
                  </div>
                </div>
              </button>
              
              {/* Object Mode */}
              <button
                onClick={() => handleModeSelection('object')}
                className="relative p-3 sm:p-4 rounded-lg border-2 border-cyber-cyan/30 bg-cyber-darker/50 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50 transition-all duration-300 text-left group"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl flex-shrink-0">📦</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1 group-hover:text-cyber-cyan transition-colors">
                      Object Mode
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-400">
                      For logos or objects • Defaults to logo-optimized
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game modal removed - now integrated into FlippableCardPreview */}

      {/* ────── checkout modal - opens after finalize ────── */}
      <CustomCardCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => {
          setShowCheckoutModal(false)
          // Reset generation state for series workflow - allow generating next card
          if (activeSeriesId) {
            setGenerationComplete(false)
            setGeneratedImage(null)
            setUploadedImageUrl(null)
            setProcessedImageBlob(null)
          }
        }}
        uploadedImage={
          sessionImages.length
            ? sessionImages[currentImageIndex]
            : generatedImage
        }
        processedImageBlob={processedImageBlob}
        uploadedImageUrl={uploadedImageUrl}
      />

      {/* ────── page body ────── */}
      <div className="px-4 sm:px-6 py-8 pt-24 pb-20 relative">
        <div className="max-w-7xl mx-auto">
          {/* ───────────── header ───────────── */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-wider">
                AI Card Generator
              </h1>
              <p className="text-gray-400">
                Create stunning AI-powered trading cards
              </p>
            </div>

          </div>


          {/* ───────────── main grid ───────────── */}
          <div className="grid lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-8">
            {/* ─────────── prompt builder - left ─────────── */}
            <div className="lg:col-span-3">
              <Card className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30 h-full flex flex-col">
                <CardHeader className="pb-6 sm:pb-2 px-4 sm:px-6">
                  <CardTitle className="text-white flex items-center gap-2 tracking-wider">
                    <Wand2 className="w-5 h-5 text-cyber-cyan" />
                    AI Card Generator
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-4 sm:p-6 pt-0 flex-1 flex flex-col">
                  {/* ────────── Generator UI ────────── */}
                  <div className="flex flex-col h-full">
                      {/* Fixed fields section */}
                      <div className="flex-shrink-0 space-y-4">
                        {/* Reference Image Upload */}
                        <div className="space-y-2">
                        <Label className="text-cyber-cyan tracking-wide">
                          Reference Image
                        </Label>
                        <div className={`relative transition-all duration-500 rounded-md ${!referenceImageFile ? 'animate-subtle-pulse-mobile' : ''}`}>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
                            onChange={handleImageUpload}
                            className="hidden"
                            id="reference-upload"
                          />
                          {!referenceImageFile ? (
                            <label
                              htmlFor="reference-upload"
                              className="flex items-center justify-center gap-2 h-10 px-3 bg-cyber-darker/50 border border-cyber-cyan/30 rounded-md cursor-pointer hover:bg-cyber-darker/70 hover:border-cyber-cyan transition-colors"
                            >
                              <Upload className="w-4 h-4 text-cyber-cyan" />
                              <span className="text-xs text-gray-400">
                                Upload Image
                              </span>
                            </label>
                          ) : (
                            <div className="flex items-center gap-2 h-10 px-3 bg-cyber-cyan/10 border border-cyber-cyan/50 rounded-md">
                              <ImageIcon className="w-4 h-4 text-cyber-cyan flex-shrink-0" />
                              <span
                                className="text-xs text-cyber-cyan truncate"
                                title={referenceImageName || "Image uploaded"}
                              >
                                {referenceImageName
                                  ? referenceImageName.length > 20
                                    ? `${referenceImageName.substring(0, 20)}...`
                                    : referenceImageName
                                  : "Uploaded"}
                              </span>
                              <button
                                onClick={handleRemoveImage}
                                className="text-cyber-pink hover:text-cyber-pink/80 transition-colors ml-auto"
                                type="button"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Mode Indicator */}
                        {referenceImageFile && (
                          <div className="flex items-center justify-between mt-2 h-10 px-3 bg-cyber-cyan/10 border border-cyber-cyan/50 rounded-md">
                            <div className="flex items-center gap-1">
                              <span className="text-sm">
                                {subjectType === 'transform' && '👤'}
                                {subjectType === 'character' && '🦸'}
                                {subjectType === 'creature' && '🐉'}
                                {subjectType === 'object' && '📦'}
                              </span>
                              <span className="text-xs font-bold text-cyber-cyan">
                                {subjectType === 'transform' && 'Transform Mode'}
                                {subjectType === 'character' && 'Character Mode'}
                                {subjectType === 'creature' && 'Creature Mode'}
                                {subjectType === 'object' && 'Object Mode'}
                              </span>
                            </div>
                            <button
                              onClick={() => setShowModeSelector(true)}
                              className="text-xs text-cyber-cyan hover:text-cyber-cyan/80 transition-colors underline"
                              type="button"
                            >
                              Change
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Title Text */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="title-text"
                          className="text-cyber-cyan tracking-wide"
                        >
                          Card Title
                        </Label>
                        <Input
                          id="title-text"
                          placeholder="e.g., Shadow Dragon, Cyber Knight"
                          value={fields.titleText}
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              titleText: e.target.value,
                            })
                          }
                          className="bg-cyber-darker/50 border-cyber-cyan/30 text-white placeholder:text-cyber-cyan/70 focus:border-cyber-cyan"
                        />
                      </div>

                      {/* Art Style Selection - Grid of buttons */}
                      <div className="space-y-2">
                        <Label className="text-cyber-cyan tracking-wide">
                          Art Style {referenceImageFile && subjectType === 'object' && '(Optional)'}
                          {referenceImageFile && subjectType === 'object' && !fields.artStyle && (
                            <span className="text-xs text-gray-400 ml-2">
                              - Professional style auto-applied for logos
                            </span>
                          )}
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          {ART_STYLES.map((style) => (
                            <button
                              key={style.id}
                              onClick={() => setFields({ ...fields, artStyle: style.id })}
                              type="button"
                              className={`relative h-auto min-h-[3rem] py-2 px-1 flex items-center justify-center rounded-lg border-2 transition-all duration-300 overflow-hidden ${
                                fields.artStyle === style.id
                                  ? "bg-cyber-dark border-cyber-cyan shadow-[0_0_15px_rgba(0,255,255,0.5)]"
                                  : "bg-cyber-darker/50 border-cyber-cyan/30 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50"
                              }`}
                            >
                              <span className={`relative z-10 text-sm font-bold text-center whitespace-normal break-words leading-tight ${
                                fields.artStyle === style.id ? 'text-cyber-cyan' : 'text-gray-300'
                              }`}>
                                {style.name}
                              </span>
                              {fields.artStyle === style.id && (
                                <div className="absolute inset-0 bg-cyber-cyan/10 pointer-events-none" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Background Setting */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="background"
                          className="text-cyber-cyan tracking-wide"
                        >
                          Background Setting (Optional)
                        </Label>
                        <Input
                          id="background"
                          placeholder="e.g., mystical forest, neon city skyline, ancient ruins"
                          value={fields.background}
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              background: e.target.value,
                            })
                          }
                          className="bg-cyber-darker/50 border-cyber-cyan/30 text-white placeholder:text-cyber-cyan/70 focus:border-cyber-cyan"
                        />
                      </div>

                      {/* Frame Style */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="frame-style"
                          className="text-cyber-cyan tracking-wide"
                        >
                          Card Frame Style
                        </Label>
                        <Select
                          value={fields.frameStyle}
                          onValueChange={(value) =>
                            setFields({ ...fields, frameStyle: value })
                          }
                        >
                          <SelectTrigger className="bg-cyber-darker/50 border-cyber-cyan/30 text-white hover:bg-cyber-darker/70 hover:border-cyber-cyan focus:border-cyber-cyan transition-colors">
                            <SelectValue placeholder="Select a frame style" />
                          </SelectTrigger>
                          <SelectContent className="bg-cyber-dark border-cyber-cyan/30 max-w-[90vw] sm:max-w-md overflow-hidden rounded-md">
                            <div className="overflow-hidden rounded-[inherit]">
                              {FRAME_STYLES_GENERATOR.map((style) => (
                                <SelectItem
                                  key={style.id}
                                  value={style.id}
                                  className="text-white data-[state=checked]:bg-transparent hover:bg-white hover:text-black data-[state=checked]:hover:bg-white data-[state=checked]:hover:text-black data-[state=checked]:text-white [&>span]:text-white hover:[&>span]:text-black [&_*]:hover:text-black mx-0 rounded-none cursor-pointer"
                                >
                                  <div className="pr-2">
                                    <div className="font-semibold">
                                      {style.name}
                                    </div>
                                    <div className="text-xs text-gray-400 whitespace-normal break-words">
                                      {style.description}
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </div>
                          </SelectContent>
                        </Select>
                      </div>

                        {/* Advanced Options Section - Same height with glow */}
                        <div className="mt-6">
                          <button
                            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                            className="group w-full h-10 px-3 flex items-center justify-between bg-cyber-darker/50 border border-cyber-cyan/50 rounded-md hover:bg-cyber-darker/70 hover:border-cyber-cyan hover:shadow-[0_0_10px_rgba(0,255,255,0.3)] transition-all duration-300"
                            type="button"
                          >
                            <div className="flex items-center gap-2">
                              <Sliders className={`w-4 h-4 text-cyber-cyan transition-transform ${showAdvancedOptions ? 'rotate-90' : ''}`} />
                              <span className="text-sm font-bold text-cyber-cyan">Advanced Options</span>
                              <span className="text-xs text-gray-400">(Optional)</span>
                            </div>
                          </button>
                          
                          {showAdvancedOptions && (
                            <div className="mt-2 p-4 space-y-4 border border-cyber-cyan/20 rounded-md bg-cyber-darker/10">
                              {/* Main Character Description - Dynamic based on mode */}
                              <div className="space-y-2">
                                <Label
                                  htmlFor="main-character"
                                  className="text-cyber-cyan tracking-wide"
                                >
                                  {referenceImageFile ? (
                                    subjectType === 'transform' ? 'Character Transformation Details' :
                                    subjectType === 'character' ? 'Character Modifications' :
                                    subjectType === 'creature' ? 'Creature Enhancements' :
                                    'Object/Logo Effects'
                                  ) : 'Main Character Description'}
                                </Label>
                                <Input
                                  id="main-character"
                                  placeholder={
                                    referenceImageFile ? (
                                      subjectType === 'transform' ? "e.g., a cabaret singer with sparkling dress and microphone" :
                                      subjectType === 'character' ? "e.g., add energy wings, glowing weapons, battle damage" :
                                      subjectType === 'creature' ? "e.g., add fire breath, metallic scales, glowing eyes" :
                                      "e.g., add holographic effects, energy particles, 3D depth"
                                    ) : "e.g., a frost-covered samurai with glowing blue eyes"
                                  }
                                  value={mainCharacter}
                                  onChange={(e) => setMainCharacter(e.target.value)}
                                  className="bg-cyber-darker/50 border-cyber-cyan/30 text-white placeholder:text-cyber-cyan/70 focus:border-cyber-cyan"
                                />
                              </div>
                              
                              {/* Additional Text */}
                              <div className="space-y-2">
                                <Label
                                  htmlFor="additional-text"
                                  className="text-cyber-cyan tracking-wide"
                                >
                                  Additional Text
                                </Label>
                                <Input
                                  id="additional-text"
                                  placeholder="e.g., Creature - Dragon, Swift Strike - 120"
                                  value={additionalText}
                                  onChange={(e) => setAdditionalText(e.target.value)}
                                  className="bg-cyber-darker/50 border-cyber-cyan/30 text-white placeholder:text-cyber-cyan/70 focus:border-cyber-cyan"
                                />
                              </div>

                              {/* Breakout Effect Intensity Toggle - Only show when a frame style is selected */}
                              {fields.frameStyle && fields.frameStyle !== 'none' && (
                                <div className="space-y-2">
                                  <Label className="text-cyber-cyan tracking-wide">
                                    3D Breakout Effect
                                  </Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSubtleBreakout(false)}
                                      className={`relative h-auto min-h-[3rem] py-2 px-1 flex items-center justify-center rounded-lg border-2 transition-all duration-300 overflow-hidden ${
                                        !subtleBreakout
                                          ? "bg-cyber-dark border-cyber-cyan shadow-[0_0_15px_rgba(0,255,255,0.5)]"
                                          : "bg-cyber-darker/50 border-cyber-cyan/30 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50"
                                      }`}
                                    >
                                      <span className={`relative z-10 text-sm font-bold text-center whitespace-normal break-words leading-tight ${
                                        !subtleBreakout ? 'text-cyber-cyan' : 'text-gray-300'
                                      }`}>
                                        Dramatic
                                      </span>
                                      {!subtleBreakout && (
                                        <div className="absolute inset-0 bg-cyber-cyan/10 pointer-events-none" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSubtleBreakout(true)}
                                      className={`relative h-auto min-h-[3rem] py-2 px-1 flex items-center justify-center rounded-lg border-2 transition-all duration-300 overflow-hidden ${
                                        subtleBreakout
                                          ? "bg-cyber-dark border-cyber-cyan shadow-[0_0_15px_rgba(0,255,255,0.5)]"
                                          : "bg-cyber-darker/50 border-cyber-cyan/30 hover:bg-cyber-darker/70 hover:border-cyber-cyan/50"
                                      }`}
                                    >
                                      <span className={`relative z-10 text-sm font-bold text-center whitespace-normal break-words leading-tight ${
                                        subtleBreakout ? 'text-cyber-cyan' : 'text-gray-300'
                                      }`}>
                                        Subtle
                                      </span>
                                      {subtleBreakout && (
                                        <div className="absolute inset-0 bg-cyber-cyan/10 pointer-events-none" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Additional Instructions */}
                        <div className="space-y-2">
                          <Label htmlFor="additional-instructions" className="text-cyber-cyan tracking-wide">
                            Additional Instructions (Optional)
                          </Label>
                          <Textarea
                            id="additional-instructions"
                            placeholder="Add any extra instructions for your card generation... e.g., add lightning effects, make it more dramatic, include specific details"
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                            className="min-h-[100px] bg-cyber-darker/50 border-cyber-cyan/30 text-white font-mono text-xs resize-none focus:border-cyber-cyan placeholder:text-cyber-cyan/70"
                            style={{ height: '130px' }}
                          />
                        </div>
                      </div>
                      
                      {/* Spacer to push buttons to bottom */}
                      <div className="flex-1 min-h-0" />

                      {/* Generate and Reset Buttons - Fixed at bottom */}
                      <div className="space-y-2 flex-shrink-0 mt-4">
                        <div className="flex justify-end">
                          <Button
                            onClick={handleReset}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-gray-400 hover:bg-transparent hover:text-gray-300"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reset All
                          </Button>
                        </div>
                        <Button
                          onClick={isOutOfCredits ? () => window.location.href = "/credits?returnTo=/generate" : handleGenerate}
                          disabled={(!generateBtnEnabled && !isOutOfCredits) || (generationComplete && activeSeriesId !== null)}
                          className={`w-full text-lg py-6 tracking-wider transition-all duration-300 ${
                            (generateBtnEnabled || isOutOfCredits) && !(generationComplete && activeSeriesId !== null)
                              ? "cyber-button"
                              : "bg-cyber-black/80 border-2 border-cyber-cyan/50 text-cyber-cyan/70 opacity-50"
                          }`}
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Generating…
                            </>
                          ) : generationComplete && activeSeriesId !== null ? (
                            <>
                              <CheckCircle2 className="w-5 h-5 mr-2" />
                              <span className="hidden sm:inline">
                                Finalize to Generate Next
                              </span>
                              <span className="sm:hidden">Finalize First</span>
                            </>
                          ) : isOutOfFreeAndLoggedOut ? (
                            <>
                              <AlertCircle className="w-5 h-5 mr-2" />
                              Sign in to continue
                            </>
                          ) : isOutOfCredits ? (
                            <>
                              <ShoppingCart className="w-5 h-5 mr-2" />
                              Buy Credits
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-5 h-5 mr-2" />
                              <span className="hidden sm:inline">
                                Generate Card
                              </span>
                              <span className="sm:hidden">Generate</span>
                            </>
                          )}
                        </Button>
                      </div>

                      {generationError && (
                        <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-400/30 rounded p-2">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          {generationError}
                        </div>
                      )}
                    </div>
                </CardContent>
              </Card>
            </div>

            {/* ─────────── preview and finalize - right ─────────── */}
            <div className="lg:col-span-2">
              <Card id="card-preview-section" className="bg-cyber-dark/60 backdrop-blur-sm border border-cyber-cyan/30 h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="text-white tracking-wider flex items-center justify-between">
                    <span>Card Preview</span>
                    {sessionImages.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handlePreviousImage}
                          disabled={currentImageIndex === 0}
                          className="h-7 w-7 p-0 text-cyber-cyan hover:bg-cyber-cyan/20 disabled:opacity-30"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-xs text-gray-400 font-normal min-w-[40px] text-center">
                          {currentImageIndex + 1} / {sessionImages.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleNextImage}
                          disabled={
                            currentImageIndex === sessionImages.length - 1
                          }
                          className="h-7 w-7 p-0 text-cyber-cyan hover:bg-cyber-cyan/20 disabled:opacity-30"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </CardTitle>
                  <p className="text-gray-400 text-sm">
                    {generatedImage
                      ? "Your generated card"
                      : "Fill in the fields and generate your custom card"}
                  </p>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col p-4 sm:p-6 pt-0">
                  <div className="flex-1 flex items-center justify-center">
                    <FlippableCardPreview
                      artwork={generatedImage}
                      isLoading={isGenerating}
                      defaultImage="/1756189842550-9b984504.webp"
                      isGenerating={isGenerating}
                      generationComplete={generationComplete}
                      onGenerationComplete={handleViewCard}
                    />
                  </div>

                  {console.log('🔍 NFT Generation check:', { generationComplete, hasImages: generatedImage || sessionImages.length > 0, seriesType, shouldShow: seriesType !== 'physical_only' })}
                  {generationComplete && (generatedImage || sessionImages.length > 0) && seriesType !== 'physical_only' && (
                    <div className="mt-6">
                      <NFTGenerationOption
                        onNFTToggle={setGenerateNFT}
                        isEnabled={generateNFT}
                        userCredits={credits}
                        baseCost={0} // Base generation cost
                        nftCost={10} // Additional NFT cost
                        disabled={isUploadingToDatabase}
                      />
                    </div>
                  )}

                  {/* ---------- NFT Collection Form (After Generation) ---------- */}
                  {/* Only show NFT form if NOT physical_only series */}
                  {showNFTForm && (generatedImage || sessionImages.length > 0) && seriesType !== 'physical_only' && (
                    <div className="mt-6">
                      <NFTCollectionForm
                        onCollectionGenerated={(address, codes) => {
                          console.log('Collection generated:', address, codes)
                          setShowNFTForm(false)
                          // You can add additional logic here to handle the generated collection
                        }}
                        onClose={() => setShowNFTForm(false)}
                        baseImage={generatedImage || sessionImages[currentImageIndex] || ''}
                        collectionNumber={collectionNumber}
                        cardId={generatedCardId}
                      />
                    </div>
                  )}

                  {/* ---------- finalize & download buttons ---------- */}
                  <div className="mt-6 space-y-3">
                    <div className="flex gap-2">
                      <Button
                        onClick={handleFinalizeClick}
                        disabled={
                          (!generatedImage && sessionImages.length === 0) ||
                          isUploadingToDatabase
                        }
                        className={`flex-1 text-lg py-6 tracking-wider transition-all duration-300 ${
                          generatedImage || sessionImages.length
                            ? "cyber-button"
                            : "bg-cyber-black/80 opacity-50"
                        }`}
                      >
                        {isUploadingToDatabase ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin text-cyber-cyan" />
                            Preparing…
                          </>
                        ) : (
                          <>
                            Finalize
                            <ArrowRight className="w-5 h-5 ml-2" />
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleDownload}
                        disabled={!generatedImage && sessionImages.length === 0}
                        className={`py-6 px-6 transition-all duration-300 ${
                          generatedImage || sessionImages.length
                            ? "bg-transparent border-2 border-purple-500 text-purple-500 hover:bg-purple-500/10 hover:shadow-[0_0_20px_rgba(168,85,247,0.5)]"
                            : "bg-cyber-black/80 text-cyber-cyan/70 opacity-50"
                        }`}
                        title="Download generated card"
                      >
                        <Download className="w-5 h-5" />
                      </Button>
                    </div>

                    {uploadError && (
                      <div className="text-xs text-red-400 bg-red-900/20 border border-red-400/30 rounded p-2">
                        <AlertCircle className="w-3 h-3 inline mr-1" />
                        {uploadError}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}