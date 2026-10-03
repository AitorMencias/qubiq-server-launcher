import { join } from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { X509Certificate } from 'node:crypto'
import { runPowerShell, psQuote } from '../system/powershell'
import { ensureDir } from '../paths'
import { randomId } from './crypto'

/**
 * Certificado del acceso remoto.
 *
 * HTTPS no es opcional: en el navegador, `crypto.subtle` (con lo que la página
 * firma las órdenes) solo existe en un contexto seguro. Node no sabe crear
 * certificados y no queremos dependencias, así que lo genera Windows con
 * `New-SelfSignedCertificate`, se exporta a un PFX y se borra del almacén del
 * usuario para no dejar nada fuera de la carpeta de datos.
 *
 * Tres exigencias de iOS que, si no, rechaza la conexión aunque se acepte el
 * aviso: validez de 825 días o menos, nombre alternativo (SAN) y uso extendido
 * «autenticación de servidor».
 */

export const CERT_VALID_DAYS = 800
/** Con menos de esto por delante, se hace uno nuevo al arrancar. */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000

export interface CertMaterial {
  pfx: Buffer
  passphrase: string
  /** SHA-256 en pares hexadecimales separados por «:». */
  fingerprint: string
  expires: string
}

function pfxPath(dir: string): string {
  return join(dir, 'cert.pfx')
}

function cerPath(dir: string): string {
  return join(dir, 'cert.cer')
}

/**
 * El certificado de `dir`, o uno nuevo si no hay, no se puede leer o está a
 * punto de caducar. `passphrase` es la guardada; si se genera otro, se
 * devuelve la nueva en el resultado para que quien llama la guarde.
 */
export async function ensureCertificate(
  dir: string,
  passphrase: string | null,
  now = Date.now()
): Promise<CertMaterial> {
  if (passphrase) {
    const existing = await loadCertificate(dir, passphrase).catch(() => null)
    if (existing && Date.parse(existing.expires) - now > RENEW_BEFORE_MS) return existing
  }
  return generateCertificate(dir)
}

async function loadCertificate(dir: string, passphrase: string): Promise<CertMaterial> {
  const [pfx, cer] = await Promise.all([readFile(pfxPath(dir)), readFile(cerPath(dir))])
  const x509 = new X509Certificate(cer)
  return {
    pfx,
    passphrase,
    fingerprint: x509.fingerprint256,
    expires: new Date(x509.validTo).toISOString()
  }
}

export async function generateCertificate(dir: string): Promise<CertMaterial> {
  await ensureDir(dir)
  const passphrase = randomId(24)
  const pfx = pfxPath(dir)
  const cer = cerPath(dir)
  await rm(pfx, { force: true })
  await rm(cer, { force: true })

  // `-CryptoAlgorithmOption AES256_SHA256`: el PFX por defecto de Windows va
  // cifrado con TripleDES/SHA1, que el OpenSSL 3 de Node puede negarse a abrir.
  // Si la versión de Windows no conoce la opción, se exporta sin ella.
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$cert = New-SelfSignedCertificate -Subject 'CN=QubiQ Remote' -FriendlyName 'QubiQ remote access' \`
  -DnsName 'qubiq.local', 'localhost' -CertStoreLocation 'Cert:\\CurrentUser\\My' \`
  -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable \`
  -KeyUsage DigitalSignature, KeyEncipherment -NotAfter (Get-Date).AddDays(${CERT_VALID_DAYS}) \`
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1')
try {
  $pw = ConvertTo-SecureString -String ${psQuote(passphrase)} -Force -AsPlainText
  try {
    Export-PfxCertificate -Cert $cert -FilePath ${psQuote(pfx)} -Password $pw -CryptoAlgorithmOption AES256_SHA256 | Out-Null
  } catch [System.Management.Automation.ParameterBindingException] {
    Export-PfxCertificate -Cert $cert -FilePath ${psQuote(pfx)} -Password $pw | Out-Null
  }
  [System.IO.File]::WriteAllBytes(${psQuote(cer)}, $cert.RawData)
} finally {
  Remove-Item -Path ('Cert:\\CurrentUser\\My\\' + $cert.Thumbprint) -DeleteKey
}
`
  const result = await runPowerShell(script, 60_000)
  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || `PowerShell salió con ${result.exitCode}`)
  }
  return loadCertificate(dir, passphrase)
}
