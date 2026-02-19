import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { UpdateProspectingConfigSchema, validateBody, formatZodErrors, extractErrorMessage } from '@/lib/api-validation'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: {
    id: string
  }
}

/**
 * PUT /api/prospecting/configs/[id]
 * Atualiza configuração de prospecção
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const { id } = params
    if (!id) {
      return NextResponse.json(
        { error: 'ID é obrigatório' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validar input
    const validation = validateBody(UpdateProspectingConfigSchema, body)
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

    const { data, error } = await supabase
      .from('prospecting_configs')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Configuração não encontrada' },
          { status: 404 }
        )
      }
      throw error
    }

    // Converter jsonb para arrays
    const config = {
      ...data,
      localizacoes: Array.isArray(data.localizacoes) ? data.localizacoes : [],
      variacoes: Array.isArray(data.variacoes) ? data.variacoes : [],
    }

    return NextResponse.json(config)
  } catch (error) {
    console.error('[Prospecting Configs PUT] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao atualizar configuração') },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/prospecting/configs/[id]
 * Deleta configuração de prospecção
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const { id } = params
    if (!id) {
      return NextResponse.json(
        { error: 'ID é obrigatório' },
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

    const { error } = await supabase
      .from('prospecting_configs')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Prospecting Configs DELETE] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao deletar configuração') },
      { status: 500 }
    )
  }
}
