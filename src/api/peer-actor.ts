// Module-global actor label, read by withSave to tag undo entries.
// Safe only under single-inflight RPC dispatch (set before await, cleared in
// finally). Parallelizing the dispatcher would require per-request storage.
let currentActor: string | null = null

export function setCurrentActor(label: string): void {
  currentActor = label
}

export function clearCurrentActor(): void {
  currentActor = null
}

export function getCurrentActor(): string | null {
  return currentActor
}
