import { useQuery } from '@tanstack/react-query'

interface VersionEntry {
  version: string
  date: string | null
  hash: string | null
}

async function fetchVersions(): Promise<VersionEntry[]> {
  try {
    // cache: 'no-cache' bypasses the HTTP cache so a just-landed rollback
    // deploy is visible without a hard reload. react-query's staleTime
    // (below) still prevents refetch storms during normal UI interaction.
    const res = await fetch(`${import.meta.env.BASE_URL}versions.json`, { cache: 'no-cache' })
    if (!res.ok) return []
    const data = (await res.json()) as { versions?: VersionEntry[] }
    return Array.isArray(data.versions) ? data.versions : []
  } catch {
    return []
  }
}

export function useVersions() {
  return useQuery({
    queryKey: ['versions'],
    queryFn: fetchVersions,
    staleTime: 60_000,
    networkMode: 'online',
  })
}
