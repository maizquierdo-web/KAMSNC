import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveHunterCanvas } from './saveHunterCanvas.mjs';

function mock({ previous = null, conflict = false, uploadError = null, readError = null } = {}) {
  const calls = [];
  const client = {
    from() { return {
      select() { return this; }, eq(key, value) { calls.push(['eq', key, value]); return this; },
      maybeSingle() { return { data: previous, error: readError }; },
      insert(record) { calls.push(['insert', record]); return this; },
      update(record) { calls.push(['update', record]); return this; },
      single() { return { data: conflict ? null : { id: 'saved' }, error: conflict ? new Error('conflict') : null }; },
    }; },
    storage: { from() { return {
      async upload(path) { calls.push(['upload', path]); return { error: uploadError }; },
      async remove(paths) { calls.push(['remove', paths]); return {}; },
    }; } },
  };
  return { client, calls };
}
const input = { channelId: 'channel-A', userId: 'user-A', blob: { size: 100 }, fileName: 'canvas.docx', text: '[Hipótesis] Borrador de IA', makeId: () => 'new-file' };

test('first save inserts the scoped document and its readable labelled text', async () => {
  const m = mock();
  assert.equal((await saveHunterCanvas({ ...input, client: m.client })).saved, true);
  const record = m.calls.find(c => c[0] === 'insert')[1];
  assert.equal(record.channel_id, 'channel-A'); assert.equal(record.document_type, 'hunter_canvas');
  assert.equal(record.extracted_text, input.text); assert.equal(record.uploaded_by, 'user-A');
  assert.ok(!m.calls.some(c => c[0] === 'remove'));
});

test('existing documents require explicit confirmation before any upload or mutation', async () => {
  const m = mock({ previous: { id: 'old', updated_at: 'old-date', file_name: 'old.docx' } });
  assert.equal((await saveHunterCanvas({ ...input, client: m.client, confirmReplace: () => false })).saved, false);
  assert.ok(!m.calls.some(c => ['upload', 'update', 'insert', 'remove'].includes(c[0])));
});

test('confirmed replacement uses optimistic version and retains old storage object', async () => {
  const m = mock({ previous: { id: 'old', updated_at: 'old-date', file_name: 'old.docx' } });
  await saveHunterCanvas({ ...input, client: m.client, confirmReplace: () => true });
  assert.ok(m.calls.some(c => c[0] === 'eq' && c[1] === 'updated_at' && c[2] === 'old-date'));
  assert.ok(m.calls.some(c => c[0] === 'update'));
  assert.ok(!m.calls.some(c => c[0] === 'remove'));
});

test('concurrent insert/update conflict cleans only the new upload', async () => {
  for (const previous of [null, { id: 'old', updated_at: 'old-date' }]) {
    const m = mock({ previous, conflict: true });
    await assert.rejects(saveHunterCanvas({ ...input, client: m.client, confirmReplace: () => true }), /No se pudo guardar/);
    assert.deepEqual(m.calls.find(c => c[0] === 'remove')[1], ['channel-A/hunter_canvas/new-file.docx']);
  }
});

test('read or upload failures do not modify the database', async () => {
  for (const setup of [{ readError: new Error('read denied') }, { uploadError: new Error('upload denied') }]) {
    const m = mock(setup);
    await assert.rejects(saveHunterCanvas({ ...input, client: m.client }), /denied/);
    assert.ok(!m.calls.some(c => c[0] === 'insert' || c[0] === 'update'));
  }
});
