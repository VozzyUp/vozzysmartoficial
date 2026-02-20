import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { settingsDb } from '@/lib/supabase-db'
import { extractErrorMessage } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/prospecting/hasdata-key
 * Verifica se a chave HasData está configurada
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const key = await settingsDb.get('hasdata_api_key')
    return NextResponse.json({ configured: !!key })
  } catch (error) {
    console.error('[HasData Key GET] Erro:', error)
    return NextResponse.json(
      { configured: false, error: extractErrorMessage(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/prospecting/hasdata-key
 * Salva a chave HasData nas configurações
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body = await request.json()
    const { apiKey } = body

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json(
        { error: 'Chave API é obrigatória' },
        { status: 400 }
      )
    }

    await settingsDb.set('hasdata_api_key', apiKey.trim())

    return NextResponse.json({
      success: true,
      message: 'Chave API HasData salva com sucesso!',
    })
  } catch (error) {
    console.error('[HasData Key POST] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao salvar chave') },
      { status: 500 }
    )
  }
}
