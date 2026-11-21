function toCents(value) {
  const match = String(value).match(/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error('Valor monetário inválido.');
  }

  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Valor monetário fora do intervalo permitido.');
  }

  return cents;
}

function fromCents(value) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

module.exports = { toCents, fromCents };
