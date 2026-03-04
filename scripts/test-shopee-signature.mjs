/**
 * scripts/test-shopee-signature.mjs
 * Roda com: node scripts/test-shopee-signature.mjs
 * Testa a API Shopee sem precisar subir o servidor NestJS.
 */

import crypto from 'crypto'
import https from 'https'
import { config } from 'dotenv'
config()

const APP_ID   = process.env.SHOPEE_APP_ID
const SECRET   = process.env.SHOPEE_APP_SECRET
const BASE_URL = 'https://open-api.affiliate.shopee.com.br/graphql'
const TEST_URL     = 'https://shopee.com.br/M%C3%A1quina-de-Lavar-Colormaq-12kg-i.781250043.20599662745'
const TEST_ITEM_ID = '20599662745'

if (!APP_ID || !SECRET) {
  console.error('⛔ Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env')
  process.exit(1)
}

function buildRequest(query) {
  const payload    = JSON.stringify({ query })
  const timestamp  = Math.floor(Date.now() / 1000)
  const baseString = `${APP_ID}${timestamp}${payload}${SECRET}`
  const signature  = crypto.createHash('sha256').update(baseString).digest('hex')
  const authorization = `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
  console.log(`\n🔐 Timestamp : ${timestamp}`)
  console.log(`🔐 Signature : ${signature.substring(0, 20)}...`)
  return { payload, authorization }
}

function post(payload, authorization) {
  return new Promise((resolve, reject) => {
    const u   = new URL(BASE_URL)
    const buf = Buffer.from(payload, 'utf-8')
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length, Authorization: authorization },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function printResult(label, res) {
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📌 ${label}`)
  console.log(`📥 HTTP Status: ${res.status}`)
  if (res.status === 401) console.log('❌ 401 — Credenciais inválidas ou timestamp desviado')
  if (res.status === 403) console.log('❌ 403 — App sem permissão para este endpoint')
  if (res.body?.errors)   console.log('❌ GraphQL Errors:', JSON.stringify(res.body.errors, null, 2))
  console.log('📦 Body:', JSON.stringify(res.body, null, 2))
}

console.log('🚀 Testando Shopee Affiliate API')
console.log(`📌 AppId: ${APP_ID}`)

const r1 = buildRequest(`query { productOfferV2(itemId: ${TEST_ITEM_ID}, limit: 1) { nodes { itemId productName imageUrl priceMin priceMax offerLink shopId shopName ratingStar sales commissionRate } } }`)
printResult(`TESTE 1 — getProductByItemId (${TEST_ITEM_ID})`, await post(r1.payload, r1.authorization))

const r2 = buildRequest(`mutation { generateShortLink(input: { originUrl: "${TEST_URL}" }) { shortLink } }`)
printResult('TESTE 2 — generateShortLink', await post(r2.payload, r2.authorization))

const r3 = buildRequest(`query { productOfferV2(keyword: "maquina lavar", limit: 3) { nodes { itemId productName priceMin offerLink } pageInfo { hasNextPage } } }`)
printResult('TESTE 3 — searchProducts (keyword)', await post(r3.payload, r3.authorization))

console.log('\n✅ Testes concluídos')
