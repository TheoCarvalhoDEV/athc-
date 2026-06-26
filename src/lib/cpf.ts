// Utilitários de CPF compartilhados (máscara de exibição + validação de dígitos).
// Extraídos do EventDetails para reuso na compra e na recuperação de ingresso por CPF.

// Formata progressivamente para exibição: 000.000.000-00 (aceita string parcial).
export const formatCPF = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

// Remove tudo que não for dígito.
export const onlyDigits = (value: string): string => (value || '').replace(/\D/g, '');

// Valida um CPF brasileiro pelos dois dígitos verificadores.
export const isValidCPF = (cpf: string): boolean => {
  const cleanCpf = onlyDigits(cpf);
  if (cleanCpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
  }
  let rest = sum % 11;
  const digit1 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(cleanCpf.charAt(9)) !== digit1) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
  }
  rest = sum % 11;
  const digit2 = rest < 2 ? 0 : 11 - rest;
  if (parseInt(cleanCpf.charAt(10)) !== digit2) return false;

  return true;
};
