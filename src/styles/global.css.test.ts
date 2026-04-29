import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

function readGlobalCss(): string {
  return readFileSync(resolve(__dirname, 'global.css'), 'utf-8')
}

/**
 * Strip :root { ... } blocks so we only inspect rules outside variable definitions.
 * Also strips @media blocks that redefine :root (for dark mode overrides).
 */
function stripRootBlocks(css: string): string {
  let result = ''
  let depth = 0
  let inRoot = false
  let i = 0

  while (i < css.length) {
    // Detect :root selector
    if (!inRoot && depth === 0 && css.slice(i).match(/^:root\s*\{/)) {
      inRoot = true
      // skip to opening brace
      while (i < css.length && css[i] !== '{') i++
      depth = 1
      i++
      continue
    }

    // Detect :root inside @media block (depth === 1 from @media)
    if (!inRoot && depth === 1 && css.slice(i).match(/^:root(?::not\([^)]*\))?\s*\{/)) {
      inRoot = true
      while (i < css.length && css[i] !== '{') i++
      depth = 2
      i++
      continue
    }

    // Detect [data-theme] selector blocks (variable definitions for themes)
    if (!inRoot && depth === 0 && css.slice(i).match(/^\[data-theme[^\]]*\]\s*\{/)) {
      inRoot = true
      while (i < css.length && css[i] !== '{') i++
      depth = 1
      i++
      continue
    }

    if (css[i] === '{') {
      depth++
    } else if (css[i] === '}') {
      depth--
      if (inRoot && depth === 0) {
        inRoot = false
        i++
        continue
      }
      // Also handle :root inside @media closing
      if (inRoot && depth === 1) {
        inRoot = false
        i++
        continue
      }
    }

    if (!inRoot) {
      result += css[i]
    }
    i++
  }
  return result
}

function toRem(value: string): number | null {
  const match = value.match(/^([\d.]+)(px|rem|em|%)$/)
  if (!match) return null
  const n = Number.parseFloat(match[1])
  switch (match[2]) {
    case 'px':
      return n / 16
    case 'rem':
      return n
    case 'em':
      return n
    case '%':
      return n / 100
    default:
      return null
  }
}

describe('global.css mobile tournament selector alignment', () => {
  it('gives selector-field labels a fixed width so dropdowns align vertically', () => {
    const css = readGlobalCss()
    const pattern = /@media[^{]*\{[\s\S]*?\.selector-field label\s*\{([^}]*)\}[\s\S]*?\n\s*\}/
    const match = css.match(pattern)
    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).not.toMatch(/min-width\s*:/)
    expect(body).toMatch(/(?<![-\w])width\s*:\s*[\d.]+(?:em|rem|px|ch)/)
  })
})

describe('global.css minimum font size', () => {
  it('never declares a font size smaller than 1rem', () => {
    const css = readGlobalCss()
    const violations: string[] = []
    const declPattern = /(font-size|--font-size[\w-]*)\s*:\s*([^;]+);/

    css.split('\n').forEach((line, idx) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('/*') || trimmed.startsWith('*')) return
      const match = trimmed.match(declPattern)
      if (!match) return
      const value = match[2].trim()
      if (value.startsWith('var(') || value.startsWith('calc(')) return
      if (
        /^(inherit|initial|unset|revert|smaller|larger|medium|small|large|x-small|xx-small|x-large|xx-large)$/.test(
          value,
        )
      )
        return
      const rem = toRem(value)
      if (rem !== null && rem < 1) {
        violations.push(`line ${idx + 1}: ${trimmed} (= ${rem}rem)`)
      }
    })

    expect(violations).toEqual([])
  })
})

describe('global.css color variable coverage', () => {
  it('has no hardcoded hex colors outside :root definitions', () => {
    const css = readGlobalCss()
    const outside = stripRootBlocks(css)

    // Match hex colors (#fff, #ffffff, #e8e8e8, etc.) but not inside comments
    const hexPattern = /#(?:[0-9a-fA-F]{3,8})\b/g
    const matches: string[] = []

    for (const line of outside.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
      const found = trimmed.match(hexPattern)
      if (found) {
        matches.push(...found.map((m) => `${m} in: ${trimmed}`))
      }
    }

    expect(matches).toEqual([])
  })

  it('has no hardcoded "white" or "black" color keywords outside :root', () => {
    const css = readGlobalCss()
    const outside = stripRootBlocks(css)

    // Match color: white, color: black, background: white, etc.
    const colorKeywordPattern =
      /(?:color|background|background-color|border-color)\s*:\s*(white|black)\b/gi
    const matches: string[] = []

    for (const line of outside.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
      const found = trimmed.match(colorKeywordPattern)
      if (found) {
        matches.push(...found.map((m) => `${m} in: ${trimmed}`))
      }
    }

    expect(matches).toEqual([])
  })

  it('has no hardcoded rgba() colors outside :root definitions', () => {
    const css = readGlobalCss()
    const outside = stripRootBlocks(css)

    const rgbaPattern = /rgba?\([^)]+\)/gi
    const matches: string[] = []

    for (const line of outside.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('/*') || trimmed.startsWith('*')) continue
      const found = trimmed.match(rgbaPattern)
      if (found) {
        matches.push(...found.map((m) => `${m} in: ${trimmed}`))
      }
    }

    expect(matches).toEqual([])
  })

  it('defines required CSS variables in :root', () => {
    const css = readGlobalCss()

    const requiredVars = [
      '--color-bg',
      '--color-surface',
      '--color-border',
      '--color-text',
      '--color-text-muted',
      '--color-primary',
      '--color-primary-hover',
      '--color-selected',
      '--color-hover',
      '--color-danger',
      '--color-border-light',
      '--color-text-on-primary',
      '--color-shadow',
      '--color-shadow-strong',
      '--color-overlay',
      '--color-success',
      '--color-danger-hover',
      '--color-status-connected',
      '--color-status-warning',
      '--color-status-error',
      '--color-status-offline',
      '--color-banner-warning-bg',
      '--color-banner-warning-text',
      '--color-banner-warning-border',
      '--color-badge-viewer-bg',
      '--color-badge-viewer-text',
      '--color-badge-referee-bg',
      '--color-badge-referee-text',
    ]

    for (const v of requiredVars) {
      expect(css).toContain(`${v}:`)
    }
  })
})

describe('global.css toast stacking layer', () => {
  it('renders the .toast-stack above other 1000-stack overlays like .live-confirm', () => {
    const css = readGlobalCss()
    const toastMatch = css.match(/(?:^|\n)\.toast-stack\s*\{([^}]*)\}/)
    const liveConfirmMatch = css.match(/(?:^|\n)\.live-confirm\s*\{([^}]*)\}/)
    expect(toastMatch).not.toBeNull()
    expect(liveConfirmMatch).not.toBeNull()
    const toastZ = Number(toastMatch![1].match(/z-index\s*:\s*(\d+)/)?.[1])
    const liveZ = Number(liveConfirmMatch![1].match(/z-index\s*:\s*(\d+)/)?.[1])
    expect(toastZ).toBeGreaterThan(liveZ)
  })
})

describe('global.css reduced motion', () => {
  it('disables the .toast fade-in animation under prefers-reduced-motion', () => {
    const css = readGlobalCss()
    const pattern =
      /@media[^{]*prefers-reduced-motion[^{]*\{[\s\S]*?\.toast\s*\{([^}]*)\}[\s\S]*?\n\s*\}/
    const match = css.match(pattern)
    expect(match).not.toBeNull()
    expect(match![1]).toMatch(/animation\s*:\s*none/)
  })
})

describe('global.css live content scrollability', () => {
  it('allows .live-content to scroll vertically on constrained viewports', () => {
    const css = readGlobalCss()

    // Match the plain `.live-content { ... }` rule (not `.live-page--kiosk .live-content`)
    const match = css.match(/(?:^|\n)\.live-content\s*\{([^}]*)\}/)
    expect(match).not.toBeNull()

    const body = match![1]
    expect(body).toMatch(/overflow-y\s*:\s*auto/)
    expect(body).toMatch(/min-height\s*:\s*0/)
    expect(body).not.toMatch(/overflow\s*:\s*hidden/)
  })
})

describe('global.css dark theme', () => {
  it('defines dark overrides via prefers-color-scheme media query', () => {
    const css = readGlobalCss()

    // Must have @media (prefers-color-scheme: dark) with :root:not([data-theme="light"])
    expect(css).toMatch(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[^}]*:root:not\(\[data-theme=['"]light['"]\]\)/s,
    )
  })

  it('defines dark overrides via [data-theme="dark"] selector', () => {
    const css = readGlobalCss()

    expect(css).toMatch(/\[data-theme=['"]dark['"]\]\s*\{/)
  })

  it('sets color-scheme property in dark selectors', () => {
    const css = readGlobalCss()

    // Both dark selectors should set color-scheme: dark
    const mediaBlock = css.match(
      /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]*?)\n\}/,
    )
    expect(mediaBlock).not.toBeNull()
    expect(mediaBlock![1]).toContain('color-scheme: dark')

    const dataThemeBlock = css.match(/\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/)
    expect(dataThemeBlock).not.toBeNull()
    expect(dataThemeBlock![1]).toContain('color-scheme: dark')
  })

  it('sets color-scheme: light dark in :root for browser hints', () => {
    const css = readGlobalCss()

    // :root should declare support for both schemes
    const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)
    expect(rootBlock).not.toBeNull()
    expect(rootBlock![1]).toContain('color-scheme: light dark')
  })

  it('overrides all color variables in dark theme', () => {
    const css = readGlobalCss()

    const darkVars = [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-text-muted',
      '--color-border',
      '--color-primary',
      '--color-selected',
      '--color-hover',
      '--color-danger',
      '--color-border-light',
      '--color-text-on-primary',
      '--color-shadow',
      '--color-shadow-strong',
      '--color-overlay',
      '--color-success',
      '--color-danger-hover',
      '--color-status-connected',
      '--color-status-warning',
      '--color-status-error',
      '--color-status-offline',
      '--color-banner-warning-bg',
      '--color-banner-warning-text',
      '--color-banner-warning-border',
      '--color-badge-viewer-bg',
      '--color-badge-viewer-text',
      '--color-badge-referee-bg',
      '--color-badge-referee-text',
    ]

    // Check inside [data-theme="dark"] block
    const dataThemeBlock = css.match(/\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/)
    expect(dataThemeBlock).not.toBeNull()

    for (const v of darkVars) {
      expect(dataThemeBlock![1]).toContain(`${v}:`)
    }
  })

  it('uses off-black background, not pure black', () => {
    const css = readGlobalCss()

    const dataThemeBlock = css.match(/\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/)
    expect(dataThemeBlock).not.toBeNull()

    // --color-bg should NOT be #000 or #000000
    const bgMatch = dataThemeBlock![1].match(/--color-bg\s*:\s*([^;]+)/)
    expect(bgMatch).not.toBeNull()
    expect(bgMatch![1].trim()).not.toBe('#000')
    expect(bgMatch![1].trim()).not.toBe('#000000')
    expect(bgMatch![1].trim()).not.toBe('black')
  })
})
