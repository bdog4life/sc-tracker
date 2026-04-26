import { describe, it, expect } from 'vitest';
import { formatDuration, avatarUrl, eventDescription, eventCategory } from '../src/utils/format';

describe('formatDuration', () => {
  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0m');
  });
  it('formats minutes only', () => {
    expect(formatDuration(150)).toBe('2m');
  });
  it('formats hours and minutes', () => {
    expect(formatDuration(9000)).toBe('2h 30m');
  });
  it('formats exact hours', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
  });
});

describe('avatarUrl', () => {
  it('returns CDN URL when avatar is present', () => {
    expect(avatarUrl('123', 'abc123')).toBe(
      'https://cdn.discordapp.com/avatars/123/abc123.png?size=64'
    );
  });
  it('returns default avatar when avatar is null', () => {
    expect(avatarUrl('123', null)).toBe(
      'https://cdn.discordapp.com/embed/avatars/0.png'
    );
  });
});

describe('eventDescription', () => {
  it('describes ZONE_ENTERED', () => {
    expect(eventDescription('ZONE_ENTERED', { notificationText: 'Hurston' }))
      .toBe('Entered Hurston');
  });
  it('describes MISSION_START', () => {
    expect(eventDescription('MISSION_START', { missionType: 'Delivery' }))
      .toBe('Mission started: Delivery');
  });
  it('describes SHIP_CLAIM', () => {
    expect(eventDescription('SHIP_CLAIM', {})).toBe('Insurance claim filed');
  });
  it('describes BLUEPRINT_RECEIVED', () => {
    expect(eventDescription('BLUEPRINT_RECEIVED', { blueprintName: 'Cutter' }))
      .toBe('Blueprint received: Cutter');
  });
  it('describes LOCATION_CHANGE', () => {
    expect(eventDescription('LOCATION_CHANGE', { fromLocationId: 'A', toLocationId: 'B' }))
      .toBe('Location: A → B');
  });
  it('falls back for unknown type', () => {
    expect(eventDescription('SESSION_START', {})).toBe('Session started');
  });
});

describe('eventCategory', () => {
  it('categorises session events as purple', () => {
    expect(eventCategory('SESSION_START')).toBe('purple');
    expect(eventCategory('SESSION_END')).toBe('purple');
  });
  it('categorises zone events as green', () => {
    expect(eventCategory('ZONE_ENTERED')).toBe('green');
    expect(eventCategory('LOCATION_CHANGE')).toBe('green');
  });
  it('categorises ship events as amber', () => {
    expect(eventCategory('SHIP_CLAIM')).toBe('amber');
    expect(eventCategory('SHIP_NEARBY')).toBe('amber');
    expect(eventCategory('ATTACHMENT_RECEIVED')).toBe('amber');
    expect(eventCategory('ITEM_STORED')).toBe('amber');
  });
  it('categorises mission events as blue', () => {
    expect(eventCategory('MISSION_START')).toBe('blue');
    expect(eventCategory('MISSION_END')).toBe('blue');
    expect(eventCategory('MISSION_CONTRACT')).toBe('blue');
    expect(eventCategory('BLUEPRINT_RECEIVED')).toBe('blue');
  });
});
