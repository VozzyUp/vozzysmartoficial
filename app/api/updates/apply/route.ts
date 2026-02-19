import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import fs from 'fs'
import path from 'path'
import type { VozSmartConfig } from '@/types/vozsmart-config'
import type { VersionInfo } from '@/types/version'
import { validateFilesToUpdate, normalizePath } from '@/lib/update-protection'
import {
  getGitHubRepoFromVercel,
  getGitHubToken,
  updateFilesViaGitHub,
  updateConfigFile,
  type GitHubFileCommit,
} from '@/lib/github-update'
import { triggerDeployment } from '@/lib/vercel-api'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ApplyUpdateResponse {
  success: boolean
  version?: string
  filesUpdated?: number
  commits?: Array<{ path: string; commit: { sha: string; url: string } }>
  redeployTriggered?: boolean
  needsAuth?: boolean
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    // Autenticação obrigatória
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    // 1. Validar pré-requisitos
    const configPath = path.join(process.cwd(), 'vozsmart.config.json')

    if (!fs.existsSync(configPath)) {
      return NextResponse.json<ApplyUpdateResponse>(
        {
          success: false,
          error: 'Arquivo vozsmart.config.json não encontrado',
        },
        { status: 404 }
      )
    }

    const configRaw = fs.readFileSync(configPath, 'utf8')
    const config: VozSmartConfig = JSON.parse(configRaw)

    // 2. Buscar version.json do GitHub template
    const versionUrl = `https://raw.githubusercontent.com/${config.templateRepo}/${config.templateBranch}/version.json`

    const versionResponse = await fetch(versionUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })

    if (!versionResponse.ok) {
      throw new Error(`Falha ao buscar version.json: ${versionResponse.status}`)
    }

    const versionData: VersionInfo = await versionResponse.json()
    const latestVersion = versionData.version
    const filesToUpdate = versionData.filesToUpdate || []

    // 3. Validar que versão do GitHub é diferente da local
    if (config.coreVersion === latestVersion) {
      return NextResponse.json<ApplyUpdateResponse>(
        {
          success: false,
          error: `Já está na versão mais recente (${latestVersion})`,
        },
        { status: 400 }
      )
    }

    // 4. Validar que filesToUpdate não contém arquivos protegidos
    const validation = validateFilesToUpdate(filesToUpdate, config.protectedFiles)

    if (!validation.valid) {
      return NextResponse.json<ApplyUpdateResponse>(
        {
          success: false,
          error: `Erro de segurança: Tentativa de atualizar arquivos protegidos: ${validation.blocked.join(', ')}`,
        },
        { status: 403 }
      )
    }

    // 5. Obter informações do GitHub conectado no Vercel
    const repoInfo = await getGitHubRepoFromVercel()

    if (!repoInfo) {
      return NextResponse.json<ApplyUpdateResponse>(
        {
          success: false,
          error: 'GitHub não está conectado ao Vercel. Configure a conexão nas configurações do projeto Vercel.',
        },
        { status: 400 }
      )
    }

    // 6. Obter token GitHub
    const githubToken = await getGitHubToken()

    if (!githubToken) {
      return NextResponse.json<ApplyUpdateResponse>(
        {
          success: false,
          needsAuth: true,
          error: 'Token GitHub não configurado. Configure GITHUB_TOKEN nas variáveis de ambiente do Vercel ou conecte via UI.',
        },
        { status: 401 }
      )
    }

    // 7. Download de arquivos do template e preparar commits
    const filesToCommit: GitHubFileCommit[] = []

    for (const file of filesToUpdate) {
      const normalized = normalizePath(file)
      if (!normalized) {
        continue // Pular arquivos com caminho inválido
      }

      // Download do arquivo do template
      const rawUrl = `https://raw.githubusercontent.com/${config.templateRepo}/${config.templateBranch}/${normalized}`
      const fileResponse = await fetch(rawUrl, {
        headers: { Accept: 'text/plain, application/json, */*' },
        cache: 'no-store',
      })

      if (!fileResponse.ok) {
        throw new Error(`Falha ao baixar ${normalized}: ${fileResponse.status} ${fileResponse.statusText}`)
      }

      const content = await fileResponse.text()

      filesToCommit.push({
        path: normalized,
        content,
        message: `chore: atualizar ${normalized} para versão ${latestVersion}`,
      })
    }

    // 8. Atualizar arquivos via GitHub API
    const commitResults = await updateFilesViaGitHub({
      token: githubToken,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch: repoInfo.branch,
      files: filesToCommit,
    })

    // 9. Atualizar vozsmart.config.json no GitHub
    const configCommit = await updateConfigFile({
      token: githubToken,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      branch: repoInfo.branch,
      coreVersion: latestVersion,
    })

    // 10. Trigger redeploy no Vercel
    let redeployTriggered = false
    const vercelToken = process.env.VERCEL_TOKEN
    const projectId = process.env.VERCEL_PROJECT_ID
    const teamId = process.env.VERCEL_TEAM_ID || undefined

    if (vercelToken && projectId) {
      try {
        const redeployResult = await triggerDeployment(vercelToken, projectId, teamId)
        if (redeployResult.success) {
          redeployTriggered = true
          console.log('[Updates Apply] Redeploy Vercel iniciado com sucesso')
        } else {
          console.warn('[Updates Apply] Falha ao iniciar redeploy Vercel:', redeployResult.error)
        }
      } catch (error) {
        console.error('[Updates Apply] Erro ao trigger redeploy:', error)
        // Não falhar a atualização se redeploy falhar
      }
    } else {
      // Tentar usar deploy hook como fallback
      const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
      if (deployHookUrl) {
        try {
          const hookResponse = await fetch(deployHookUrl, {
            method: 'POST',
            cache: 'no-store',
          })
          if (hookResponse.ok) {
            redeployTriggered = true
            console.log('[Updates Apply] Redeploy via deploy hook iniciado')
          }
        } catch (error) {
          console.error('[Updates Apply] Erro ao trigger deploy hook:', error)
        }
      }
    }

    return NextResponse.json<ApplyUpdateResponse>({
      success: true,
      version: latestVersion,
      filesUpdated: commitResults.length,
      commits: [
        ...commitResults,
        {
          path: 'vozsmart.config.json',
          commit: configCommit.commit,
        },
      ],
      redeployTriggered,
    })
  } catch (error) {
    console.error('[Updates Apply] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao aplicar atualização'
    return NextResponse.json<ApplyUpdateResponse>(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
