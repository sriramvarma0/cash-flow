/**
 * Cloudflare D1 HTTP Client for Node.js
 * 
 * Implements the Cloudflare Workers D1Database interface over Cloudflare's
 * REST API, enabling @prisma/adapter-d1 to operate within a standard Node.js
 * container without Cloudflare Workers edge bindings.
 */

export interface D1HttpConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
  httpUrl?: string;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export interface D1ResponseMeta {
  duration?: number;
  changes?: number;
  last_row_id?: number;
  changed_db?: boolean;
  size_after?: number;
  rows_read?: number;
  rows_written?: number;
  [key: string]: any;
}

export interface D1QueryResult {
  results?: any[];
  success: boolean;
  meta: D1ResponseMeta;
}

export interface D1PreparedStatement {
  query: string;
  params: any[];
  bind(...params: any[]): D1PreparedStatement;
  run(): Promise<D1QueryResult>;
  all<T = any>(): Promise<{ results: T[]; success: boolean; meta: D1ResponseMeta }>;
  first<T = any>(colName?: string): Promise<T | null>;
  raw<T = any[]>(options?: { columnNames?: boolean }): Promise<any[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1QueryResult[]>;
  exec(query: string): Promise<D1ExecResult>;
  dump(): Promise<ArrayBuffer>;
}

function serializeParam(param: any): any {
  if (param === undefined || param === null) return null;
  if (param instanceof Date) return param.toISOString();
  if (typeof param === 'bigint') {
    const num = Number(param);
    return Number.isSafeInteger(num) ? num : param.toString();
  }
  if (typeof param === 'boolean') {
    return param ? 1 : 0;
  }
  return param;
}

const DATETIME_COLUMN_NAMES = new Set([
  'createdat',
  'updatedat',
  'lockoutuntil',
  'date',
  'started_at',
  'finished_at',
  'rolled_back_at'
]);

function isDateTimeColumn(colName: string): boolean {
  if (!colName) return false;
  return DATETIME_COLUMN_NAMES.has(colName.toLowerCase());
}

/**
 * Normalizes values returned from Cloudflare D1.
 * D1 REST API returns columns as dynamically-typed JavaScript values.
 * If a DateTime field is stored as a Unix epoch timestamp in milliseconds (number),
 * @prisma/adapter-d1's inferColumnType() infers ColumnTypeEnum.Double because
 * typeof value === 'number'. This causes Prisma Query Engine to reject the row with:
 * "Inconsistent column data: Could not convert value ... to type DateTime".
 * Normalizing millisecond timestamp numbers to ISO-8601 strings enables
 * @prisma/adapter-d1 to correctly infer ColumnTypeEnum.DateTime.
 */
function normalizeD1Value(val: any, colName: string): any {
  if (val === null || val === undefined) return val;
  if (
    isDateTimeColumn(colName) &&
    typeof val === 'number' &&
    Number.isFinite(val) &&
    val > 100000000000
  ) {
    return new Date(val).toISOString();
  }
  return val;
}

export function createD1HttpClient(config: D1HttpConfig): D1Database {
  const { accountId, databaseId, apiToken, httpUrl } = config;

  if (!httpUrl && (!accountId || !databaseId || !apiToken)) {
    throw new Error(
      'D1 HTTP client requires accountId, databaseId, and apiToken (or a custom httpUrl).'
    );
  }

  const endpoint =
    httpUrl ||
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const commonHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (apiToken) {
    commonHeaders['Authorization'] = `Bearer ${apiToken}`;
  }

  async function executeSql(sql: string, params: any[] = []): Promise<D1QueryResult> {
    // Intercept PRAGMA foreign_keys because Cloudflare D1 permanently enforces foreign keys
    // and throws SQLITE_AUTH / execution error if toggled.
    if (/^\s*PRAGMA\s+foreign_keys\s*=/i.test(sql.trim())) {
      return {
        results: [],
        success: true,
        meta: { changes: 0, last_row_id: 0, duration: 0 }
      };
    }

    const payload = {
      sql,
      params: params.map(serializeParam)
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    const responseData = (await response.json().catch(() => ({}))) as any;

    if (!response.ok || !responseData.success) {
      const rawError =
        responseData.errors?.[0]?.message ||
        responseData.messages?.[0]?.message ||
        `Cloudflare D1 query failed with status ${response.status}`;
      // Ensure D1_ERROR: prefix so @prisma/adapter-d1 matchSQLiteErrorCode parses constraints
      const formatted = rawError.startsWith('D1_ERROR:') ? rawError : `D1_ERROR: ${rawError}`;
      throw new Error(formatted);
    }

    const statementResult = responseData.result?.[0] || {};
    return {
      results: statementResult.results || [],
      success: statementResult.success ?? true,
      meta: statementResult.meta || {
        changes: statementResult.meta?.changes ?? 0,
        last_row_id: statementResult.meta?.last_row_id ?? 0,
        duration: statementResult.meta?.duration ?? 0
      }
    };
  }

  function createStatement(query: string, boundParams: any[] = []): D1PreparedStatement {
    return {
      query,
      params: boundParams,

      bind(...params: any[]) {
        return createStatement(query, params);
      },

      async run() {
        return executeSql(query, boundParams);
      },

      async all<T = any>() {
        const res = await executeSql(query, boundParams);
        const rows = (res.results as any[]) || [];
        const normalized = rows.map((row) => {
          if (!row || typeof row !== 'object') return row;
          const clone: any = { ...row };
          for (const k of Object.keys(clone)) {
            clone[k] = normalizeD1Value(clone[k], k);
          }
          return clone;
        });
        return {
          results: normalized as T[],
          success: res.success,
          meta: res.meta
        };
      },

      async first<T = any>(colName?: string) {
        const res = await executeSql(query, boundParams);
        const firstRow = res.results?.[0];
        if (!firstRow) return null;
        if (colName) return normalizeD1Value(firstRow[colName] ?? null, colName);
        const clone: any = { ...firstRow };
        for (const k of Object.keys(clone)) {
          clone[k] = normalizeD1Value(clone[k], k);
        }
        return clone as T;
      },

      async raw(options?: { columnNames?: boolean }) {
        const res = await executeSql(query, boundParams);
        const rows = res.results || [];
        if (rows.length === 0) {
          // Prisma adapter-d1 destructures [columnNames, ...rows].
          // When 0 rows, returning [ [] ] gives columnNames=[], rows=[].
          return options?.columnNames ? [[]] : [];
        }

        const columnNames = Object.keys(rows[0]);
        const rowArrays = rows.map((r) =>
          columnNames.map((col) => normalizeD1Value(r[col], col))
        );

        if (options?.columnNames) {
          return [columnNames, ...rowArrays];
        }
        return rowArrays;
      }
    };
  }

  return {
    prepare(query: string): D1PreparedStatement {
      return createStatement(query);
    },

    async batch(statements: D1PreparedStatement[]): Promise<D1QueryResult[]> {
      if (!statements || statements.length === 0) return [];

      // Cloudflare D1 REST API native batch format
      const batchPayload = statements.map((s) => ({
        sql: /^\s*PRAGMA\s+foreign_keys\s*=/i.test((s.query || '').trim())
          ? 'SELECT 1;'
          : s.query || '',
        params: (s.params || []).map(serializeParam)
      }));

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify({ batch: batchPayload }),
        signal: AbortSignal.timeout(30000)
      });

      const responseData = (await response.json().catch(() => ({}))) as any;

      if (!response.ok || !responseData.success) {
        const rawError =
          responseData.errors?.[0]?.message ||
          responseData.messages?.[0]?.message ||
          `Cloudflare D1 batch query failed with status ${response.status}`;
        const formatted = rawError.startsWith('D1_ERROR:') ? rawError : `D1_ERROR: ${rawError}`;
        throw new Error(formatted);
      }

      const statementResults = Array.isArray(responseData.result)
        ? responseData.result
        : [responseData.result || {}];

      return statementResults.map((sr: any) => ({
        results: sr.results || [],
        success: sr.success ?? true,
        meta: sr.meta || {
          changes: sr.meta?.changes ?? 0,
          last_row_id: sr.meta?.last_row_id ?? 0,
          duration: sr.meta?.duration ?? 0
        }
      }));
    },

    async exec(query: string): Promise<D1ExecResult> {
      const res = await executeSql(query);
      return {
        count: res.meta.changes ?? 0,
        duration: res.meta.duration ?? 0
      };
    },

    async dump(): Promise<ArrayBuffer> {
      throw new Error('dump() is not supported in HTTP REST mode');
    }
  };
}
