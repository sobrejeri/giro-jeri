// Papel de quem executa o serviço (operational_assignments.executor_role, 132).
// Uma fonte só para os textos que o cliente e o executor leem.
export const PAPEIS = {
  driver: { nome: 'Motorista', veiculo: 'Veículo',  emoji: '🚗' },
  guide:  { nome: 'Guia',      veiculo: null,       emoji: '🧭' },
  pilot:  { nome: 'Piloto',    veiculo: 'Aeronave', emoji: '🚁' },
};
export const papelValido = (v) => Object.prototype.hasOwnProperty.call(PAPEIS, v);
export const papelDe = (assignment) => PAPEIS[assignment?.executor_role] || PAPEIS.driver;
