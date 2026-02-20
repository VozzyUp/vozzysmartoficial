import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { settingsDb } from '@/lib/supabase-db'
import { extractErrorMessage } from '@/lib/api-validation'
import { triggerDeployment } from '@/lib/vercel-api'

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

    // Trigger redeploy para que o Vercel reconheça a nova variável de ambiente
    let redeployTriggered = false
    
    // Tentar primeiro via API do Vercel
    try {
      const vercelToken = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN
      const projectId = process.env.VERCEL_PROJECT_ID
      const teamId = process.env.VERCEL_TEAM_ID || undefined

      if (vercelToken && projectId) {
        const redeployResult = await triggerDeployment(vercelToken, projectId, teamId)
        if (redeployResult.success) {
          redeployTriggered = true
          console.log('[HasData Key] Redeploy iniciado via API:', redeployResult.data?.uid)
        } else {
          console.warn('[HasData Key] Falha ao iniciar redeploy via API:', redeployResult.error)
        }
      }
    } catch (error) {
      console.error('[HasData Key] Erro ao iniciar redeploy via API:', error)
    }
    
    // Se não funcionou via API, tentar deploy hook como fallback
    if (!redeployTriggered) {
      const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
      if (deployHookUrl) {
        try {
          const hookResponse = await fetch(deployHookUrl, {
            method: 'POST',
            cache: 'no-store',
          })
          if (hookResponse.ok) {
            redeployTriggered = true
            console.log('[HasData Key] Redeploy iniciado via deploy hook')
          }
        } catch (error) {
          console.error('[HasData Key] Erro ao trigger deploy hook:', error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: redeployTriggered
        ? 'Chave API HasData salva com sucesso! Um novo deploy foi iniciado para aplicar as mudanças.'
        : 'Chave API HasData salva com sucesso! Um novo deploy será necessário para aplicar as mudanças.',
      redeployTriggered,
    })
  } catch (error) {
    console.error('[HasData Key POST] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao salvar chave') },
      { status: 500 }
    )
  }
}
