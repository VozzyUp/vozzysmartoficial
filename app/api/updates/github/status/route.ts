import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { getGitHubRepoFromVercel, getGitHubToken } from '@/lib/github-update'
import { validateGitHubToken } from '@/lib/installer/github'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface GitHubStatusResponse {
  connected: boolean
  repo?: {
    owner: string
    repo: string
    branch: string
  }
  tokenValid?: boolean
  error?: string
}

export async function GET(request: NextRequest) {
  try {
    // Autenticação obrigatória
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    // 1. Verificar se GitHub está conectado no Vercel
    const repoInfo = await getGitHubRepoFromVercel()

    if (!repoInfo) {
      return NextResponse.json<GitHubStatusResponse>({
        connected: false,
        error: 'GitHub não está conectado ao Vercel. Configure a conexão nas configurações do projeto Vercel.',
      })
    }

    // 2. Verificar se temos token GitHub
    const token = await getGitHubToken()

    if (!token) {
      return NextResponse.json<GitHubStatusResponse>({
        connected: true,
        repo: repoInfo,
        tokenValid: false,
        error: 'Token GitHub não configurado. Configure GITHUB_TOKEN nas variáveis de ambiente ou conecte via UI.',
      })
    }

    // 3. Validar token GitHub
    const tokenValidation = await validateGitHubToken(token)

    if (!tokenValidation.ok) {
      return NextResponse.json<GitHubStatusResponse>({
        connected: true,
        repo: repoInfo,
        tokenValid: false,
        error: tokenValidation.error || 'Token GitHub inválido ou expirado',
      })
    }

    return NextResponse.json<GitHubStatusResponse>({
      connected: true,
      repo: repoInfo,
      tokenValid: true,
    })
  } catch (error) {
    console.error('[GitHub Status] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    return NextResponse.json<GitHubStatusResponse>(
      {
        connected: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
