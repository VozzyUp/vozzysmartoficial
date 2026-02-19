-- =============================================================================
-- PROSPECTING CONFIGURATIONS
-- Tabela para armazenar configurações de prospecção automática
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.prospecting_configs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    nicho text NOT NULL,
    localizacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
    variacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
    paginas_por_localizacao integer NOT NULL DEFAULT 3,
    hasdata_api_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prospecting_configs_created_at ON public.prospecting_configs(created_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_prospecting_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prospecting_configs_updated_at
    BEFORE UPDATE ON public.prospecting_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_prospecting_configs_updated_at();

-- Comentários
COMMENT ON TABLE public.prospecting_configs IS 'Configurações de prospecção automática via Google Maps';
COMMENT ON COLUMN public.prospecting_configs.id IS 'ID único da configuração';
COMMENT ON COLUMN public.prospecting_configs.name IS 'Nome da configuração';
COMMENT ON COLUMN public.prospecting_configs.nicho IS 'Nicho de negócio (ex: Lanchonete em São Paulo)';
COMMENT ON COLUMN public.prospecting_configs.localizacoes IS 'Array de localizações para buscar (JSON)';
COMMENT ON COLUMN public.prospecting_configs.variacoes IS 'Array de variações de busca (JSON)';
COMMENT ON COLUMN public.prospecting_configs.paginas_por_localizacao IS 'Número de páginas do Google Maps por localização';
COMMENT ON COLUMN public.prospecting_configs.hasdata_api_key IS 'API Key do HasData para buscar dados do Google Maps';
COMMENT ON COLUMN public.prospecting_configs.created_at IS 'Data de criação';
COMMENT ON COLUMN public.prospecting_configs.updated_at IS 'Data de última atualização';

-- RLS (Row Level Security)
ALTER TABLE public.prospecting_configs ENABLE ROW LEVEL SECURITY;

-- Política: Service Role pode fazer tudo
CREATE POLICY "Service role full access"
    ON public.prospecting_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Política: Autenticados podem ler e escrever
CREATE POLICY "Authenticated can read"
    ON public.prospecting_configs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated can insert"
    ON public.prospecting_configs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated can update"
    ON public.prospecting_configs
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated can delete"
    ON public.prospecting_configs
    FOR DELETE
    TO authenticated
    USING (true);
