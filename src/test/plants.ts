import type { Plant, WateringEvent, WateringRule } from '@/modules/plantes/lib/plants'

export function ruleFixture(overrides: Partial<WateringRule> = {}): WateringRule {
  return {
    id: 'rule-1',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    first_watering_on: '2026-10-01',
    interval_count: 1,
    interval_unit: 'week',
    amount_ml: 250,
    note: null,
    ...overrides,
  }
}

export function plantFixture(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 'plant-1',
    name: 'Monstera',
    species: 'Monstera deliciosa',
    location: 'Salon',
    planted_on: '2026-04-01',
    planted_height_cm: 40,
    pot_diameter_cm: 20,
    notes: null,
    archived_at: null,
    created_at: '2026-04-01T10:00:00Z',
    photos: [],
    rules: [ruleFixture()],
    ...overrides,
  }
}

export function eventFixture(overrides: Partial<WateringEvent> = {}): WateringEvent {
  return {
    id: 'event-1',
    plant_id: 'plant-1',
    rule_id: 'rule-1',
    scheduled_on: '2026-10-22',
    watered_at: '2026-10-22T07:12:00Z',
    amount_ml: 250,
    done_by: 'u-eric',
    note: null,
    ...overrides,
  }
}
