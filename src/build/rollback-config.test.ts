import { describe, expect, it } from 'vitest'
import { rollbackBuildConfig } from './rollback-config'

describe('rollbackBuildConfig', () => {
  it('returns null when no rollback version is set', () => {
    expect(rollbackBuildConfig(null)).toBeNull()
  })

  it('derives base path for a given version', () => {
    expect(rollbackBuildConfig('1.2.3')).toEqual({
      base: '/v/1.2.3/',
    })
  })
})
