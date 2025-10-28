import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 60

// Store chunks temporarily in Supabase Storage
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { chunk, chunkIndex, totalChunks, fileId } = data

    if (!chunk || chunkIndex === undefined || !totalChunks || !fileId) {
      return NextResponse.json(
        { error: 'Missing required chunk upload data' },
        { status: 400 }
      )
    }

    // Convert base64 chunk to buffer
    const buffer = Buffer.from(chunk, 'base64')

    // Store chunk in Supabase Storage
    const chunkFileName = `${fileId}_chunk_${chunkIndex}`
    const { error: uploadError } = await supabase.storage
      .from('temp-chunks')
      .upload(chunkFileName, buffer, {
        contentType: 'application/octet-stream',
        cacheControl: '3600',
        upsert: true
      })

    if (uploadError) {
      console.error('Chunk upload error:', uploadError)
      throw new Error(`Failed to upload chunk: ${uploadError.message}`)
    }

    // Check if this is the last chunk
    const isLastChunk = chunkIndex === totalChunks - 1

    if (isLastChunk) {
      try {
        // Download all chunks and combine them
        const chunks = []
        for (let i = 0; i < totalChunks; i++) {
          const tempChunkFileName = `${fileId}_chunk_${i}`
          const { data: chunkData, error: downloadError } = await supabase.storage
            .from('temp-chunks')
            .download(tempChunkFileName)

          if (downloadError) {
            throw new Error(`Failed to download chunk ${i}: ${downloadError.message}`)
          }

          const chunkBuffer = Buffer.from(await chunkData.arrayBuffer())
          chunks.push(chunkBuffer)

          // Clean up chunk file
          await supabase.storage
            .from('temp-chunks')
            .remove([tempChunkFileName])
        }

        // Combine chunks into final file
        const finalBuffer = Buffer.concat(chunks)
        const finalFileName = `${fileId}_final.jpg`

        // Upload final file to Supabase Storage
        const { data: finalUpload, error: finalError } = await supabase.storage
          .from('user-uploads')
          .upload(finalFileName, finalBuffer, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false
          })

        if (finalError) {
          throw new Error(`Failed to upload final file: ${finalError.message}`)
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('user-uploads')
          .getPublicUrl(finalFileName)

        return NextResponse.json({
          success: true,
          imageUrl: urlData.publicUrl,
          fileName: finalFileName
        })

      } catch (error) {
        console.error('Error combining chunks:', error)
        throw error
      }
    }

    // If not the last chunk, return success for this chunk
    return NextResponse.json({
      success: true,
      chunkIndex,
      message: 'Chunk uploaded successfully'
    })

  } catch (error) {
    console.error('Error handling chunk upload:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    )
  }
}
