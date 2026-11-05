// Backup file download (Settings).

import { app, save } from './app.svelte';
import { exportSave, type Save } from './storage';

export function downloadBackup() {
  app.save.backupAt = Date.now();
  save();
  const blob = new Blob([exportSave($state.snapshot(app.save) as Save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kanjistudy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
