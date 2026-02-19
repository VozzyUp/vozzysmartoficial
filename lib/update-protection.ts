/**
 * Update Protection Utilities
 * 
 * Validação de arquivos protegidos para prevenir sobrescrita acidental
 * de credenciais, configurações e dados do cliente.
 */

import path from 'path';

/**
 * Lista hardcoded de padrões protegidos (segunda camada de segurança)
 * Mesmo que protectedFiles esteja no config, esta lista sempre prevalece.
 */
const HARDCODED_PROTECTED_PATTERNS = [
  /^\.env/,
  /^vozsmart\.config\.json$/,
  /^next\.config\./,
  /^package(-lock)?\.json$/,
  /^supabase\/migrations\//,
  /^\.vercel\//,
  /^\.git\//,
  /^\.vozsmart-backups\//,
  /^tmp\//,
  /\.log$/,
  /^node_modules\//,
  /^\.next\//,
  /^out\//,
];

/**
 * Normaliza um caminho de arquivo para prevenir path traversal.
 * 
 * @param filePath Caminho a normalizar
 * @returns Caminho normalizado ou null se inválido
 */
export function normalizePath(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  // Remove espaços e normaliza separadores
  const normalized = path.normalize(filePath.trim()).replace(/\\/g, '/');

  // Rejeita caminhos absolutos fora do workspace
  if (path.isAbsolute(normalized)) {
    return null;
  }

  // Rejeita path traversal (../, ..\, etc)
  if (normalized.includes('..')) {
    return null;
  }

  // Rejeita caminhos que começam com / (absolutos relativos)
  if (normalized.startsWith('/')) {
    return null;
  }

  return normalized;
}

/**
 * Converte um padrão de arquivo protegido (ex: "*.env", "supabase/migrations/*")
 * em uma função de teste.
 */
function patternToTest(pattern: string): (filePath: string) => boolean {
  // Escapa caracteres especiais de regex exceto * e ?
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${escaped}$`);
  return (filePath: string) => regex.test(filePath);
}

/**
 * Verifica se um arquivo está protegido contra atualização.
 * 
 * @param filePath Caminho do arquivo (relativo à raiz)
 * @param protectedPatterns Lista de padrões protegidos do config
 * @returns true se o arquivo está protegido
 */
export function isProtectedFile(
  filePath: string,
  protectedPatterns: string[] = []
): boolean {
  const normalized = normalizePath(filePath);
  if (!normalized) {
    // Caminho inválido = protegido por padrão
    return true;
  }

  // Verifica lista hardcoded primeiro (sempre prevalece)
  for (const pattern of HARDCODED_PROTECTED_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  // Verifica padrões do config
  for (const pattern of protectedPatterns) {
    const testFn = patternToTest(pattern);
    if (testFn(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Valida uma lista de arquivos contra padrões protegidos.
 * 
 * @param files Lista de arquivos a validar
 * @param protectedPatterns Lista de padrões protegidos do config
 * @returns Objeto com resultado da validação
 */
export function validateFilesToUpdate(
  files: string[],
  protectedPatterns: string[] = []
): { valid: boolean; blocked: string[] } {
  const blocked: string[] = [];

  for (const file of files) {
    if (isProtectedFile(file, protectedPatterns)) {
      blocked.push(file);
    }
  }

  return {
    valid: blocked.length === 0,
    blocked,
  };
}
