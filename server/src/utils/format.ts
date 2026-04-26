export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return 'just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function avatarUrl(discordId: string, avatar: string | null): string {
  if (!avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=64`;
}

type EventCategory = 'purple' | 'green' | 'amber' | 'blue';

export function eventCategory(type: string): EventCategory {
  if (type === 'SESSION_START' || type === 'SESSION_END') return 'purple';
  if (type === 'ZONE_ENTERED' || type === 'LOCATION_CHANGE') return 'green';
  if (
    type === 'SHIP_CLAIM' || type === 'SHIP_NEARBY' ||
    type === 'ATTACHMENT_RECEIVED' || type === 'ITEM_STORED'
  ) return 'amber';
  return 'blue';
}

export function eventDescription(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case 'SESSION_START':   return 'Session started';
    case 'SESSION_END':     return 'Session ended';
    case 'ZONE_ENTERED':    return `Entered ${payload['notificationText'] ?? 'zone'}`;
    case 'LOCATION_CHANGE': return `Location: ${payload['fromLocationId'] ?? '?'} → ${payload['toLocationId'] ?? '?'}`;
    case 'MISSION_START':   return `Mission started: ${payload['missionType'] ?? 'unknown'}`;
    case 'MISSION_END':     return 'Mission ended';
    case 'MISSION_CONTRACT': return `Contract: ${payload['contractType'] ?? 'unknown'}`;
    case 'SHIP_CLAIM':      return 'Insurance claim filed';
    case 'SHIP_NEARBY':     return `Ship nearby: ${payload['shipClass'] ?? 'unknown'}`;
    case 'ATTACHMENT_RECEIVED': return `Received attachment: ${payload['attachmentName'] ?? 'unknown'}`;
    case 'ITEM_STORED':     return `Stored: ${payload['itemName'] ?? 'unknown'}`;
    case 'BLUEPRINT_RECEIVED': return `Blueprint received: ${payload['blueprintName'] ?? 'unknown'}`;
    default:                return type.replace(/_/g, ' ').toLowerCase();
  }
}
