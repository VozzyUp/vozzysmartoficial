/**
 * POST /api/inbox/media/upload - Upload media to Meta for sending via WhatsApp
 *
 * Accepts FormData with 'file'. Returns media_id for use in send message.
 * Meta limits: image 5MB, audio 16MB, video 16MB, document 100MB
 */

import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { safeJson } from '@/lib/server-http'

const MIME_TO_TYPE: Record<string, 'image' | 'audio' | 'video' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/3gpp': 'video',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/ogg': 'audio',
  'audio/aac': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'document',
  'text/plain': 'document',
  'text/csv': 'document',
}

const SIZE_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5MB
  audio: 16 * 1024 * 1024, // 16MB
  video: 16 * 1024 * 1024, // 16MB
  document: 100 * 1024 * 1024, // 100MB
}

export async function POST(request: NextRequest) {
  try {
    const credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken || !credentials?.phoneNumberId) {
      return NextResponse.json(
        { error: 'WhatsApp credentials not configured' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file in FormData' },
        { status: 400 }
      )
    }

    const contentType = file.type || 'application/octet-stream'
    const mediaType = MIME_TO_TYPE[contentType] || 'document'

    if (file.size > SIZE_LIMITS[mediaType]) {
      const limitMb = SIZE_LIMITS[mediaType] / (1024 * 1024)
      return NextResponse.json(
        {
          error: `File too large. Maximum for ${mediaType}: ${limitMb}MB`,
        },
        { status: 400 }
      )
    }

    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', contentType)
    form.append('file', file, file.name || 'file')

    const res = await fetch(
      `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
        },
        body: form,
      }
    )

    const body = await safeJson<{ id?: string; error?: { message?: string } }>(
      res
    )

    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`
      return NextResponse.json(
        { error: `Meta upload failed: ${msg}` },
        { status: 502 }
      )
    }

    const mediaId = body?.id
    if (!mediaId) {
      return NextResponse.json(
        { error: 'Meta did not return media ID' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      mediaId: String(mediaId),
      mediaType,
      filename: file.name,
    })
  } catch (error) {
    console.error('[POST /api/inbox/media/upload]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
