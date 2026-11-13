import { empresaDoOperador } from '../lib/vinculoEmpresa.js';

// Operador vinculado a uma empresa não mexe em recebimento próprio (conta no
// gateway, Mercado Pago): quem recebe é a empresa.
export async function requireIndependentReceiving(req, res, next) {
  try {
    if (await empresaDoOperador(req.user.id)) {
      return res.status(409).json({ error: 'O recebimento é administrado pela empresa vinculada.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}
