/**
 * VozSmart Configuration Schema
 * 
 * Arquivo de configuração que rastreia a versão do core e arquivos protegidos
 */

export interface VozSmartConfig {
  /** Versão atual do core instalada */
  coreVersion: string;
  /** Data da última atualização (ISO timestamp) ou null */
  lastUpdate: string | null;
  /** Repositório template no GitHub (formato: owner/repo) */
  templateRepo: string;
  /** Branch do template a usar para atualizações */
  templateBranch: string;
  /** Lista de padrões de arquivos protegidos (nunca atualizados) */
  protectedFiles: string[];
}
