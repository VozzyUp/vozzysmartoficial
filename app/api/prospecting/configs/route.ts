import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { ProspectingConfigSchema, validateBody, formatZodErrors, extractErrorMessage } from '@/lib/api-validation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { settingsDb } from '@/lib/supabase-db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/prospecting/configs
 * Lista todas as configurações de prospecção
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase não configurado' },
        { status: 500 }
      )
    }

    const { data, error } = await supabase
      .from('prospecting_configs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    // Converter jsonb para arrays
    const configs = (data || []).map(config => ({
      ...config,
      localizacoes: Array.isArray(config.localizacoes) ? config.localizacoes : [],
      variacoes: Array.isArray(config.variacoes) ? config.variacoes : [],
    }))

    return NextResponse.json(configs)
  } catch (error) {
    console.error('[Prospecting Configs GET] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao buscar configurações') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/prospecting/configs
 * Cria nova configuração de prospecção
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body = await request.json()

    // Validar input
    const validation = validateBody(ProspectingConfigSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: formatZodErrors(validation.error) },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase não configurado' },
        { status: 500 }
      )
    }

    const hasdataApiKey =
      (validation.data.hasdata_api_key && validation.data.hasdata_api_key.trim()) ||
      (await settingsDb.get('hasdata_api_key')) ||
      process.env.HASDATA_API_KEY ||
      ''

    if (!hasdataApiKey) {
      return NextResponse.json(
        { error: 'Configure a chave API HasData em Modelo de busca antes de criar um modelo.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('prospecting_configs')
      .insert({
        name: validation.data.name,
        nicho: validation.data.nicho,
        localizacoes: validation.data.localizacoes,
        variacoes: validation.data.variacoes,
        paginas_por_localizacao: validation.data.paginas_por_localizacao,
        hasdata_api_key: hasdataApiKey,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Converter jsonb para arrays
    const config = {
      ...data,
      localizacoes: Array.isArray(data.localizacoes) ? data.localizacoes : [],
      variacoes: Array.isArray(data.variacoes) ? data.variacoes : [],
    }

    return NextResponse.json(config, { status: 201 })
  } catch (error) {
    console.error('[Prospecting Configs POST] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao criar configuração') },
      { status: 500 }
    )
  }
}
