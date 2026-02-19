'use client'

import React, { useState, useCallback } from 'react'
import { RefreshCw, Download, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { Container } from '@/components/ui/container'
import { toast } from 'sonner'

interface UpdateInfo {
  current: string | null
  latest: string | null
  hasUpdate: boolean
  changelog: string[]
  filesToUpdate: string[]
  requiresMigration: boolean
  breakingChanges: string[]
  error?: string
}

interface ApplyResult {
  success: boolean
  version?: string
  filesUpdated?: number
  backupPath?: string
  error?: string
}

export const UpdatePanel: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true)
    setUpdateInfo(null)

    try {
      const response = await fetch('/api/updates/check')
      const data: UpdateInfo = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Erro ao verificar atualizações')
        setUpdateInfo(data)
        return
      }

      setUpdateInfo(data)

      if (data.hasUpdate) {
        toast.success(`Versão ${data.latest} disponível!`)
      } else {
        toast.info('Você está na versão mais recente')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao verificar atualizações'
      toast.error(message)
      setUpdateInfo({
        current: null,
        latest: null,
        hasUpdate: false,
        changelog: [],
        filesToUpdate: [],
        requiresMigration: false,
        breakingChanges: [],
        error: message,
      })
    } finally {
      setIsChecking(false)
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    if (!updateInfo?.hasUpdate) return

    setIsApplying(true)

    try {
      const response = await fetch('/api/updates/apply', {
        method: 'POST',
      })

      const result: ApplyResult = await response.json()

      if (!response.ok || !result.success) {
        toast.error(result.error || 'Erro ao aplicar atualização')
        return
      }

      toast.success(`Atualização aplicada com sucesso! Versão ${result.version}`)
      
      // Recarregar página após 2 segundos para aplicar mudanças
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao aplicar atualização'
      toast.error(message)
    } finally {
      setIsApplying(false)
    }
  }, [updateInfo])

  return (
    <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--ds-text-primary)] mb-1">
            Atualizações do Sistema
          </h3>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            Verifique e aplique atualizações do template
          </p>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={isChecking || isApplying}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--ds-bg-hover)] hover:bg-[var(--ds-bg-surface)] text-[var(--ds-text-primary)] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--ds-border-default)]"
        >
          {isChecking ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Verificar Atualizações
        </button>
      </div>

      {updateInfo && (
        <div className="mt-4 space-y-4">
          {/* Versão atual */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ds-text-muted)]">Versão atual:</span>
            <span className="font-mono font-medium text-[var(--ds-text-primary)]">
              {updateInfo.current || 'Desconhecida'}
            </span>
          </div>

          {/* Erro */}
          {updateInfo.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-400">{updateInfo.error}</p>
              </div>
            </div>
          )}

          {/* Atualização disponível */}
          {updateInfo.hasUpdate && !updateInfo.error && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-blue-400">
                      Versão {updateInfo.latest} disponível
                    </span>
                    {updateInfo.requiresMigration && (
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/20">
                        Requer migração
                      </span>
                    )}
                  </div>
                  {updateInfo.filesToUpdate.length > 0 && (
                    <p className="text-xs text-[var(--ds-text-muted)]">
                      {updateInfo.filesToUpdate.length} arquivo(s) serão atualizados
                    </p>
                  )}
                </div>
                <button
                  onClick={applyUpdate}
                  disabled={isApplying}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApplying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Aplicando...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Aplicar Atualização
                    </>
                  )}
                </button>
              </div>

              {/* Breaking changes */}
              {updateInfo.breakingChanges.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
                  <p className="text-xs font-semibold text-yellow-400 mb-2">
                    Mudanças importantes:
                  </p>
                  <ul className="text-xs text-yellow-300/80 space-y-1 list-disc list-inside">
                    {updateInfo.breakingChanges.map((change, idx) => (
                      <li key={idx}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Changelog */}
              {updateInfo.changelog.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--ds-text-primary)] mb-2">
                    Mudanças nesta versão:
                  </p>
                  <ul className="text-xs text-[var(--ds-text-secondary)] space-y-1 list-disc list-inside">
                    {updateInfo.changelog.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Arquivos a atualizar (expandível) */}
              {updateInfo.filesToUpdate.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]">
                    Ver arquivos que serão atualizados ({updateInfo.filesToUpdate.length})
                  </summary>
                  <div className="mt-2 space-y-1 font-mono text-[var(--ds-text-muted)]">
                    {updateInfo.filesToUpdate.slice(0, 20).map((file, idx) => (
                      <div key={idx} className="pl-2">
                        {file}
                      </div>
                    ))}
                    {updateInfo.filesToUpdate.length > 20 && (
                      <div className="pl-2 text-[var(--ds-text-muted)]">
                        ... e mais {updateInfo.filesToUpdate.length - 20} arquivo(s)
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Sem atualização */}
          {!updateInfo.hasUpdate && !updateInfo.error && updateInfo.latest && (
            <div className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)]">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span>Você está na versão mais recente ({updateInfo.latest})</span>
            </div>
          )}
        </div>
      )}
    </Container>
  )
}
