import { describe, it, expect } from 'vitest';
import { formatCPF, isValidCPF, onlyDigits } from './cpf';

describe('cpf', () => {
  it('formatCPF aplica a máscara progressivamente', () => {
    expect(formatCPF('529')).toBe('529');
    expect(formatCPF('5299')).toBe('529.9');
    expect(formatCPF('5299822')).toBe('529.982.2');
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
  });

  it('formatCPF ignora não-dígitos e trunca em 11', () => {
    expect(formatCPF('529.982.247-25extra')).toBe('529.982.247-25');
  });

  it('onlyDigits remove tudo que não for número', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725');
  });

  it('isValidCPF aceita CPF válido (com ou sem máscara)', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
  });

  it('isValidCPF rejeita dígitos verificadores errados', () => {
    expect(isValidCPF('529.982.247-26')).toBe(false);
  });

  it('isValidCPF rejeita sequências repetidas e tamanho inválido', () => {
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
    expect(isValidCPF('')).toBe(false);
  });
});
