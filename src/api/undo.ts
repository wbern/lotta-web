import { DatabaseService } from '../db/database-service'
import { getUndoManager } from '../db/undo-provider'
import { getDataProvider } from './active-provider'
import { getDatabaseService, setDatabaseService } from './service-provider'

async function restoreFromSnapshot(data: Uint8Array): Promise<void> {
  const oldService = getDatabaseService()
  oldService.close()

  const newService = await DatabaseService.createFromData(data)
  setDatabaseService(newService)
  await newService.save()
}

export async function undoLocal(): Promise<boolean> {
  const snapshot = await getUndoManager().undo()
  if (!snapshot) return false
  await restoreFromSnapshot(snapshot)
  return true
}

export async function redoLocal(): Promise<boolean> {
  const snapshot = await getUndoManager().redo()
  if (!snapshot) return false
  await restoreFromSnapshot(snapshot)
  return true
}

export async function restoreToPointLocal(snapshotIndex: number): Promise<boolean> {
  const snapshot = await getUndoManager().restoreToSnapshot(snapshotIndex)
  if (!snapshot) return false
  await restoreFromSnapshot(snapshot)
  return true
}

export async function undo(): Promise<boolean> {
  return getDataProvider().undo.perform()
}

export async function redo(): Promise<boolean> {
  return getDataProvider().undo.redo()
}

export async function restoreToPoint(snapshotIndex: number): Promise<boolean> {
  return getDataProvider().undo.restoreToPoint(snapshotIndex)
}
