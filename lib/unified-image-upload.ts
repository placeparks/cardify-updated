import { uploadGeneratedImage, UploadResult } from './supabase-storage';
import { cropImageToAspectRatio } from './image-processing';
import { getSupabaseBrowserClient } from './supabase-browser';

/**
 * Unified image upload function that handles both authenticated and guest users
 * Returns a permanent Supabase storage URL in both cases
 */
export async function unifiedImageUpload(
  imageBlob: Blob,
  options: {
    prompt?: string;
    title?: string;
    generationOptions?: Record<string, any>;
    generationTimeMs?: number;
  } = {}
): Promise<{ publicUrl: string; imageId?: string }> {
  const supabase = getSupabaseBrowserClient();

  // Check if user is authenticated
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user?.id) {
    // Authenticated user - use the existing uploadGeneratedImage function
    console.log('📤 Authenticated user - using standard upload');

    // Crop image to 2.5:3.5 aspect ratio
    const file = new File([imageBlob], "card.png", { type: imageBlob.type });
    const croppedImage = await cropImageToAspectRatio(file);

    const uploadResult = await uploadGeneratedImage(
      croppedImage,
      options.prompt,
      options.generationOptions,
      { generation_time_ms: options.generationTimeMs },
      options.title
    );

    if (!uploadResult.success || !uploadResult.publicUrl) {
      throw new Error(uploadResult.error || 'Upload failed');
    }

    return {
      publicUrl: uploadResult.publicUrl,
      imageId: uploadResult.imageRecordId || undefined
    };
  } else {
    // Guest user - use the guest API route
    console.log('📤 Guest user - using guest API upload');

    // Convert blob to base64 for API
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(imageBlob);
    });
    const imageDataUrl = await base64Promise;

    // Get or create device ID for guest tracking
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);
    }

    const sessionId = sessionStorage.getItem('session_id') || crypto.randomUUID();
    sessionStorage.setItem('session_id', sessionId);

    // Upload via guest API
    const response = await fetch('/api/guest-images/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: imageDataUrl,
        deviceId,
        sessionId,
        prompt: options.prompt,
        generationOptions: options.generationOptions,
        generationTimeMs: options.generationTimeMs
      })
    });

    if (!response.ok) {
      const error = await response.json();

      // Handle large images gracefully
      if (error.skipped && error.reason?.includes('exceeds the 5MB limit')) {
        // Image is too large for guest storage, but we can still use the data URL
        console.warn('⚠️ Image too large for guest storage, using data URL');
        return {
          publicUrl: imageDataUrl,
          imageId: undefined
        };
      }

      throw new Error(error.error || 'Guest upload failed');
    }

    const result = await response.json();

    if (!result.success || !result.imageUrl) {
      throw new Error('Guest upload failed - no URL returned');
    }

    return {
      publicUrl: result.imageUrl,
      imageId: result.imageId
    };
  }
}
