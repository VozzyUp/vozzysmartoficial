'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { RefreshCw, Download, CheckCircle2, AlertCircle, Loader2, ExternalLink, Github, Link2, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { Container } from '@/components/ui/container'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface UpdateInfo {
  current: string | null
  latest: string | null
  hasUpdate: boolean
  changelog: string[]
  filesToUpdate: string[]
  requiresMigration: boolean
  breakingChanges: string[]
  isServerless?: boolean
  serverlessWarning?: string
  error?: string
}

interface GitHubStatus {
  connected: boolean
  repo?: {
    owner: string
    repo: string
    branch: string
  }
  tokenValid?: boolean
  error?: string
}

interface ApplyResult {
  success: boolean
  version?: string
  filesUpdated?: number
  commits?: Array<{ path: string; commit: { sha: string; url: string } }>
  redeployTriggered?: boolean
  needsAuth?: boolean
  error?: string
}

export const UpdatePanel: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isCheckingGitHub, setIsCheckingGitHub] = useState(false)
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [isSavingToken, setIsSavingToken] = useState(false)

  // Verificar status GitHub ao carregar componente
  useEffect(() => {
    checkGitHubStatus()
  }, [])

  const checkGitHubStatus = useCallback(async () => {
    setIsCheckingGitHub(true)
    try {
      const response = await fetch('/api/updates/github/status')
      const data: GitHubStatus = await response.json()
      setGitHubStatus(data)
    } catch (error) {
      console.error('Erro ao verificar status GitHub:', error)
    } finally {
      setIsCheckingGitHub(false)
    }
  }, [])

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
        if (result.needsAuth) {
          toast.error('Token GitHub não configurado. Configure GITHUB_TOKEN no Vercel.')
          // Recarregar status GitHub
          checkGitHubStatus()
        } else {
          toast.error(result.error || 'Erro ao aplicar atualização')
        }
        return
      }

      // Mostrar sucesso com detalhes
      const message = `Atualização aplicada! Versão ${result.version}`
      const details = []
      if (result.filesUpdated) {
        details.push(`${result.filesUpdated} arquivo(s) atualizado(s)`)
      }
      if (result.redeployTriggered) {
        details.push('Redeploy Vercel iniciado')
      }
      
      toast.success([message, ...details].join('. '))
      
      // Atualizar status GitHub
      checkGitHubStatus()
      
      // Recarregar página após 3 segundos para aplicar mudanças
      setTimeout(() => {
        window.location.reload()
      }, 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao aplicar atualização'
      toast.error(message)
    } finally {
      setIsApplying(false)
    }
  }, [updateInfo, checkGitHubStatus])

  const saveGitHubToken = useCallback(async () => {
    if (!githubToken.trim()) {
      toast.error('Digite um token GitHub')
      return
    }

    if (!githubToken.trim().startsWith('ghp_')) {
      toast.error("Token deve começar com 'ghp_'")
      return
    }

    setIsSavingToken(true)

    try {
      const response = await fetch('/api/updates/github/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken.trim() }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        toast.error(result.error || 'Erro ao salvar token')
        return
      }

      // Mostrar mensagem de sucesso com informações sobre o redeploy
      if (result.redeployTriggered) {
        toast.success('Token salvo! Redeploy iniciado. Aguarde alguns minutos para o sistema reconhecer o novo token.', {
          duration: 6000,
        })
      } else {
        toast.success(result.message || 'Token salvo com sucesso!', {
          duration: 5000,
        })
      }
      
      setGithubToken('')
      setShowTokenForm(false)
      
      // Aguardar mais tempo se o redeploy foi iniciado, para dar tempo do deploy processar
      const waitTime = result.redeployTriggered ? 10000 : 2000
      setTimeout(() => {
        checkGitHubStatus()
      }, waitTime)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar token'
      toast.error(message)
    } finally {
      setIsSavingToken(false)
    }
  }, [githubToken, checkGitHubStatus])

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

      {/* Status GitHub */}
      {githubStatus && (
        <div className="mt-4 mb-4">
          {githubStatus.connected && githubStatus.tokenValid ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-emerald-400">
                    GitHub Conectado
                  </p>
                  {githubStatus.repo && (
                    <p className="text-xs text-emerald-300/80 mt-0.5">
                      {githubStatus.repo.owner}/{githubStatus.repo.repo} ({githubStatus.repo.branch})
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-400">
                      GitHub Não Configurado
                    </p>
                    <p className="text-xs text-yellow-300/80 mt-1">
                      {githubStatus.error || 'Configure GITHUB_TOKEN nas variáveis de ambiente do Vercel para usar atualizações automáticas.'}
                    </p>
                    {githubStatus.repo && (
                      <p className="text-xs text-yellow-300/60 mt-1">
                        Repositório: {githubStatus.repo.owner}/{githubStatus.repo.repo}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTokenForm(!showTokenForm)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-medium transition-colors"
                    >
                      {showTokenForm ? (
                        <>
                          <ChevronUp size={12} />
                          Ocultar
                        </>
                      ) : (
                        <>
                          <Github size={12} />
                          Configurar Token
                        </>
                      )}
                    </button>
                    <button
                      onClick={checkGitHubStatus}
                      disabled={isCheckingGitHub}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600/50 hover:bg-yellow-500/50 text-white rounded text-xs font-medium transition-colors disabled:opacity-50"
                      title="Verificar novamente"
                    >
                      {isCheckingGitHub ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      Verificar
                    </button>
                  </div>
                </div>
              </div>

              {/* Formulário de Token */}
              {showTokenForm && (
                <div className="bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg p-4 space-y-4">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="text-[var(--ds-text-muted)] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-[var(--ds-text-primary)] mb-2">
                        Usar Token Manual
                      </h4>
                      <p className="text-xs text-[var(--ds-text-secondary)] mb-3">
                        Se preferir, você pode criar um token de acesso pessoal:
                      </p>
                      <ol className="text-xs text-[var(--ds-text-secondary)] space-y-1.5 list-decimal list-inside mb-4">
                        <li>Acesse o link abaixo e faça login no GitHub</li>
                        <li>Clique em &quot;Generate token&quot; no final da página</li>
                        <li>Copie o token gerado (começa com ghp_)</li>
                        <li>Cole o token no campo abaixo</li>
                      </ol>
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Criar token no GitHub
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="github-token-input" className="text-xs font-medium text-[var(--ds-text-primary)]">
                      Token de Acesso Pessoal
                    </label>
                    <Input
                      id="github-token-input"
                      type="text"
                      placeholder="ghp_xxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="font-mono text-sm"
                      disabled={isSavingToken}
                    />
                  </div>

                  <Button
                    onClick={saveGitHubToken}
                    disabled={isSavingToken || !githubToken.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                  >
                    {isSavingToken ? (
                      <>
                        <Loader2 size={16} className="animate-spin mr-2" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} className="mr-2" />
                        Validar e Salvar
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                  disabled={isApplying || !githubStatus?.connected || !githubStatus?.tokenValid}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!githubStatus?.connected || !githubStatus?.tokenValid ? 'Configure GitHub primeiro' : undefined}
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
