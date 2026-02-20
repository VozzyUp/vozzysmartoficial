/**
 * T023, T024: GET/POST /api/inbox/conversations/[id]/messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractErrorMessage } from '@/lib/api-validation'
import { listMessages, sendMessage } from '@/lib/inbox/inbox-service'

// Regex para ISO 8601 datetime com precisão variável (Supabase pode retornar 1-6 dígitos)
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

const querySchema = z.object({
  before: z.string().regex(ISO_DATETIME_REGEX, 'Invalid ISO datetime').optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
})

const postSchema = z.object({
  content: z.string().max(4096).default(''),
  message_type: z
    .enum(['text', 'template', 'image', 'video', 'audio', 'document'])
    .default('text'),
  template_name: z.string().optional(),
  template_params: z.record(z.string(), z.array(z.string())).optional(),
  media_id: z.string().optional(),
  media_url: z.string().url().optional(),
  filename: z.string().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    const parsed = querySchema.safeParse({
      before: searchParams.get('before') || undefined,
      limit: searchParams.get('limit') || 50,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await listMessages(id, {
      before: parsed.data.before,
      limit: parsed.data.limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GET /api/inbox/conversations/[id]/messages]', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const body = await request.json()

    const parsed = postSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const {
      content,
      message_type,
      template_name,
      template_params,
      media_id,
      media_url,
      filename,
    } = parsed.data

    // Validate template requirements
    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required when message_type is template' },
        { status: 400 }
      )
    }

    // Validate media requirements
    if (
      (message_type === 'image' || message_type === 'video' || message_type === 'audio') &&
      !media_id &&
      !media_url
    ) {
      return NextResponse.json(
        {
          error: `media_id or media_url is required when message_type is ${message_type}`,
        },
        { status: 400 }
      )
    }

    if (
      message_type === 'document' &&
      ((!media_id && !media_url) || !filename)
    ) {
      return NextResponse.json(
        {
          error:
            'media_id or media_url and filename are required when message_type is document',
        },
        { status: 400 }
      )
    }

    // Validate text/template: content required
    if (
      (message_type === 'text' || message_type === 'template') &&
      !content?.trim()
    ) {
      return NextResponse.json(
        { error: 'content is required for text and template messages' },
        { status: 400 }
      )
    }

    const message = await sendMessage(id, {
      content: content ?? '',
      message_type,
      template_name,
      template_params,
      media_id,
      media_url,
      filename,
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    console.error('[POST /api/inbox/conversations/[id]/messages]', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}
