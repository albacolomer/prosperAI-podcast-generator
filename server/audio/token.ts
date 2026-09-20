import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Proof that the server validated a script. POST /api/generate-script signs the script it returns when (and only
 * when) validation passed; POST /api/generate-audio refuses any script whose signature does not match. The browser
 * cannot claim "validated": it can only hand back what the server signed, and any edit to the text breaks the
 * signature. The signature is stateless, so it works across serverless instances. The key is a server secret
 * (the OpenAI key, already required for script generation), used only as HMAC key material and never sent out.
 */
function signature({ script, language }: { script: string; language: string }, secret: string): Buffer {
  return createHmac("sha256", `prosperpod:validated-script:${secret}`).update(`${language}\n${script}`).digest()
}

export function signValidatedScript(script: { script: string; language: string }, secret: string): string {
  return signature(script, secret).toString("base64url")
}

export function isValidatedScript(script: { script: string; language: string }, token: string, secret: string): boolean {
  const expected = signature(script, secret)
  const given = Buffer.from(token, "base64url")
  return given.length === expected.length && timingSafeEqual(given, expected)
}
