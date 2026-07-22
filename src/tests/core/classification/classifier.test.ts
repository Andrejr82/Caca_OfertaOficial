import { describe, expect, it } from 'vitest'
import { classifyProduct } from '@/core/classification/classifier'

describe('deterministic product classifier', () => {
  it('classifies a known air fryer as a main product', () => {
    expect(classifyProduct({ title: 'Air Fryer Philco PAF95A 9,5L 220V 1800W' })).toMatchObject({
      productType: 'air_fryer', productRole: 'main_product', status: 'classified',
      attributes: { brand: 'philco', model: 'PAF95A', capacityLiters: 9.5, voltage: '220V' },
    })
  })

  it('excludes accessories and bundles from primary product selection', () => {
    expect(classifyProduct({ title: 'Cesto de silicone para Air Fryer 5L' })).toMatchObject({ productType: 'air_fryer', productRole: 'accessory', status: 'excluded' })
    expect(classifyProduct({ title: 'Kit Air Fryer + acessórios' })).toMatchObject({ productRole: 'bundle', status: 'excluded' })
  })

  it('requires review for conflicting capacity claims', () => {
    expect(classifyProduct({ title: 'Air Fryer Forno 10L 17L' })).toMatchObject({ productRole: 'main_product', status: 'review_required' })
  })

  it('recognizes accessory titles within product families', () => {
    expect(classifyProduct({ title: 'Suporte de celular para carro' })).toMatchObject({ productType: 'smartphone', productRole: 'accessory', status: 'excluded' })
    expect(classifyProduct({ title: 'Cadarço para tênis de corrida' })).toMatchObject({ productType: 'running_shoe', productRole: 'accessory', status: 'excluded' })
  })

  it.each([
    ['Cafeteira Elétrica Oster 1,2L', 'coffee_maker'],
    ['Batedeira Planetária Arno 700W', 'stand_mixer'],
    ['Liquidificador Mondial 3L', 'blender'],
    ['Mixer 3 em 1 Britânia', 'hand_blender'],
    ['Sanduicheira Elétrica Philco', 'sandwich_maker'],
    ['Notebook Lenovo Ideapad 15', 'notebook'],
    ['Smart TV LG 50 polegadas', 'television'],
    ['Fone Bluetooth JBL', 'headphones'],
    ['Tênis Adidas Casual', 'casual_shoe'],
    ['Vestido Feminino Midi', 'dress'],
    ['Secador de Cabelo Taiff', 'hair_dryer'],
    ['Bicicleta Caloi Aro 29', 'bicycle'],
    ['PlayStation 5 Slim', 'game_console'],
    ['Pipoqueira Popflix Mondial PP-03', 'popcorn_maker'],
    ['Espremedor de Frutas Philco PEF750P', 'juicer'],
    ['Extrator de Sucos Turbo Mondial', 'juicer'],
    ['Computador PC Gamer Ryzen', 'desktop'],
    ['Monitor LG UltraWide', 'monitor'],
    ['Projetor Full HD', 'projector'],
    ['Caixa de Som Bluetooth JBL', 'speaker'],
    ['Smartband Xiaomi', 'smartband'],
    ['Kindle Paperwhite', 'ereader'],
    ['Drone DJI Mini', 'drone'],
    ['Lâmpada Inteligente Wi-Fi', 'smart_bulb'],
    ['iPhone 15 128GB', 'smartphone'],
    ['HD Externo Portátil 1TB', 'external_hdd'],
    ['TV Box 4K Android', 'tv_box'],
    ['Home Theater LG 5.1', 'home_theater'],
    ['Smart Band Xiaomi Mi Band', 'smartband'],
    ['Echo Dot 5ª Geração', 'smart_speaker'],
    ['Drone DJI Mini 4', 'drone'],
    ['Mi Band 8', 'smartband'],
    ['Tomada Inteligente Wi-Fi', 'smart_plug'],
  ])('classifies %s as %s', (title, productType) => {
    expect(classifyProduct({ title })).toMatchObject({ productType, productRole: 'main_product', status: 'classified' })
  })

  it.each([
    ['Capa para celular Samsung', 'smartphone', 'accessory'],
    ['Kit cafeteira + moedor', 'coffee_maker', 'bundle'],
    ['Cupom para liquidificador', 'blender', 'coupon'],
    ['Carregador Turbo USB-C', 'charger', 'accessory'],
    ['Cabo HDMI 2.1', 'cable', 'accessory'],
    ['Hub USB-C 7 em 1', 'hub', 'accessory'],
    ['Controle Gamer sem fio', 'game_controller', 'accessory'],
  ])('does not promote %s', (title, productType, productRole) => {
    expect(classifyProduct({ title })).toMatchObject({ productType, productRole, status: 'excluded' })
  })

  it('sends an unsupported title to review', () => {
    expect(classifyProduct({ title: 'Produto especial em promoção' })).toMatchObject({ productRole: 'main_product', status: 'review_required' })
  })
})
