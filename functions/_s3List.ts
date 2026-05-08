import { XMLParser } from 'fast-xml-parser'
import { presignS3List, presignS3Url } from './_s3Presign'

export interface ListedObject {
  key: string
  lastModified: Date
  size: number
}

export interface ListResult {
  objects: ListedObject[]
  isTruncated: boolean
  nextContinuationToken?: string
}

interface BucketCreds {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
}

const xmlParser = new XMLParser({ ignoreAttributes: true, parseTagValue: true })

/**
 * Single LIST page. Returns up to ~1000 objects under `prefix` plus a
 * continuation token if the bucket has more. Relies on `_s3Presign.presignS3List`
 * to do SigV4; here we just fetch + parse the XML response.
 */
export async function listObjectsPage(
  creds: BucketCreds,
  prefix: string,
  continuationToken?: string,
  maxKeys = 1000,
): Promise<ListResult> {
  const url = presignS3List({
    bucket: creds.bucket,
    region: creds.region,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    endpoint: creds.endpoint,
    expiresIn: 300,
    prefix,
    continuationToken,
    maxKeys,
  })

  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`s3_list_failed status=${res.status} body=${body.slice(0, 300)}`)
  }
  const xml = await res.text()
  const parsed = xmlParser.parse(xml) as {
    ListBucketResult?: {
      IsTruncated?: boolean
      NextContinuationToken?: string
      Contents?:
        | { Key: string; LastModified: string; Size: number }
        | { Key: string; LastModified: string; Size: number }[]
    }
  }
  const root = parsed.ListBucketResult || {}
  const raw = root.Contents
    ? Array.isArray(root.Contents)
      ? root.Contents
      : [root.Contents]
    : []
  return {
    objects: raw.map((c) => ({
      key: String(c.Key),
      lastModified: new Date(c.LastModified),
      size: Number(c.Size) || 0,
    })),
    isTruncated: !!root.IsTruncated,
    nextContinuationToken: root.NextContinuationToken,
  }
}

/**
 * List every object under a prefix, paginated. `hardCap` stops the loop after
 * N objects so a runaway sweep can't enumerate millions of keys per invocation.
 */
export async function listAllObjects(
  creds: BucketCreds,
  prefix: string,
  hardCap = 5000,
): Promise<ListedObject[]> {
  const all: ListedObject[] = []
  let token: string | undefined
  do {
    const page = await listObjectsPage(creds, prefix, token)
    all.push(...page.objects)
    token = page.nextContinuationToken
    if (all.length >= hardCap) break
  } while (token)
  return all.slice(0, hardCap)
}

/**
 * Best-effort DELETE for a single object. 404s are treated as success so
 * retention runs are idempotent.
 */
export async function deleteObject(
  creds: BucketCreds,
  key: string,
): Promise<{ ok: boolean; status: number; key: string }> {
  const url = presignS3Url({
    method: 'DELETE',
    bucket: creds.bucket,
    key,
    region: creds.region,
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    endpoint: creds.endpoint,
    expiresIn: 300,
  })
  try {
    const res = await fetch(url, { method: 'DELETE' })
    return { ok: res.ok || res.status === 404, status: res.status, key }
  } catch {
    return { ok: false, status: 0, key }
  }
}

/**
 * Convenience: list everything under `prefix`, then delete each object.
 * Used by both `deleteAsset` (prefix folder delete) and `retentionSweep`
 * (post-filter delete of stale objects).
 */
export async function listAndDelete(
  creds: BucketCreds,
  prefix: string,
  filter?: (obj: ListedObject) => boolean,
  hardCap = 5000,
): Promise<{ deleted: { ok: boolean; status: number; key: string }[]; scanned: number }> {
  const objs = await listAllObjects(creds, prefix, hardCap)
  const target = filter ? objs.filter(filter) : objs
  const deleted: { ok: boolean; status: number; key: string }[] = []
  for (const o of target) {
    deleted.push(await deleteObject(creds, o.key))
  }
  return { deleted, scanned: objs.length }
}
