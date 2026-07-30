import { describe, expect, it } from 'vitest'
import { classifyProduct } from '@/core/classification/classifier'

describe('classificação canônica para produtos do Mercado Livre', () => {
  it('classifica mamadeira pelo título comercial', () => {
    expect(classifyProduct({ title: 'Kit 2 Mamadeiras Buba Easy Flow Anticólica 270 Ml' })).toMatchObject({
      productType: 'baby_bottle',
      status: 'classified',
    })
  })

  it('classifica bolsa maternidade sem confundir com acessório', () => {
    expect(classifyProduct({ title: 'Kit Bolsa Maternidade com Mochila Bambinelli' })).toMatchObject({
      productType: 'maternity_bag',
      status: 'classified',
    })
  })

  it('classifica sling de bebê como carregador infantil', () => {
    expect(classifyProduct({ title: 'Canguru Sling de Bebê para Recém Nascido' })).toMatchObject({
      productType: 'baby_sling',
      status: 'classified',
    })
  })
})
