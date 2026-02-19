/**
 * Version Schema (version.json do template GitHub)
 * 
 * Estrutura do arquivo version.json que fica no repositório template
 */

export interface VersionInfo {
  /** Versão do template (semver) */
  version: string;
  /** Lista de mudanças nesta versão */
  changelog: string[];
  /** Arquivos que devem ser atualizados (caminhos relativos à raiz) */
  filesToUpdate: string[];
  /** Se esta versão requer migração de banco de dados */
  requiresMigration: boolean;
  /** Mudanças breaking (requerem atenção especial) */
  breakingChanges: string[];
}
