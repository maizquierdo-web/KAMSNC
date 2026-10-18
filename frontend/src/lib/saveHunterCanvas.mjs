export async function saveHunterCanvas({ client, channelId, userId, blob, fileName, text, confirmReplace, makeId = () => crypto.randomUUID() }) {
  if (!userId || !channelId) throw new Error('No se ha identificado al usuario o al canal.');
  const existing = await client.from('business_cases').select('id, file_name, updated_at')
    .eq('channel_id', channelId).eq('document_type', 'hunter_canvas').maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && !await confirmReplace(existing.data)) return { saved: false };
  const path = `${channelId}/hunter_canvas/${makeId()}.docx`;
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const uploaded = await client.storage.from('business-cases').upload(path, blob, { contentType: mime });
  if (uploaded.error) throw uploaded.error;
  try {
    const record = { channel_id: channelId, document_type: 'hunter_canvas', file_name: fileName,
      storage_path: path, file_size: blob.size, file_type: mime, uploaded_by: userId,
      extracted_text: text, updated_at: new Date().toISOString() };
    // Never upsert: inserts cannot overwrite a concurrent upload. Updates use
    // the version read before confirmation so they cannot replace a newer file.
    const query = existing.data
      ? client.from('business_cases').update(record).eq('id', existing.data.id).eq('updated_at', existing.data.updated_at)
      : client.from('business_cases').insert(record);
    const result = await query.select('id').single();
    if (result.error) throw new Error('No se pudo guardar. Puede haber cambiado el documento o faltar permisos. Recarga la ficha antes de reintentar.');
    // Keep the previous storage object; do not delete someone else's document.
    return { saved: true };
  } catch (error) {
    await client.storage.from('business-cases').remove([path]).catch(() => {});
    throw error;
  }
}
