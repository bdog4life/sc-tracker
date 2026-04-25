export type EventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'ZONE_ENTERED'
  | 'LOCATION_CHANGE'
  | 'ATTACHMENT_RECEIVED'
  | 'MISSION_START'
  | 'MISSION_END'
  | 'MISSION_CONTRACT'
  | 'SHIP_CLAIM'
  | 'SHIP_NEARBY'
  | 'ITEM_STORED'
  | 'BLUEPRINT_RECEIVED';

export interface ParsedEvent {
  type: EventType;
  occurredAt: Date;
  parserVersion: number;
  payload: Record<string, unknown>;
}

// Payload shapes — used for type-safe construction in patterns.ts
export interface SessionStartPayload {
  gameVersion: string;
  gameBranch: string;
  characterName: string;
  playerGeid: string;
}

export interface SessionEndPayload {
  reason: string;
}

export interface ZoneEnteredPayload {
  notificationText: string;
  notificationIndex: number;
}

export interface LocationChangePayload {
  playerName: string;
  fromLandingId: string;
  toLandingId: string;
  fromLocationId: string;
  toLocationId: string;
}

export interface AttachmentReceivedPayload {
  playerName: string;
  attachmentName: string;
  itemClass: string;
  itemId: string;
  status: string;
  port: string;
}

export interface MissionStartPayload {
  missionType: string;
  seed: string;
  entityId: string;
}

export interface MissionEndPayload {
  entityId: string;
  event: 'EndMission' | 'MissionEnded';
}

export interface MissionContractPayload {
  variableName: string;
  contractType: string;
  destinations: Array<{ name: string; id: string; zone: string }>;
}

export interface ShipClaimPayload {
  entitlementUrn: string;
  requestId: number;
}

export interface ShipNearbyPayload {
  shipClass: string;
  hostId: string;
}

export interface ItemStoredPayload {
  playerName: string;
  itemName: string;
  itemId: string;
  itemClass: string;
  requestId: number;
}

export interface BlueprintReceivedPayload {
  blueprintName: string;
  notificationIndex: number;
}

// WebSocket protocol messages (agent ↔ server)
export interface WsAuthMessage {
  type: 'auth';
  token: string;
}

export interface WsAuthOkMessage {
  type: 'auth_ok';
  userId: number;
}

export interface WsAuthErrorMessage {
  type: 'auth_error';
  message: string;
}

export interface WsEventMessage {
  type: 'event';
  payload: ParsedEvent;
}

export interface WsAckMessage {
  type: 'ack';
  eventId: number;
}

export type WsClientMessage = WsAuthMessage | WsEventMessage;
export type WsServerMessage = WsAuthOkMessage | WsAuthErrorMessage | WsAckMessage;
