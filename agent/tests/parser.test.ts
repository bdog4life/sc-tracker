import { describe, it, expect } from 'vitest';
import { LogParser } from '../src/parser/index';

describe('LogParser', () => {
  it('returns empty array for unrecognized line', () => {
    const parser = new LogParser();
    const result = parser.parseLine('some random garbage line');
    expect(result).toEqual([]);
  });

  describe('SESSION events', () => {
    it('accumulates version from FileVersion line', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        '<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160'
      );
      expect(events).toEqual([]);
      // No event emitted yet — state is accumulating
    });

    it('emits SESSION_START when character name line appears', () => {
      const parser = new LogParser();
      parser.parseLine('<2026-04-22T00:48:48.344Z> Log started on Wed Apr 22');
      parser.parseLine('<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160');
      parser.parseLine('<2026-04-22T00:48:48.734Z> Branch: sc-alpha-4.8.0');
      const events = parser.parseLine(
        '<2026-04-22T00:49:02.808Z> [Notice] <AccountLoginCharacterStatus_Character> Character: createdAt 1776818976428 - updatedAt 1776818976431 - geid 821434803302 - accountId 5974598 - name Hasansa - state STATE_UNSPECIFIED'
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SESSION_START');
      expect(events[0].payload).toMatchObject({
        gameVersion: '4.8.178.24160',
        gameBranch: 'sc-alpha-4.8.0',
        characterName: 'Hasansa',
        playerGeid: '821434803302',
      });
    });

    it('does not emit SESSION_START twice', () => {
      const parser = new LogParser();
      parser.parseLine('<2026-04-22T00:48:48.344Z> Log started on Wed Apr 22');
      parser.parseLine('<2026-04-22T00:48:48.346Z> FileVersion: 4.8.178.24160');
      parser.parseLine('<2026-04-22T00:48:48.734Z> Branch: sc-alpha-4.8.0');
      const charLine = '<2026-04-22T00:49:02.808Z> [Notice] <AccountLoginCharacterStatus_Character> Character: createdAt 1776818976428 - updatedAt 1776818976431 - geid 821434803302 - accountId 5974598 - name Hasansa - state STATE_UNSPECIFIED';
      parser.parseLine(charLine);
      const events = parser.parseLine(charLine);
      expect(events).toHaveLength(0);
    });

    it('emits SESSION_END on SystemQuit', () => {
      const parser = new LogParser();
      const events = parser.parseLine('<2026-04-22T02:39:00.000Z> <SystemQuit>');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SESSION_END');
      expect(events[0].payload).toMatchObject({ reason: 'SystemQuit' });
    });
  });

  describe('ZONE_ENTERED', () => {
    it('parses jurisdiction notification', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-22T00:51:03.947Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entered People's Alliance Jurisdiction: " [0] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ZONE_ENTERED');
      expect(events[0].payload).toMatchObject({
        notificationText: "Entered People's Alliance Jurisdiction: ",
        notificationIndex: 0,
      });
    });

    it('parses armistice zone notification', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-25T13:18:15.359Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entering Armistice Zone - Combat Prohibited: " [1] to queue. New queue size: 2, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
      );
      expect(events[0].payload).toMatchObject({
        notificationText: 'Entering Armistice Zone - Combat Prohibited: ',
        notificationIndex: 1,
      });
    });

    it('ignores UpdateNotificationItem lines', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-22T00:51:08.955Z> [Notice] <UpdateNotificationItem> Notification "Entered People's Alliance Jurisdiction: " [0], Action: StartFade [Team_CoreGameplayFeatures][Missions][Comms]`
      );
      expect(events).toHaveLength(0);
    });

    it('does not match blueprint notifications', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-25T13:54:43.986Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Corbel Core Halcyon: " [32] to queue. New queue size: 3, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
      );
      // Should produce BLUEPRINT_RECEIVED, NOT ZONE_ENTERED
      expect(events.every(e => e.type !== 'ZONE_ENTERED')).toBe(true);
    });
  });

  describe('BLUEPRINT_RECEIVED', () => {
    it('parses blueprint reward notification', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-25T13:54:43.986Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Corbel Core Halcyon: " [32] to queue. New queue size: 3, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('BLUEPRINT_RECEIVED');
      expect(events[0].payload).toMatchObject({
        blueprintName: 'Corbel Core Halcyon',
        notificationIndex: 32,
      });
    });

    it('parses a second blueprint with different name', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-25T14:02:29.622Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: Palatino Core Metropolis: " [45] to queue. New queue size: 2, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`
      );
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        blueprintName: 'Palatino Core Metropolis',
        notificationIndex: 45,
      });
    });
  });

  describe('LOCATION_CHANGE', () => {
    it('parses location change', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        '<2026-04-22T00:51:03.583Z> [Notice] <Update Inventory Location> Player [Hasansa] is changing location. Landing [0] -> [3058615591]. Location [0] -> [3058615591]. Pending [0] [Team_CoreGameplayFeatures][Inventory]'
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('LOCATION_CHANGE');
      expect(events[0].payload).toMatchObject({
        playerName: 'Hasansa',
        fromLandingId: '0',
        toLandingId: '3058615591',
        fromLocationId: '0',
        toLocationId: '3058615591',
      });
    });
  });

  describe('ATTACHMENT_RECEIVED', () => {
    it('parses gear attachment', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        '<2026-04-22T00:49:11.683Z> [Notice] <AttachmentReceived> Player[Hasansa] Attachment[body_01_noMagicPocket_200000000216, body_01_noMagicPocket, 200000000216] Status[persistent] Port[Body_ItemPort] Elapsed[29.601799] [Team_CoreGameplayFeatures][Inventory]'
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ATTACHMENT_RECEIVED');
      expect(events[0].payload).toMatchObject({
        playerName: 'Hasansa',
        attachmentName: 'body_01_noMagicPocket_200000000216',
        itemClass: 'body_01_noMagicPocket',
        itemId: '200000000216',
        status: 'persistent',
        port: 'Body_ItemPort',
      });
    });
  });

  describe('ITEM_STORED', () => {
    it('parses store item event', () => {
      const parser = new LogParser();
      const events = parser.parseLine(
        `<2026-04-22T01:20:31.927Z> [Notice] <StoreItem> Request[25] store 'cds_combat_light_backpack_01_02_01_9945947247211' [9945947247211] by 'acidrom' [201926431414] To Inventory[INVALID] Class[cds_combat_light_backpack_01_02_01] Rank[ampcsvjpvrigzzzzaaaaak] ItemsCount[68] [Team_CoreGameplayFeatures][Inventory]`
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ITEM_STORED');
      expect(events[0].payload).toMatchObject({
        requestId: 25,
        itemName: 'cds_combat_light_backpack_01_02_01_9945947247211',
        itemId: '9945947247211',
        playerName: 'acidrom',
        itemClass: 'cds_combat_light_backpack_01_02_01',
      });
    });
  });
});
