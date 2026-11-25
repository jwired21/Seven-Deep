import { describe, expect, it } from 'vitest'
import { ballSpots, DEFAULT_RULES, feet, playingLength } from './defaults'
import { formatYd } from './format'

describe('formatYd', () => {
  it('prints whole yards plain', () => {
    expect(formatYd(12)).toBe('12')
    expect(formatYd(0)).toBe('0')
  })

  it('prints the rulebook foot marks as thirds of a yard', () => {
    expect(formatYd(feet(10))).toBe('3⅓')
    expect(formatYd(feet(20))).toBe('6⅔')
    expect(formatYd(80 - feet(10))).toBe('76⅔')
    expect(formatYd(1 / 3)).toBe('⅓')
  })

  it('prints halves and falls back to one decimal', () => {
    expect(formatYd(2.5)).toBe('2½')
    expect(formatYd(4.25)).toBe('4.3')
  })
})

describe('league defaults', () => {
  it('is the rulebook field: 200 ft long with 25 ft end zones, so 50 yd goal line to goal line', () => {
    expect(DEFAULT_RULES.fieldWidth).toBe(40)
    expect(formatYd(DEFAULT_RULES.fieldLength)).toBe('66⅔')
    expect(formatYd(DEFAULT_RULES.endZoneDepth)).toBe('8⅓')
    expect(playingLength(DEFAULT_RULES)).toBe(50)
  })

  it('has a 10-foot no-run zone, stored in yards', () => {
    expect(DEFAULT_RULES.noRunZone).toBeCloseTo(3.3333, 4)
  })

  it('puts the rulebook ball spots in yards from the goal line', () => {
    const spots = Object.fromEntries(ballSpots(DEFAULT_RULES).map((s) => [s.label, s.ballOn]))
    expect(spots['Midfield']).toBe(25)
    expect(spots['Drive start']).toBeCloseTo(46.6667, 4)
    expect(spots['2-pt try']).toBeCloseTo(6.6667, 4)
    expect(spots['1-pt try']).toBeCloseTo(3.3333, 4)
  })
})
