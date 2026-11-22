import { describe, it, expect } from 'vitest'
import { formatName } from '@/lib/formatName'

describe('formatName', () => {
  it('extracts the local part of an email held in full_name (Google sign-in)', () => {
    expect(formatName('ikethallium06@gmail.com')).toBe('Ikethallium')
    expect(formatName('mark.juni@ug.edu.gh')).toBe('Mark')
    expect(formatName('ama_boateng@st.ug.edu.gh')).toBe('Ama')
  })

  it('strips trailing digits from name-like strings', () => {
    expect(formatName('Patricialovia93')).toBe('Patricialovia')
    expect(formatName('kwame1')).toBe('Kwame')
  })

  it('shows only the first name of a multi-word name (privacy)', () => {
    expect(formatName('Mark Juni Ander')).toBe('Mark')
    expect(formatName('Ama BoATENG')).toBe('Ama')
  })

  it('normalises casing', () => {
    expect(formatName('aMA')).toBe('Ama')
    expect(formatName('KWAME')).toBe('Kwame')
  })

  it('falls back to Seller for empty / nullish / whitespace input', () => {
    expect(formatName('')).toBe('Seller')
    expect(formatName('   ')).toBe('Seller')
    expect(formatName(null)).toBe('Seller')
    expect(formatName(undefined)).toBe('Seller')
  })

  it('never returns a raw email address', () => {
    for (const input of ['a@b.com', 'user123@example.com', 'X_Y@Z.org']) {
      expect(formatName(input)).not.toContain('@')
    }
  })

  it('never returns trailing digits', () => {
    expect(formatName('student2024')).toBe('Student')
  })
})
