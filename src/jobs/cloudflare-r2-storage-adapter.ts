/**
 * Cloudflare R2 storage adapter - replaces AWS S3
 * Uses Workers R2 binding for object storage
 */

// Type declarations for Cloudflare R2
declare global {
  interface R2Bucket {
    get(key: string, options?: { onlyIf?: Record<string, string>; range?: { offset?: number; length?: number } }): Promise<R2ObjectBody | R2ObjectNoBody | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | string | Blob, options?: { httpMetadata?: Record<string, string>; customMetadata?: Record<string, string>; md5?: ArrayBuffer }): Promise<R2Object>;
    delete(key: string | string[]): Promise<void>;
    head(key: string): Promise<R2Object | null>;
    list(options?: { prefix?: string; delimiter?: string; cursor?: string; limit?: number }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string }>;
  }

  interface R2ObjectBody extends R2Object {
    body: ReadableStream;
    bodyUsed: false;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
    json<T>(): Promise<T>;
    blob(): Promise<Blob>;
  }

  interface R2ObjectNoBody extends R2Object {
    body: null;
    bodyUsed: false;
  }

  interface R2Object {
    key: string;
    version: string;
    size: number;
    uploaded: Date;
    httpEtag: string;
    checksums: { md5?: string; sha1?: string; sha256?: string; sha512?: string };
    httpMetadata?: Record<string, string>;
    customMetadata?: Record<string, string>;
    range?: { offset: number; length: number };
  }
}

export interface R2UploadResult {
  key: string;
  size: number;
  uploaded: Date;
  etag: string;
}

export interface R2DownloadResult {
  body: ReadableStream | null;
  size: number;
  contentType?: string;
}

export interface R2ListOptions {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}

export interface R2ListResult {
  objects: string[];
  truncated: boolean;
  cursor?: string;
}

/** R2 Storage Client */
export class R2Storage {
  private bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  /**
   * Upload a file to R2
   */
  async upload(key: string, body: ReadableStream | ArrayBuffer | string, options?: { contentType?: string; customMetadata?: Record<string, string> }): Promise<R2UploadResult> {
    const uploadBody = typeof body === 'string' ? body : body;

    const httpMetadata: Record<string, string> = {};
    if (options?.contentType) {
      httpMetadata['contentType'] = options.contentType;
    }

    const object = await this.bucket.put(key, uploadBody, {
      httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      customMetadata: options?.customMetadata,
    });

    return {
      key: object.key,
      size: object.size,
      uploaded: object.uploaded,
      etag: object.httpEtag,
    };
  }

  /**
   * Download a file from R2
   */
  async download(key: string): Promise<R2DownloadResult | null> {
    const object = await this.bucket.get(key);
    if (!object || !('body' in object) || !object.body) {
      return null;
    }

    return {
      body: object.body,
      size: object.size,
      contentType: object.httpMetadata?.contentType,
    };
  }

  /**
   * Delete a file from R2
   */
  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  /**
   * Delete multiple files from R2
   */
  async deleteMany(keys: string[]): Promise<void> {
    await this.bucket.delete(keys);
  }

  /**
   * List objects in bucket
   */
  async list(options?: R2ListOptions): Promise<R2ListResult> {
    const listed = await this.bucket.list({
      prefix: options?.prefix,
      delimiter: options?.delimiter,
      cursor: options?.cursor,
      limit: options?.limit ?? 1000,
    });

    return {
      objects: listed.objects.map((o: { key: string }) => o.key),
      truncated: listed.truncated,
      cursor: listed.cursor,
    };
  }

  /**
   * Get object metadata
   */
  async head(key: string): Promise<{ key: string; size: number; uploaded: Date; etag: string } | null> {
    const object = await this.bucket.head(key);
    if (!object) {
      return null;
    }

    return {
      key: object.key,
      size: object.size,
      uploaded: object.uploaded,
      etag: object.httpEtag,
    };
  }

  /**
   * Generate signed URL (requires additional logic for Cloudflare)
   * For R2, you typically use Cloudflare Access or a proxy
   */
  async getSignedUrl(key: string, expiresInMs: number): Promise<string> {
    // R2 doesn't have built-in signed URLs like S3
    // You need to use Cloudflare Access or serve through a Worker
    // This is a placeholder for custom implementation
    const bucketName = 'algo-trader-artifacts';
    return `https://r2/${bucketName}/${key}?expires=${Date.now() + expiresInMs}`;
  }
}

/**
 * Backtest result storage utility
 */
export class BacktestStorage {
  private r2: R2Storage;

  constructor(r2: R2Storage) {
    this.r2 = r2;
  }

  async saveResult(tenantId: string, backtestId: string, result: unknown): Promise<string> {
    const key = `backtests/${tenantId}/${backtestId}/result.json`;
    await this.r2.upload(key, JSON.stringify(result, null, 2), { contentType: 'application/json' });
    return key;
  }

  async getResult(tenantId: string, backtestId: string): Promise<unknown | null> {
    const key = `backtests/${tenantId}/${backtestId}/result.json`;
    const object = await this.r2['bucket'].get(key);
    if (!object || !('body' in object) || !object.body) {
      return null;
    }
    const text = 'text' in object && typeof object.text === 'function' ? await object.text() : await new Response(object.body).text();
    return JSON.parse(text);
  }

  async listResults(tenantId: string): Promise<string[]> {
    const listed = await this.r2.list({ prefix: `backtests/${tenantId}/` });
    return listed.objects.filter(k => k.endsWith('/result.json'));
  }
}

/**
 * Audit log storage utility
 */
export class AuditLogStorage {
  private r2: R2Storage;

  constructor(r2: R2Storage) {
    this.r2 = r2;
  }

  async saveAuditLog(date: string, logs: unknown[]): Promise<string> {
    const key = `audit-logs/${date}/audit-${Date.now()}.json`;
    await this.r2.upload(key, JSON.stringify(logs, null, 2), { contentType: 'application/json' });
    return key;
  }

  async getAuditLog(date: string, filename: string): Promise<unknown[] | null> {
    const key = `audit-logs/${date}/${filename}`;
    const object = await this.r2['bucket'].get(key);
    if (!object || !('body' in object) || !object.body) {
      return null;
    }
    const text = 'text' in object && typeof object.text === 'function' ? await object.text() : await new Response(object.body).text();
    return JSON.parse(text);
  }
}
