import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { settingsDb } from '@/lib/supabase-db'
import { upsertEnvVar, triggerDeployment } from '@/lib/vercel-api'
import { extractErrorMessage } from '@/lib/api-validation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SaveHasDataKeyRequest {
  apiKey: string
}

interface SaveHasDataKeyResponse {
  success: boolean
  error?: string
  message?: string
  redeployTriggered?: boolean
}

interface HasDataKeyStatusResponse {
  configured: boolean
}

/**
 * GET /api/prospecting/hasdata-key
 * Retorna se a chave HasData está configurada (sem expor o valor)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const envKey = process.env.HASDATA_API_KEY
    const settingsKey = await settingsDb.get('hasdata_api_key')

    return NextResponse.json<HasDataKeyStatusResponse>({
      configured: !!(envKey || settingsKey),
    })
  } catch (error) {
    console.error('[HasData Key GET] Erro:', error)
    return NextResponse.json(
      { error: extractErrorMessage(error, 'Falha ao verificar status') },
      { status: 500 }
    )
  }
}

/**
 * POST /api/prospecting/hasdata-key
 * Salva a chave HasData em settings (cache local) e no Vercel (variável de ambiente)
 * Dispara redeploy para que o Vercel reconheça a nova variável
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body: SaveHasDataKeyRequest = await request.json()
    const apiKey = body.apiKey?.trim()

    if (!apiKey) {
      return NextResponse.json<SaveHasDataKeyResponse>(
        {
          success: false,
          error: 'Digite a chave API do HasData',
        },
        { status: 400 }
      )
    }

    // 1. Salvar em settings (cache local imediato - usado até o Vercel atualizar)
    await settingsDb.set('hasdata_api_key', apiKey)

    // 2. Salvar no Vercel como variável de ambiente
    const vercelToken = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN
    const projectId = process.env.VERCEL_PROJECT_ID
    const teamId = process.env.VERCEL_TEAM_ID || undefined

    if (!vercelToken || !projectId) {
      return NextResponse.json<SaveHasDataKeyResponse>({
        success: true,
        message:
          'Chave salva com sucesso (cache local). Configure VERCEL_TOKEN e VERCEL_PROJECT_ID para sincronizar com o Vercel.',
        redeployTriggered: false,
      })
    }

    const saveResult = await upsertEnvVar(
      vercelToken,
      projectId,
      {
        key: 'HASDATA_API_KEY',
        value: apiKey,
      },
      teamId
    )

    if (!saveResult.success) {
      return NextResponse.json<SaveHasDataKeyResponse>(
        {
          success: false,
          error: saveResult.error || 'Erro ao salvar chave no Vercel',
        },
        { status: 500 }
      )
    }

    // 3. Disparar redeploy
    let redeployTriggered = false

    try {
      const redeployResult = await triggerDeployment(vercelToken, projectId, teamId)
      if (redeployResult.success) {
        redeployTriggered = true
        console.log('[HasData Key] Redeploy iniciado via API:', redeployResult.data?.uid)
      }
    } catch (e) {
      console.warn('[HasData Key] Erro ao iniciar redeploy via API:', e)
    }

    if (!redeployTriggered) {
      const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
      if (deployHookUrl) {
        try {
          const hookResponse = await fetch(deployHookUrl, { method: 'POST', cache: 'no-store' })
          if (hookResponse.ok) {
            redeployTriggered = true
            console.log('[HasData Key] Redeploy iniciado via deploy hook')
          }
        } catch (e) {
          console.warn('[HasData Key] Erro ao trigger deploy hook:', e)
        }
      }
    }

    return NextResponse.json<SaveHasDataKeyResponse>({
      success: true,
      message: redeployTriggered
        ? 'Chave HasData salva! O sistema usa o cache local até o Vercel ser atualizado. Um novo deploy foi iniciado.'
        : 'Chave HasData salva! O sistema usa o cache local. Um redeploy será necessário para aplicar no Vercel.',
      redeployTriggered,
    })
  } catch (error) {
    console.error('[HasData Key POST] Erro:', error)
    return NextResponse.json<SaveHasDataKeyResponse>(
      {
        success: false,
        error: extractErrorMessage(error, 'Erro ao salvar chave'),
      },
      { status: 500 }
    )
  }
}
