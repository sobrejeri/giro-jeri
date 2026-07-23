import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildNupayProfilePayload,
  digits,
  getNupayProfileMissingFields,
  isCpf,
} from './nupayProfile.js'

test('digits strips punctuation and spaces', () => {
  assert.equal(digits(' +55 (88) 99999-8888 '), '5588999998888')
})

test('isCpf validates CPF check digits', () => {
  assert.equal(isCpf('529.982.247-25'), true)
  assert.equal(isCpf('529.982.247-24'), false)
  assert.equal(isCpf('123456789'), false)
})

test('getNupayProfileMissingFields requires name, email, phone and CPF', () => {
  assert.deepEqual(
    getNupayProfileMissingFields(
      { full_name: '', email: '', phone: '88', document_number: 'abc' },
      { document_type: 'passport' },
    ),
    ['full_name', 'email', 'phone', 'document_number'],
  )
})

test('getNupayProfileMissingFields keeps invalid saved contact fields editable', () => {
  assert.deepEqual(
    getNupayProfileMissingFields(
      {
        full_name: 'Maria Silva',
        email: 'email-invalido',
        phone: '1234567890123456',
        document_number: '529.982.247-24',
      },
      { document_type: 'cpf' },
    ),
    ['email', 'phone', 'document_number'],
  )
})

test('getNupayProfileMissingFields accepts valid NuPay profile', () => {
  assert.deepEqual(
    getNupayProfileMissingFields(
      {
        full_name: 'Maria Silva',
        email: 'maria@example.com',
        phone: '+55 88 99999-8888',
        document_number: '529.982.247-25',
      },
      { document_type: 'cpf' },
    ),
    [],
  )
})

test('buildNupayProfilePayload normalizes CPF and trims text fields', () => {
  assert.deepEqual(
    buildNupayProfilePayload({
      full_name: ' Maria Silva ',
      email: ' maria@example.com ',
      phone: ' +55 88 99999-8888 ',
      document_number: '529.982.247-25',
    }),
    {
      full_name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '+55 88 99999-8888',
      document_type: 'cpf',
      document_number: '52998224725',
    },
  )
})

test('buildNupayProfilePayload rejects invalid CPF', () => {
  assert.throws(
    () => buildNupayProfilePayload({
      full_name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '+55 88 99999-8888',
      document_number: '123',
    }),
    /CPF brasileiro válido/,
  )
})
