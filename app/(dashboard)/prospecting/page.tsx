'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Settings, Search, FileText, Eye, EyeOff, Key } from 'lucide-react'
import { Page, PageHeader, PageTitle, PageDescription, PageActions } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { ProspectingConfigForm } from '@/components/features/prospecting/ProspectingConfigForm'
import { ProspectingSearchForm } from '@/components/features/prospecting/ProspectingSearchForm'
import { ProspectingResults } from '@/components/features/prospecting/ProspectingResults'
import {
  useProspectingConfigs,
  useCreateProspectingConfig,
  useUpdateProspectingConfig,
  useDeleteProspectingConfig,
  useProspectingSearch,
  useSaveProspectingContacts,
} from '@/hooks/useProspecting'
import type { ProspectingConfig, ProspectingResult } from '@/services/prospectingService'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type Tab = 'configs' | 'search' | 'results'

export default function ProspectingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('configs')
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [hasdataApiKey, setHasdataApiKey] = useState('')
  const [showHasdataKey, setShowHasdataKey] = useState(false)
  const [isSavingHasdataKey, setIsSavingHasdataKey] = useState(false)
  const [hasdataKeyConfigured, setHasdataKeyConfigured] = useState(false)

  useEffect(() => {
    fetch('/api/prospecting/hasdata-key')
      .then(res => res.ok ? res.json() : null)
      .then(data => data && setHasdataKeyConfigured(!!data.configured))
      .catch(() => {})
  }, [])

  const handleSaveHasdataKey = async () => {
    if (!hasdataApiKey.trim()) {
      toast.error('Digite a chave API do HasData')
      return
    }
    setIsSavingHasdataKey(true)
    try {
      const res = await fetch('/api/prospecting/hasdata-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: hasdataApiKey.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar chave')
        return
      }
      setHasdataKeyConfigured(true)
      
      // Mostrar mensagem de sucesso com informações sobre o redeploy
      if (data.redeployTriggered) {
        toast.success('Chave salva! Redeploy iniciado. Aguarde alguns minutos para o sistema reconhecer a nova chave.', {
          duration: 6000,
        })
      } else {
        toast.success(data.message || 'Chave salva com sucesso!', {
          duration: 5000,
        })
      }
      
      setHasdataApiKey('')
    } catch {
      toast.error('Erro ao salvar chave')
    } finally {
      setIsSavingHasdataKey(false)
    }
  }
  const [editingConfig, setEditingConfig] = useState<ProspectingConfig | null>(null)
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<{
    results: ProspectingResult[]
    total: number
    novos: number
    duplicados: number
  } | null>(null)

  const { data: configs, isLoading: isLoadingConfigs } = useProspectingConfigs()
  const createConfig = useCreateProspectingConfig()
  const updateConfig = useUpdateProspectingConfig()
  const deleteConfig = useDeleteProspectingConfig()
  const searchMutation = useProspectingSearch()
  const saveMutation = useSaveProspectingContacts()

  const handleCreateConfig = async (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>) => {
    await createConfig.mutateAsync(config)
    setShowConfigForm(false)
  }

  const handleUpdateConfig = async (config: Omit<ProspectingConfig, 'id' | 'created_at' | 'updated_at'>) => {
    if (!editingConfig) return
    await updateConfig.mutateAsync({ id: editingConfig.id, config })
    setEditingConfig(null)
    setShowConfigForm(false)
  }

  const handleDeleteConfig = async () => {
    if (!deleteConfigId) return
    await deleteConfig.mutateAsync(deleteConfigId)
    setDeleteConfigId(null)
  }

  const handleSearch = async (params: {
    configId?: string
    nicho?: string
    localizacoes?: string[]
    variacoes?: string[]
    paginas_por_localizacao?: number
    hasdata_api_key?: string
    localizacao?: string
    variacao?: string
    pagina?: number
  }) => {
    try {
      console.log('[Prospecting Page] Iniciando busca com params:', params)
      const result = await searchMutation.mutateAsync(params)
      console.log('[Prospecting Page] Resultado recebido:', result)
      
      if (!result || result.total === 0) {
        toast.warning('Nenhum resultado encontrado. Verifique os parâmetros de busca.')
      } else {
        toast.success(`Encontrados ${result.total} resultado(s)`)
      }
      
      setSearchResults(result)
      setActiveTab('results')
    } catch (error) {
      console.error('[Prospecting Page] Erro na busca:', error)
      // O erro já é tratado no hook, mas vamos garantir que o usuário veja
    }
  }

  const handleSaveContacts = async (contacts: ProspectingResult[]) => {
    await saveMutation.mutateAsync(contacts)
    // Limpar resultados após salvar
    setSearchResults(null)
    setActiveTab('configs')
  }

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>Prospecção Automática</PageTitle>
          <PageDescription>
            Busque empresas no Google Maps e adicione automaticamente aos seus contatos
          </PageDescription>
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('configs')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'configs'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]'
              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
          }`}
        >
          <Settings className="w-4 h-4" />
          Modelo de busca
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'search'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]'
              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
          }`}
        >
          <Search className="w-4 h-4" />
          Buscar
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'results'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--ds-status-success-text)]'
              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)]'
          }`}
          disabled={!searchResults}
        >
          <FileText className="w-4 h-4" />
          Resultados
          {searchResults && (
            <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
              {searchResults.total}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'configs' && (
        <div className="space-y-4">
          {/* Chave HasData - campo isolado no topo */}
          <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 min-w-0">
                <Label htmlFor="hasdata-key" className="flex items-center gap-2 text-[var(--ds-text-primary)]">
                  <Key size={16} />
                  Chave API HasData
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="hasdata-key"
                    type={showHasdataKey ? 'text' : 'password'}
                    value={hasdataApiKey}
                    onChange={e => setHasdataApiKey(e.target.value)}
                    placeholder={hasdataKeyConfigured ? 'Chave configurada (deixe em branco para manter)' : 'Cole sua API Key do HasData'}
                    disabled={isSavingHasdataKey}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowHasdataKey(!showHasdataKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] p-1"
                    tabIndex={-1}
                  >
                    {showHasdataKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <Button
                onClick={handleSaveHasdataKey}
                disabled={isSavingHasdataKey || !hasdataApiKey.trim()}
              >
                {isSavingHasdataKey ? (
                  <Loader2 size={16} className="animate-spin mr-2" />
                ) : null}
                Salvar chave
              </Button>
            </div>
            {hasdataKeyConfigured && (
              <p className="text-xs text-[var(--ds-text-muted)] mt-2">Chave configurada. O sistema usa cache local até o Vercel ser atualizado.</p>
            )}
          </Container>

          {showConfigForm ? (
            <ProspectingConfigForm
              config={editingConfig}
              onSave={editingConfig ? handleUpdateConfig : handleCreateConfig}
              onCancel={() => {
                setShowConfigForm(false)
                setEditingConfig(null)
              }}
              isSaving={createConfig.isPending || updateConfig.isPending}
            />
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <Button onClick={() => setShowConfigForm(true)}>
                  <Plus size={16} className="mr-2" />
                  Novo Modelo
                </Button>
              </div>

              {isLoadingConfigs ? (
                <Container variant="glass" padding="lg">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-[var(--ds-text-muted)]" />
                  </div>
                </Container>
              ) : configs && configs.length > 0 ? (
                <div className="space-y-3">
                  {configs.map(config => (
                    <Container
                      key={config.id}
                      variant="glass"
                      padding="lg"
                      className="border-[var(--ds-border-default)]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-[var(--ds-text-primary)] mb-2">{config.name}</h3>
                          <div className="space-y-1 text-sm text-[var(--ds-text-secondary)]">
                            <p><strong>Nicho:</strong> {config.nicho}</p>
                            <p><strong>Localizações:</strong> {config.localizacoes.join(', ')}</p>
                            {config.variacoes.length > 0 && (
                              <p><strong>Variações:</strong> {config.variacoes.join(', ')}</p>
                            )}
                            <p><strong>Páginas por localização:</strong> {config.paginas_por_localizacao}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingConfig(config)
                              setShowConfigForm(true)
                            }}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfigId(config.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </Container>
                  ))}
                </div>
              ) : (
                <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
                  <p className="text-center text-[var(--ds-text-muted)]">
                    Nenhum modelo de busca salvo. Crie um novo modelo para começar.
                  </p>
                </Container>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <ProspectingSearchForm
          configs={configs || []}
          onSearch={handleSearch}
          isSearching={searchMutation.isPending}
        />
      )}

      {activeTab === 'results' && searchResults && (
        <ProspectingResults
          results={searchResults.results}
          total={searchResults.total}
          novos={searchResults.novos}
          duplicados={searchResults.duplicados}
          onSave={handleSaveContacts}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfigId} onOpenChange={(open) => !open && setDeleteConfigId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este modelo de busca? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfig}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}
