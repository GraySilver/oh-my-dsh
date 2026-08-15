import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Product metadata carried by the published application manifest. */
export interface ProductManifest {
  name: string
  version: string
  ohMyDsh: {
    upstreamCommit: string
    upstreamPackage: string
  }
}

/** Absolute path to this application's package manifest in source and built layouts. */
export const PRODUCT_MANIFEST_PATH = fileURLToPath(new URL('../package.json', import.meta.url))

/** Absolute path to the product-owned Web composition layer. */
export const PRODUCT_PATCH_PATH = fileURLToPath(new URL('../config/oh-my-dsh.patch.yml', import.meta.url))

/** Explicit opt-in composition layer for listening on every IPv4 interface. */
export const PRODUCT_LAN_PATCH_PATH = fileURLToPath(new URL('../config/oh-my-dsh.lan.patch.yml', import.meta.url))

/** Read checked-in release metadata without importing JSON at runtime. */
export function readProductManifest(): ProductManifest {
  return JSON.parse(readFileSync(PRODUCT_MANIFEST_PATH, 'utf8')) as ProductManifest
}
