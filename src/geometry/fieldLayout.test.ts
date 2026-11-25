import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, feet } from '../model/defaults'
import { fieldMarkings, fieldView, VIEW_DEFAULTS } from './fieldLayout'

// A round-number field for easy arithmetic: 40 x 100 yd, 10 yd end zones, 80 yd goal line to goal line.
const rules = { ...DEFAULT_RULES, fieldLength: 100, endZoneDepth: 10, noRunZone: 5 }
const markings = (ballOn: number, r = rules) => fieldMarkings(ballOn, r, fieldView(ballOn, r))

describe('fieldView', () => {
  it('shows the full width plus a margin, the backfield, and the whole end zone when it is close', () => {
    expect(fieldView(12, rules)).toEqual({ xMin: -21, xMax: 21, yMin: -12, yMax: 22 })
  })

  it('stops at the downfield limit when the goal line is far away', () => {
    expect(fieldView(40, rules).yMax).toBe(VIEW_DEFAULTS.ahead)
  })

  it('never shows past the back of the offense’s own end zone', () => {
    // Ball on its own 1: 1 yd of field plus the 10 yd end zone behind it.
    expect(fieldView(79, rules).yMin).toBe(-11)
  })
})

describe('fieldMarkings', () => {
  it('puts the goal line ballOn yards downfield and the line of scrimmage at the ball', () => {
    const m = markings(12)
    expect(m.lineOfScrimmageY).toBe(0)
    expect(m.goalLineY).toBe(12)
  })

  it('draws a full-width end zone of the profile depth behind the goal line', () => {
    expect(markings(12).endZone).toEqual({ x: -20, y: 12, width: 40, height: 10 })
    const shallow = { ...rules, endZoneDepth: 8, fieldLength: 96 }
    expect(markings(12, shallow).endZone).toEqual({ x: -20, y: 12, width: 40, height: 8 })
  })

  it('shades the no-run zone from the goal line back by the profile distance', () => {
    expect(markings(12).noRunZone).toEqual({ x: -20, y: 7, width: 40, height: 5 })
    expect(markings(12, { ...rules, noRunZone: 10 }).noRunZone).toEqual({ x: -20, y: 2, width: 40, height: 10 })
  })

  it('shades the league’s 10-foot no-run zone as 3⅓ yards', () => {
    const zone = markings(12, DEFAULT_RULES).noRunZone!
    expect(zone.height).toBeCloseTo(feet(10), 9)
    expect(zone.y).toBeCloseTo(12 - feet(10), 9)
  })

  it('lays out the league field: 8⅓ yd end zones and midfield at the 25', () => {
    const m = markings(12, DEFAULT_RULES)
    expect(m.endZone!.height).toBeCloseTo(feet(25), 9)
    expect(markings(25, DEFAULT_RULES).midfieldY).toBeCloseTo(0, 9)
    // Drive start, on the offense's own 10-foot line: own goal line is 3⅓ yd behind the ball.
    const start = markings(50 - feet(10), DEFAULT_RULES)
    expect(start.ownGoalLineY).toBeCloseTo(-feet(10), 9)
    expect(start.ownEndZone!.height).toBeCloseTo(feet(25), 9)
    expect(start.yardLines.at(-1)!.yardsFromGoal).toBe(45)
  })

  it('puts the ball inside the no-run zone at the 3-yard line', () => {
    expect(markings(3).noRunZone).toEqual({ x: -20, y: -2, width: 40, height: 5 })
  })

  it('omits the no-run zone when the profile sets it to 0', () => {
    expect(markings(12, { ...rules, noRunZone: 0 }).noRunZone).toBeNull()
  })

  it('paints yard lines every 5 yards from the goal line', () => {
    expect(markings(12).yardLines).toEqual([
      { y: 7, yardsFromGoal: 5 },
      { y: 2, yardsFromGoal: 10 },
      { y: -3, yardsFromGoal: 15 },
      { y: -8, yardsFromGoal: 20 },
    ])
  })

  it('has a 1-yard grid that skips the 5-yard lines', () => {
    const m = markings(12)
    expect(m.gridLines).toContain(11)
    expect(m.gridLines).toContain(0)
    expect(m.gridLines).not.toContain(7)
    expect(m.gridLines).not.toContain(12)
    expect(Math.min(...m.gridLines)).toBe(-12)
  })

  it('measures the snap grid from the ball, so it stays on whole yards at a 10-foot spot', () => {
    const m = markings(feet(10))
    expect(m.gridLines).toContain(0)
    expect(m.gridLines.every(Number.isInteger)).toBe(true)
    // Nothing is snapped into the end zone side of the goal line.
    expect(Math.max(...m.gridLines)).toBe(3)
  })

  it('drops the goal line, end zone, and no-run zone when they are beyond the view', () => {
    const view = fieldView(40, rules)
    const m = fieldMarkings(40, rules, view)
    expect(m.goalLineY).toBeNull()
    expect(m.endZone).toBeNull()
    expect(m.noRunZone).toBeNull()
    expect(m.yardLines.every((l) => l.y <= view.yMax && l.y >= view.yMin)).toBe(true)
    expect(m.yardLines[0]).toEqual({ y: 25, yardsFromGoal: 15 })
  })

  it('clips the end zone to the view when only part of it fits', () => {
    const m = markings(20)
    expect(m.endZone).toEqual({ x: -20, y: 20, width: 40, height: 5 })
    expect(m.turf).toEqual({ x: -20, y: -12, width: 40, height: 37 })
  })

  it('marks midfield as the first-down line, 40 yards from the goal line', () => {
    expect(markings(40).midfieldY).toBe(0)
    expect(markings(50).midfieldY).toBe(10)
    expect(markings(45).midfieldY).toBe(5)
    // Too far away to see from the 12.
    expect(markings(12).midfieldY).toBeNull()
    expect(markings(50, { ...rules, firstDownAtMidfield: false }).midfieldY).toBeNull()
  })

  it('draws the offense’s own goal line and end zone when backed up', () => {
    const m = markings(77)
    expect(m.ownGoalLineY).toBe(-3)
    expect(m.ownEndZone).toEqual({ x: -20, y: -12, width: 40, height: 9 })
    expect(m.yardLines.at(-1)).toEqual({ y: 2, yardsFromGoal: 75 })

    expect(markings(12).ownGoalLineY).toBeNull()
    expect(markings(12).ownEndZone).toBeNull()
  })
})
