import { describe, expect, it } from 'vitest'
import { buildClubCodesPdf } from './club-codes-pdf'

const FAKE_QR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII='

function extractText(doc: ReturnType<typeof buildClubCodesPdf>): string[] {
  // jsPDF keeps rendered text fragments in the internal instruction stream.
  // Pull them out by rendering to PDF bytes and scanning for the Tj/TJ operators.
  const raw = doc.output() as unknown as string
  const matches = Array.from(raw.matchAll(/\(([^)]+)\)\s*Tj/g))
  return matches.map((m) => m[1])
}

describe('buildClubCodesPdf', () => {
  it('creates one page per entry', () => {
    const doc = buildClubCodesPdf({
      tournamentName: 'Test Cup',
      entries: [
        {
          label: 'SK Lansen',
          code: '1234',
          url: 'https://example.com/?c=1234',
          qrDataUrl: FAKE_QR_DATA_URL,
        },
        {
          label: 'Klubblösa',
          code: '5678',
          url: 'https://example.com/?c=5678',
          qrDataUrl: FAKE_QR_DATA_URL,
        },
        {
          label: 'Kungsbacka SS',
          code: '9012',
          url: 'https://example.com/?c=9012',
          qrDataUrl: FAKE_QR_DATA_URL,
        },
      ],
    })

    expect(doc.getNumberOfPages()).toBe(3)
  })

  it('wraps long URLs so they do not clip past the page edge', () => {
    const longUrl =
      'https://example.com/live/NMUQRZ?v=ba130ae&share=view&token=3e4d1713-7c69-4eb8-b8d7-05d5ad26e455&code=6528'
    const doc = buildClubCodesPdf({
      tournamentName: 'Stolta Lodjuret 2026',
      entries: [
        {
          label: 'KSS Nordvästra Gävle',
          code: '6528',
          url: longUrl,
          qrDataUrl: FAKE_QR_DATA_URL,
        },
      ],
    })
    const texts = extractText(doc)
    // A single Tj fragment carrying the full URL means it was NOT wrapped,
    // which overflows the A4 page at default font size.
    expect(texts).not.toContain(longUrl)
    // The URL content should still be present — just split across fragments.
    expect(texts.some((t) => t.includes('example.com'))).toBe(true)
  })

  it('renders tournament name, club label, code, url, and a manual-code hint on each page', () => {
    const doc = buildClubCodesPdf({
      tournamentName: 'Test Cup',
      entries: [
        {
          label: 'SK Lansen',
          code: '1234',
          url: 'https://example.com/?c=1234',
          qrDataUrl: FAKE_QR_DATA_URL,
        },
      ],
    })
    const texts = extractText(doc)
    expect(texts).toContain('Test Cup')
    expect(texts).toContain('SK Lansen')
    expect(texts).toContain('1234')
    expect(texts.some((t) => t.includes('example.com'))).toBe(true)
    // Helper text: shown above the code so manual-entry users know where to use it
    expect(texts.some((t) => /ombedd|fråga|prompt|kod/i.test(t))).toBe(true)
  })
})
