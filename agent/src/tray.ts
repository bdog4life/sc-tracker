import SysTray from 'systray2';
import open from 'open';

interface TrayOptions {
  dashboardUrl: string;
  localUrl: string;
  onQuit: () => void;
}

export function createTray(opts: TrayOptions): { destroy: () => void } {
  // systray2 requires a 16x16 ICO as base64 — using a minimal placeholder
  const ICON_BASE64 =
    'AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

  const tray = new SysTray({
    menu: {
      icon: ICON_BASE64,
      title: 'SC Tracker',
      tooltip: 'Star Citizen Tracker — running',
      items: [
        {
          title: 'Open Dashboard',
          tooltip: 'Open the web dashboard',
          checked: false,
          enabled: true,
        },
        {
          title: 'Open Local View',
          tooltip: 'Open local stats (offline)',
          checked: false,
          enabled: true,
        },
        SysTray.separator,
        {
          title: 'Quit',
          tooltip: 'Stop the SC Tracker agent',
          checked: false,
          enabled: true,
        },
      ],
    },
    debug: false,
    copyDir: true,
  });

  tray.onClick((action) => {
    if (action.item.title === 'Open Dashboard') {
      open(opts.dashboardUrl).catch(() => {});
    } else if (action.item.title === 'Open Local View') {
      open(opts.localUrl).catch(() => {});
    } else if (action.item.title === 'Quit') {
      opts.onQuit();
      // kill(false) stops the tray process without exiting the node process
      // (onQuit handles the process.exit call)
      tray.kill(false).catch(() => {});
    }
  });

  return {
    destroy: () => {
      tray.kill(false).catch(() => {});
    },
  };
}
