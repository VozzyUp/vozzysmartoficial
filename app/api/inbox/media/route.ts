/**
 * GET /api/inbox/media - Proxy for Meta WhatsApp media URLs
 *
 * Meta webhook URLs expire. This route fetches media using the access token
 * and streams it to the client.
 *
 * Query: ?messageId=<uuid> - fetches media_url from inbox_messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { getMessageById } from '@/lib/inbox/inbox-db'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout } from '@/lib/server-http'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json(
        { error: 'messageId query parameter is required' },
        { status: 400 }
      )
    }

    const message = await getMessageById(messageId)
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const mediaUrl = message.media_url
    if (!mediaUrl || typeof mediaUrl !== 'string') {
      return NextResponse.json(
        { error: 'Message has no media' },
        { status: 404 }
      )
    }

    // Only allow Meta media URLs to prevent proxy abuse
    let urlObj: URL
    try {
      urlObj = new URL(mediaUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid media URL' }, { status: 400 })
    }
    const host = urlObj.hostname
    const isMetaUrl =
      host === 'graph.facebook.com' ||
      host === 'www.facebook.com' ||
      host === 'cdn.fbsbx.com' ||
      host.endsWith('.facebook.com') ||
      host.endsWith('.fbcdn.net')
    if (!isMetaUrl) {
      return NextResponse.json(
        { error: 'Invalid media URL' },
        { status: 400 }
      )
    }

    const credentials = await getWhatsAppCredentials()
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp credentials not configured' },
        { status: 503 }
      )
    }

    const response = await fetchWithTimeout(mediaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
      },
      timeoutMs: 15000,
    })

    if (!response.ok) {
      console.warn(
        `[inbox/media] Meta media fetch failed: ${response.status} for message ${messageId}`
      )
      return NextResponse.json(
        { error: 'Failed to fetch media from Meta' },
        { status: 502 }
      )
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream'

    const blob = await response.blob()
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[GET /api/inbox/media]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
