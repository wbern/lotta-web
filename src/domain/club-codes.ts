function simpleHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash
}

export function generateClubCodeMap(entries: string[], secret: string): Record<string, string> {
  const map: Record<string, string> = {}
  const used = new Set<string>()
  for (const entry of entries) {
    let salt = 0
    let code: string
    do {
      const h = Math.abs(simpleHash(`${secret}\0${entry}\0${salt}`))
      code = String(h % 10000).padStart(4, '0')
      salt++
    } while (used.has(code))
    used.add(code)
    map[entry] = code
  }
  return map
}
