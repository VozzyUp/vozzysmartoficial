import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import fs from 'fs'
import path from 'path'
import type { VozSmartConfig } from '@/types/vozsmart-config'
import type { VersionInfo } from '@/types/version'
import { validateFilesToUpdate, normalizePath, isProtectedFile } from '@/lib/update-protection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ApplyUpdateResponse {
  success: boolean
  version?: string
  filesUpdated?: number
  backupPath?: string
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

    // 2. Buscar version.json do GitHub
    const versionUrl = `https://raw.githubusercontent.com/${config.templateRepo}/${config.templateBranch}/version.json`

    const versionResponse = await fetch(versionUrl, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
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

    // 5. Criar backup
    // Em ambientes serverless (Vercel), usar /tmp ao invés de .vozsmart-backups
    // pois o sistema de arquivos é somente leitura exceto em /tmp
    const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined
    
    let backupPath: string
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)
    
    if (isServerless) {
      // Em serverless, usar /tmp diretamente
      backupPath = path.join('/tmp', `vozsmart-backup-${timestamp}`)
    } else {
      // Em ambiente local, usar .vozsmart-backups
      const backupDir = path.join(process.cwd(), '.vozsmart-backups')
      try {
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true })
        }
        backupPath = path.join(backupDir, `backup-core-${timestamp}`)
      } catch (error) {
        // Se falhar, usar /tmp como fallback
        console.warn('[Updates Apply] Falha ao criar .vozsmart-backups, usando /tmp:', error)
        backupPath = path.join('/tmp', `vozsmart-backup-${timestamp}`)
      }
    }
    
    // Criar diretório de backup
    try {
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true })
      }
    } catch (error) {
      throw new Error(`Falha ao criar diretório de backup: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    }

    const updatedFiles: string[] = []
    const failedFiles: Array<{ file: string; error: string }> = []

    // 6. Fazer backup de todos os arquivos primeiro
    for (const file of filesToUpdate) {
      const normalized = normalizePath(file)
      if (!normalized) continue

      const localPath = path.join(process.cwd(), normalized)
      if (fs.existsSync(localPath)) {
        const backupFilePath = path.join(backupPath, normalized)
        const backupFileDir = path.dirname(backupFilePath)
        if (!fs.existsSync(backupFileDir)) {
          fs.mkdirSync(backupFileDir, { recursive: true })
        }
        fs.copyFileSync(localPath, backupFilePath)
      }
    }

    // 7. Download e atualização de cada arquivo
    for (const file of filesToUpdate) {
      try {
        // Normalizar e validar caminho
        const normalized = normalizePath(file)
        if (!normalized) {
          failedFiles.push({ file, error: 'Caminho inválido ou path traversal detectado' })
          continue
        }

        // Double-check: validar que arquivo não está protegido
        if (isProtectedFile(normalized, config.protectedFiles)) {
          failedFiles.push({ file, error: 'Arquivo protegido (validação dupla falhou)' })
          continue
        }

        const localPath = path.join(process.cwd(), normalized)

        // Download do arquivo do GitHub
        const rawUrl = `https://raw.githubusercontent.com/${config.templateRepo}/${config.templateBranch}/${normalized}`
        const fileResponse = await fetch(rawUrl, {
          headers: { Accept: 'text/plain, application/json, */*' },
          next: { revalidate: 0 },
        })

        if (!fileResponse.ok) {
          throw new Error(`Falha ao baixar ${normalized}: ${fileResponse.status} ${fileResponse.statusText}`)
        }

        const content = await fileResponse.text()

        // Garantir diretórios existem
        const localFileDir = path.dirname(localPath)
        if (!fs.existsSync(localFileDir)) {
          fs.mkdirSync(localFileDir, { recursive: true })
        }

        // Escrever arquivo
        fs.writeFileSync(localPath, content, 'utf8')
        updatedFiles.push(normalized)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido'
        failedFiles.push({ file, error: errorMsg })
        console.error(`[Updates Apply] Falha ao atualizar ${file}:`, errorMsg)
      }
    }

    // 8. Se houve falhas, fazer rollback completo de todos os arquivos atualizados
    if (failedFiles.length > 0) {
      console.error(`[Updates Apply] Falhas detectadas. Iniciando rollback completo de ${updatedFiles.length} arquivo(s)...`)

      // Restaurar todos os arquivos que foram atualizados
      for (const normalized of updatedFiles) {
        const backupFilePath = path.join(backupPath, normalized)
        const localPath = path.join(process.cwd(), normalized)

        if (fs.existsSync(backupFilePath)) {
          try {
            const localFileDir = path.dirname(localPath)
            if (!fs.existsSync(localFileDir)) {
              fs.mkdirSync(localFileDir, { recursive: true })
            }
            fs.copyFileSync(backupFilePath, localPath)
            console.log(`[Updates Apply] Rollback realizado para ${normalized}`)
          } catch (rollbackError) {
            console.error(`[Updates Apply] Falha no rollback de ${normalized}:`, rollbackError)
          }
        } else {
          // Se não havia backup (arquivo novo), deletar o arquivo criado
          try {
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath)
              console.log(`[Updates Apply] Arquivo novo removido: ${normalized}`)
            }
          } catch (deleteError) {
            console.error(`[Updates Apply] Falha ao remover arquivo novo ${normalized}:`, deleteError)
          }
        }
      }

      return NextResponse.json<ApplyUpdateResponse>(
        {
          success: false,
          error: `Falha ao atualizar ${failedFiles.length} arquivo(s): ${failedFiles.map(f => `${f.file} (${f.error})`).join(', ')}. Rollback completo realizado.`,
          backupPath,
        },
        { status: 500 }
      )
    }

    // 9. Atualizar vozsmart.config.json (apenas campos coreVersion e lastUpdate)
    const updatedConfig: VozSmartConfig = {
      ...config,
      coreVersion: latestVersion,
      lastUpdate: new Date().toISOString(),
    }
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8')

    return NextResponse.json<ApplyUpdateResponse>({
      success: true,
      version: latestVersion,
      filesUpdated: updatedFiles.length,
      backupPath,
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
