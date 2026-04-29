import { DatabaseService } from '../db/database-service'
import { stripModernColumns } from '../db/legacy-export'
import { getUndoManager } from '../db/undo-provider'
import { decryptData, encryptData, isEncryptedBackup } from '../domain/backup-encryption'
import { getDatabaseService, setDatabaseService } from './service-provider'

export class EncryptedBackupError extends Error {
  constructor() {
    super('ENCRYPTED')
    this.name = 'EncryptedBackupError'
  }
}

export async function downloadBackup(): Promise<Blob> {
  const data = getDatabaseService().export()
  return new Blob([data.buffer as ArrayBuffer], { type: 'application/x-sqlite3' })
}

export async function downloadLegacyBackup(): Promise<Blob> {
  const data = getDatabaseService().export()
  const stripped = await stripModernColumns(data)
  return new Blob([stripped.buffer as ArrayBuffer], { type: 'application/x-sqlite3' })
}

export async function downloadEncryptedBackup(
  password: string,
  legacyCompat = false,
): Promise<Blob> {
  const raw = getDatabaseService().export()
  const data = legacyCompat ? await stripModernColumns(raw) : raw
  const encrypted = await encryptData(data, password)
  return new Blob([encrypted.buffer as ArrayBuffer], { type: 'application/octet-stream' })
}

export async function restoreBackup(file: File, password?: string): Promise<void> {
  const arrayBuffer = await file.arrayBuffer()
  let data: Uint8Array = new Uint8Array(arrayBuffer)

  if (isEncryptedBackup(data)) {
    if (!password) {
      throw new EncryptedBackupError()
    }
    data = await decryptData(data, password)
  }

  const oldService = getDatabaseService()
  oldService.close()

  const newService = await DatabaseService.createFromData(data)
  setDatabaseService(newService)
  await newService.save()

  try {
    const undoManager = getUndoManager()
    await undoManager.clear()
    await undoManager.captureInitialState()
  } catch (e) {
    console.warn('Failed to reset undo history after backup restore:', e)
  }
}
