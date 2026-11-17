export function pipelineRequirementsMessage(channel, nextStatus) {
  if (nextStatus !== 'en_evaluacion' || channel.status === nextStatus) return '';
  const missing = [];
  if (!channel.informe_economico_url?.trim()) missing.push('adjuntar el informe económico de INFORMA');
  const amount = Number(channel.volume_amount);
  if (!Number.isFinite(amount) || amount <= 0 || !channel.volume_unit?.trim()) {
    missing.push('registrar el volumen anual negociado (importe mayor que cero y unidad)');
  }
  return missing.length ? `Para pasar a En negociación, debes ${missing.join(' y ')}.` : '';
}
