import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { validateGitHubToken } from '@/lib/installer/github'
import { upsertEnvVar } from '@/lib/vercel-api'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface SaveTokenRequest {
  token: string
}

interface SaveTokenResponse {
  success: boolean
  error?: string
  message?: string
}

export async function POST(request: NextRequest) {
  try {
    // Autenticação obrigatória
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const body: SaveTokenRequest = await request.json()
    const { token } = body

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return NextResponse.json<SaveTokenResponse>(
        {
          success: false,
          error: 'Digite um token GitHub',
        },
        { status: 400 }
      )
    }

    // Validar formato básico (deve começar com ghp_)
    if (!token.trim().startsWith('ghp_')) {
      return NextResponse.json<SaveTokenResponse>(
        {
          success: false,
          error: "Token deve começar com 'ghp_'",
        },
        { status: 400 }
      )
    }

    // Validar token GitHub
    const validation = await validateGitHubToken(token.trim())

    if (!validation.ok) {
      return NextResponse.json<SaveTokenResponse>(
        {
          success: false,
          error: validation.error || 'Token GitHub inválido ou expirado',
        },
        { status: 401 }
      )
    }

    // Obter credenciais Vercel
    // Tentar VERCEL_API_TOKEN primeiro, depois VERCEL_TOKEN
    const vercelToken = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN
    const projectId = process.env.VERCEL_PROJECT_ID
    const teamId = process.env.VERCEL_TEAM_ID || undefined

    if (!vercelToken) {
      return NextResponse.json<SaveTokenResponse>(
        {
          success: false,
          error: 'VERCEL_TOKEN ou VERCEL_API_TOKEN não configurado. Não é possível salvar variável de ambiente.',
        },
        { status: 500 }
      )
    }

    if (!projectId) {
      return NextResponse.json<SaveTokenResponse>(
        {
          success: false,
          error: 'VERCEL_PROJECT_ID não configurado. Não é possível salvar variável de ambiente.',
        },
        { status: 500 }
      )
    }

    // Salvar token no Vercel
    const saveResult = await upsertEnvVar(
      vercelToken,
      projectId,
      {
        key: 'GITHUB_TOKEN',
        value: token.trim(),
      },
      teamId
    )

    if (!saveResult.success) {
      return NextResponse.json<SaveTokenResponse>(
        {
          success: false,
          error: saveResult.error || 'Erro ao salvar token no Vercel',
        },
        { status: 500 }
      )
    }

    return NextResponse.json<SaveTokenResponse>({
      success: true,
      message: 'Token GitHub salvo com sucesso! Aguarde alguns segundos e clique em "Verificar" novamente para atualizar o status.',
    })
  } catch (error) {
    console.error('[Save GitHub Token] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json<SaveTokenResponse>(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
