'use client'

import React, { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Container } from '@/components/ui/container'
import type { ProspectingConfig } from '@/services/prospectingService'

interface ProspectingSearchFormProps {
  configs?: ProspectingConfig[]
  onSearch: (params: {
    configId?: string
    nicho?: string
    localizacoes?: string[]
    variacoes?: string[]
    paginas_por_localizacao?: number
    hasdata_api_key?: string
    localizacao?: string
    variacao?: string
    pagina?: number
  }) => Promise<void>
  isSearching?: boolean
}

export const ProspectingSearchForm: React.FC<ProspectingSearchFormProps> = ({
  configs = [],
  onSearch,
  isSearching = false,
}) => {
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [useQuickSearch, setUseQuickSearch] = useState(false)
  const [quickNicho, setQuickNicho] = useState('')
  const [quickLocalizacao, setQuickLocalizacao] = useState('')
  const [quickVariacao, setQuickVariacao] = useState('')
  const [quickApiKey, setQuickApiKey] = useState('')
  const [pagina, setPagina] = useState(0)

  const selectedConfig = configs.find(c => c.id === selectedConfigId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (useQuickSearch) {
      if (!quickNicho || !quickLocalizacao || !quickApiKey) {
        alert('Preencha todos os campos obrigatórios')
        return
      }

      await onSearch({
        nicho: quickNicho,
        localizacoes: [quickLocalizacao],
        variacoes: quickVariacao ? [quickVariacao] : [],
        paginas_por_localizacao: 3,
        hasdata_api_key: quickApiKey,
        localizacao: quickLocalizacao,
        variacao: quickVariacao || undefined,
        pagina,
      })
    } else {
      if (!selectedConfigId) {
        alert('Selecione uma configuração')
        return
      }

      await onSearch({
        configId: selectedConfigId,
        localizacao: selectedConfig?.localizacoes[0],
        variacao: selectedConfig?.variacoes[0],
        pagina,
      })
    }
  }

  return (
    <Container variant="glass" padding="lg" className="border-[var(--ds-border-default)]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={!useQuickSearch}
              onChange={() => setUseQuickSearch(false)}
              className="w-4 h-4"
            />
            <span className="text-sm text-[var(--ds-text-primary)]">Usar Configuração Salva</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={useQuickSearch}
              onChange={() => setUseQuickSearch(true)}
              className="w-4 h-4"
            />
            <span className="text-sm text-[var(--ds-text-primary)]">Busca Rápida</span>
          </label>
        </div>

        {!useQuickSearch ? (
          <>
            <div>
              <Label htmlFor="config">Configuração</Label>
              <select
                id="config"
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-lg text-[var(--ds-text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                required
                disabled={isSearching}
              >
                <option value="">Selecione uma configuração</option>
                {configs.map(config => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedConfig && (
              <div className="bg-[var(--ds-bg-hover)] p-3 rounded-lg text-sm">
                <p><strong>Nicho:</strong> {selectedConfig.nicho}</p>
                <p><strong>Localizações:</strong> {selectedConfig.localizacoes.join(', ')}</p>
                {selectedConfig.variacoes.length > 0 && (
                  <p><strong>Variações:</strong> {selectedConfig.variacoes.join(', ')}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="quickNicho">Nicho</Label>
              <Input
                id="quickNicho"
                value={quickNicho}
                onChange={(e) => setQuickNicho(e.target.value)}
                placeholder="Ex: Lanchonete em São Paulo"
                required
                disabled={isSearching}
              />
            </div>

            <div>
              <Label htmlFor="quickLocalizacao">Localização</Label>
              <Input
                id="quickLocalizacao"
                value={quickLocalizacao}
                onChange={(e) => setQuickLocalizacao(e.target.value)}
                placeholder="Ex: Bairro Liberdade São Paulo SP"
                required
                disabled={isSearching}
              />
            </div>

            <div>
              <Label htmlFor="quickVariacao">Variação (opcional)</Label>
              <Input
                id="quickVariacao"
                value={quickVariacao}
                onChange={(e) => setQuickVariacao(e.target.value)}
                placeholder="Ex: hamburgueria"
                disabled={isSearching}
              />
            </div>

            <div>
              <Label htmlFor="quickApiKey">API Key HasData</Label>
              <Input
                id="quickApiKey"
                type="password"
                value={quickApiKey}
                onChange={(e) => setQuickApiKey(e.target.value)}
                placeholder="Cole sua API Key do HasData"
                required
                disabled={isSearching}
              />
            </div>
          </>
        )}

        <div>
          <Label htmlFor="pagina">Página (0 = primeira página)</Label>
          <Input
            id="pagina"
            type="number"
            min="0"
            value={pagina}
            onChange={(e) => setPagina(parseInt(e.target.value) || 0)}
            disabled={isSearching}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isSearching}>
          {isSearching ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Buscando...
            </>
          ) : (
            <>
              <Search size={16} className="mr-2" />
              Buscar
            </>
          )}
        </Button>
      </form>
    </Container>
  )
}
