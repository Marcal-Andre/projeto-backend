function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function requireObject(value, label = 'Corpo da requisição') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${label} deve ser um objeto JSON.`);
  }

  return value;
}

function requiredString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw badRequest(`O campo ${field} é obrigatório.`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw badRequest(`O campo ${field} excede ${maxLength} caracteres.`);
  }

  return result;
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null) {
    return value;
  }

  return requiredString(value, field, maxLength);
}

function optionalBoolean(value, field, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw badRequest(`O campo ${field} deve ser booleano.`);
  }

  return value;
}

function positiveId(value, field = 'id') {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw badRequest(`O campo ${field} deve ser um inteiro positivo.`);
  }

  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw badRequest(`O campo ${field} está fora do intervalo permitido.`);
  }

  return id;
}

function parseIdList(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest(`O filtro ${field} deve conter IDs separados por vírgula.`);
  }

  return [...new Set(value.split(',').map((item) => positiveId(item, field)))];
}

module.exports = {
  badRequest,
  requireObject,
  requiredString,
  optionalString,
  optionalBoolean,
  positiveId,
  parseIdList,
};
