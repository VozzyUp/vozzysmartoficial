import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import fs from 'fs'
import path from 'path'
import type { VozSmartConfig } from '@/types/vozsmart-config'
import type { VersionInfo } from '@/types/version'
import { validateFilesToUpdate } from '@/lib/update-protection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface CheckUpdateResponse {
  current: string | null
  latest: string | null
  hasUpdate: boolean
  changelog: string[]
  filesToUpdate: string[]
  requiresMigration: boolean
  breakingChanges: string[]
  error?: string
}

export async function GET(request: NextRequest) {
  try {
    // Autenticação obrigatória
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    // 1. Ler vozsmart.config.json local
    const configPath = path.join(process.cwd(), 'vozsmart.config.json')

    if (!fs.existsSync(configPath)) {
      return NextResponse.json<CheckUpdateResponse>(
        {
          current: null,
          latest: null,
          hasUpdate: false,
          changelog: [],
          filesToUpdate: [],
          requiresMigration: false,
          breakingChanges: [],
          error: 'Arquivo vozsmart.config.json não encontrado. Este recurso está disponível apenas para instâncias configuradas.',
        },
        { status: 404 }
      )
    }

    const configRaw = fs.readFileSync(configPath, 'utf8')
    const config: VozSmartConfig = JSON.parse(configRaw)
    const currentVersion = config.coreVersion

    // 2. Buscar version.json do GitHub template
    const versionUrl = `https://raw.githubusercontent.com/${config.templateRepo}/${config.templateBranch}/version.json`

    const response = await fetch(versionUrl, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 0 }, // Sempre buscar versão mais recente
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json<CheckUpdateResponse>(
          {
            current: currentVersion,
            latest: null,
            hasUpdate: false,
            changelog: [],
            filesToUpdate: [],
            requiresMigration: false,
            breakingChanges: [],
            error: `Arquivo version.json não encontrado no repositório ${config.templateRepo}. Verifique se o repositório template está configurado corretamente.`,
          },
          { status: 404 }
        )
      }
      throw new Error(`Falha ao buscar version.json: ${response.status} ${response.statusText}`)
    }

    const latestData: VersionInfo = await response.json()
    const latestVersion = latestData.version

    // 3. Validar que filesToUpdate não contém arquivos protegidos
    const validation = validateFilesToUpdate(latestData.filesToUpdate, config.protectedFiles)

    if (!validation.valid) {
      return NextResponse.json<CheckUpdateResponse>(
        {
          current: currentVersion,
          latest: latestVersion,
          hasUpdate: false,
          changelog: latestData.changelog,
          filesToUpdate: [],
          requiresMigration: latestData.requiresMigration,
          breakingChanges: latestData.breakingChanges,
          error: `Erro de segurança: A versão ${latestVersion} tenta atualizar arquivos protegidos: ${validation.blocked.join(', ')}. Entre em contato com o suporte.`,
        },
        { status: 403 }
      )
    }

    // 4. Comparar versões (usando comparação simples de strings, pode melhorar com semver depois)
    const hasUpdate = currentVersion !== latestVersion

    return NextResponse.json<CheckUpdateResponse>({
      current: currentVersion,
      latest: latestVersion,
      hasUpdate,
      changelog: latestData.changelog || [],
      filesToUpdate: latestData.filesToUpdate || [],
      requiresMigration: latestData.requiresMigration || false,
      breakingChanges: latestData.breakingChanges || [],
    })
  } catch (error) {
    console.error('[Updates Check] Erro:', error)
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao verificar atualizações'
    return NextResponse.json<CheckUpdateResponse>(
      {
        current: null,
        latest: null,
        hasUpdate: false,
        changelog: [],
        filesToUpdate: [],
        requiresMigration: false,
        breakingChanges: [],
        error: message,
      },
      { status: 500 }
    )
  }
}
