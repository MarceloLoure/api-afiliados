import { ShopeeService } from './shopee.service'

describe('ShopeeService', () => {
  let service: ShopeeService

  beforeEach(() => {
    service = new ShopeeService()
  })

  it('extracts ids from legacy shopee URL format', () => {
    expect(
      service.extractIds('https://shopee.com.br/Produto-A-i.123456.987654321'),
    ).toEqual({
      shopId: '123456',
      itemId: '987654321',
    })
  })

  it('extracts ids from product path shopee URL format', () => {
    expect(
      service.extractIds('https://shopee.com.br/product/1326331760/49302049147'),
    ).toEqual({
      shopId: '1326331760',
      itemId: '49302049147',
    })
  })

  it('returns null for invalid URLs', () => {
    expect(service.extractIds('https://example.com/product/1/2')).toBeNull()
  })
})
