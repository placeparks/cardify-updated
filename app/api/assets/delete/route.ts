import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { createClient } from "@supabase/supabase-js"

// ── Admin client (service key) for Storage deletes ──
function getAdmin() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    
    console.log('🔧 Admin client setup:', { 
      hasUrl: !!url, 
      hasKey: !!key,
      urlPrefix: url?.substring(0, 20) + '...' 
    })
    
    if (!url || !key) {
      throw new Error(`Missing environment variables: SUPABASE_URL=${!!url}, SUPABASE_SERVICE_KEY=${!!key}`)
    }
    
    return createClient(url, key)
  } catch (error) {
    console.error('❌ Failed to create admin client:', error)
    throw error
  }
}

// Which table are you showing on the Profile page?
// Your Profile page uses `user_assets`. Your upload util writes to `uploaded_images`.
// This route supports both; pass table in body. Default to `user_assets`.
type Body = { id: string; table?: "user_assets" | "uploaded_images" | "generated_images" }

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  console.log('🚀 Delete API called')
  
  try {
    // Parse request body
    const body = await req.json()
    console.log('📝 Request body:', body)
    
    const { id, table = "user_assets" } = body as Body
    if (!id) {
      console.log('❌ Missing ID in request')
      return NextResponse.json({ error: "missing_id" }, { status: 400 })
    }

    console.log('🔍 Processing delete request:', { id, table })

    // Create clients
    const supabase = createRouteHandlerClient({ cookies })
    console.log('✅ Supabase client created')
    
    let admin
    try {
      admin = getAdmin()
      console.log('✅ Admin client created')
    } catch (adminError) {
      console.error('❌ Admin client creation failed:', adminError)
      return NextResponse.json({ 
        error: "admin_client_failed", 
        detail: String(adminError) 
      }, { status: 500 })
    }

    // 1) Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      console.error('❌ Auth error:', authError)
      return NextResponse.json({ error: "auth_error", detail: authError.message }, { status: 500 })
    }
    
    if (!user) {
      console.log('❌ No authenticated user')
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
    }
    
    console.log('✅ User authenticated:', user.id)

    let actualTable = table
    let storage_path: string | null = null
    let row: any = null
    let source_id: string | null = null
    let asset_type: string | null = null

    // 2) If deleting from user_assets, we need to find the original table
    if (table === "user_assets") {
      console.log('🔍 Searching in user_assets, looking for original table...')
      
      // First, try to find in user_assets table
      const { data: userAssetRow, error: userAssetErr } = await supabase
        .from("user_assets")
        .select("id, user_id, asset_type, source_id, storage_path, image_url")
        .eq("user_id", user.id)
        .eq("id", id)
        .single()

      if (userAssetRow && !userAssetErr) {
        console.log('✅ Found in user_assets:', userAssetRow)
        source_id = userAssetRow.source_id
        asset_type = userAssetRow.asset_type
        storage_path = userAssetRow.storage_path
        
        // Now find the original record using source_id and asset_type
        if (asset_type === "uploaded") {
          actualTable = "uploaded_images"
          const { data: uploadedRow, error: uploadedErr } = await supabase
            .from("uploaded_images")
            .select("id, user_id, storage_path, image_url")
            .eq("user_id", user.id)
            .eq("id", source_id)
            .single()

          if (uploadedRow && !uploadedErr) {
            row = uploadedRow
            console.log('✅ Found original in uploaded_images:', { actualTable, source_id, storage_path })
          } else {
            console.log('⚠️ Original uploaded_images record not found, but user_assets exists')
            // Continue with deletion from user_assets only
            row = userAssetRow
          }
        } else if (asset_type === "generated") {
          actualTable = "generated_images"
          const { data: generatedRow, error: generatedErr } = await supabase
            .from("generated_images")
            .select("id, user_id, storage_path, image_url")
            .eq("user_id", user.id)
            .eq("id", source_id)
            .single()

          if (generatedRow && !generatedErr) {
            row = generatedRow
            console.log('✅ Found original in generated_images:', { actualTable, source_id, storage_path })
          } else {
            console.log('⚠️ Original generated_images record not found, but user_assets exists')
            // Continue with deletion from user_assets only
            row = userAssetRow
          }
        } else {
          console.log('❌ Unknown asset_type:', asset_type)
          return NextResponse.json({ error: "invalid_asset_type" }, { status: 400 })
        }
      } else {
        console.log('❌ Asset not found in user_assets')
        return NextResponse.json({ error: "not_found" }, { status: 404 })
      }
    } else {
      console.log('🔍 Direct table access for:', table)
      
      // Direct table access
      const { data: directRow, error: readErr } = await supabase
        .from(table)
        .select("id, user_id, storage_path, image_url")
        .eq("user_id", user.id)
        .eq("id", id)
        .single()

      if (readErr || !directRow) {
        console.log('❌ Direct table read failed:', readErr)
        return NextResponse.json({ error: "not_found" }, { status: 404 })
      }
      
      row = directRow
      storage_path = directRow.storage_path
      console.log('✅ Direct table read successful:', { actualTable: table, storage_path })
    }

    console.log(`🔍 Delete request for ${table} -> ${actualTable}:`, { id, source_id, asset_type, storage_path, row })

    // 3) Check if this asset has been sold (for logging purposes)
    let hasBeenSold = false
    try {
      console.log('🔍 Checking if asset has been sold...')
      const { data: buyers, error: buyersError } = await supabase
        .from('asset_buyers')
        .select('id')
        .eq('asset_id', id)

      if (buyersError) {
        console.error('❌ Error checking buyers:', buyersError)
      } else {
        hasBeenSold = buyers && buyers.length > 0
        console.log(`📊 Asset sold status: ${hasBeenSold} (${buyers?.length || 0} buyers)`)
      }
    } catch (error) {
      console.error('❌ Error checking asset sales:', error)
    }

    // Note: File preservation and revenue preservation will be handled by the database trigger
    // when user_assets is deleted. The trigger will:
    // 1. Copy revenue records to revenue_history
    // 2. Store metadata in deleted_images table
    // 3. The application layer should handle file copying separately

    // 5) Inactivate any active marketplace listing that references this asset
    try {
      console.log('🔄 Inactivating marketplace listings...')
      const { error: listingError } = await admin
        .from("marketplace_listings")
        .update({ status: "inactive" })
        .eq("seller_id", user.id)
        .eq("asset_id", id)
        .eq("status", "active")
      
      if (listingError) {
        console.log('⚠️ Marketplace listing update warning:', listingError)
      } else {
        console.log('✅ Marketplace listings updated')
      }
    } catch (listingError) {
      console.log('⚠️ Marketplace listing update failed (continuing):', listingError)
    }

    // 6) If asset was sold, copy the file to deleted-images bucket BEFORE deleting
    if (hasBeenSold && storage_path) {
      try {
        console.log('📁 Preserving sold asset file for physical delivery...')
        
        // Download the original file
        const bucketName = actualTable === "uploaded_images" ? "user-uploads" : "generated-images"
        const { data: fileData, error: downloadError } = await admin.storage
          .from(bucketName)
          .download(storage_path)

        if (downloadError) {
          console.error('❌ Error downloading file for preservation:', downloadError)
        } else if (fileData) {
          // Create new path for deleted images using original_asset_id
          // Use the original filename to preserve the original naming
          const originalFileName = row.file_name || 'image.jpg'
          const newPath = `${source_id}/${originalFileName}`
          
          // Upload to deleted-images bucket
          const { error: uploadError } = await admin.storage
            .from('deleted-images')
            .upload(newPath, fileData, {
              contentType: row.mime_type || 'image/jpeg',
              upsert: true
            })

          if (uploadError) {
            console.error('❌ Error uploading to deleted-images:', uploadError)
          } else {
            console.log('✅ Successfully preserved file for physical delivery:', newPath)
          }
        }
      } catch (error) {
        console.error('❌ Error in file preservation process:', error)
        // Continue even if file copying fails
      }
    }

    // 7) Delete Storage object (only if we have a path)
    if (storage_path) {
      const bucketName = actualTable === "uploaded_images" ? "user-uploads" : "generated-images"
      console.log(`🗑️ Deleting from bucket: ${bucketName}, path: ${storage_path}`)
      
      try {
        const { error: rmErr } = await admin.storage.from(bucketName).remove([storage_path])
        if (rmErr) {
          console.error(`❌ Storage delete failed for ${storage_path}:`, rmErr)
          // If Storage fails, stop here to avoid dangling DB row claiming a file that still exists
          return NextResponse.json({ error: "storage_delete_failed", detail: rmErr.message }, { status: 500 })
        }
        console.log(`✅ Successfully deleted from storage: ${storage_path}`)
      } catch (storageError) {
        console.error(`❌ Storage delete exception for ${storage_path}:`, storageError)
        return NextResponse.json({ 
          error: "storage_delete_exception", 
          detail: String(storageError) 
        }, { status: 500 })
      }
    } else {
      console.log('⚠️ No storage path found, skipping storage deletion')
    }

    // 8) Delete from original table if it exists
    if (source_id && asset_type && actualTable !== "user_assets") {
      console.log(`🗑️ Deleting from original table: ${actualTable}, source_id: ${source_id}`)
      const { error: delErr } = await admin.from(actualTable).delete().eq("id", source_id)
      if (delErr) {
        console.error('❌ Original table delete failed:', delErr)
        // Don't fail here - the user_assets record might still be valid
        console.log('⚠️ Continuing with user_assets deletion...')
      } else {
        console.log('✅ Original table record deleted successfully')
      }
    }

    // 9) Delete from user_assets table (this will trigger the database function)
    console.log(`🗑️ Deleting from user_assets table: ${id}`)
    const { error: userAssetDelErr } = await admin.from("user_assets").delete().eq("id", id)
    if (userAssetDelErr) {
      console.error('❌ User assets delete failed:', userAssetDelErr)
      return NextResponse.json({ error: "db_delete_failed", detail: userAssetDelErr.message }, { status: 500 })
    }
    
    console.log('✅ User assets record deleted successfully')


    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('💥 Unexpected error in delete API:', e)
    return NextResponse.json({ 
      error: "unexpected", 
      detail: String(e?.message || e),
      stack: e?.stack 
    }, { status: 500 })
  }
}
