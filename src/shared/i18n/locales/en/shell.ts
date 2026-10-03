import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'Cancel',
  'common.quoted': '“{text}”',

  'main.quit.title': 'Servers are running',
  'main.quit.message': 'You have servers running.',
  'main.quit.detail':
    'They will be shut down properly so the world is not damaged. It may take a few seconds while they save the game.',
  'main.quit.confirm': 'Stop servers and quit',
  'main.quit.cancel': 'Cancel',
  'main.missing.title': 'The data folder cannot be found',
  'main.missing.message': 'The QubiQ data folder cannot be found: {path}',
  'main.missing.detail':
    'It may be on a drive that is not connected right now. Connect it and click “Retry”. If you choose the default folder ({defaultPath}), the app will start without your servers; nothing in the other folder is touched.',
  'main.missing.retry': 'Retry',
  'main.missing.useDefault': 'Use the default folder',
  'main.missing.quit': 'Quit',

  'app.noServersYet': 'You don’t have any servers yet.',
  'app.createServer': '+ Create server',
  'app.mode': 'Mode',
  'app.modeHint.basic': 'Just what you need to play. We pick the technical details for you.',
  'app.modeHint.advanced': 'The same screen, with every setting unlocked.',
  'app.settings': 'App settings',
  'app.loadError': 'The servers could not be loaded',
  'app.create.title': 'Create a new server',
  'app.create.titleGame': 'Create a new {game} server',
  'app.create.modeBasic': 'Basic mode',
  'app.create.modeAdvanced': 'Advanced mode',
  'app.create.changeMode': 'Change mode',
  'app.empty.title': 'You don’t have any servers yet',
  'app.empty.text': 'Create your first one and you’ll be playing in a few minutes.',
  'app.empty.button': 'Create my first server',

  'mode.basic': 'Basic',
  'mode.advanced': 'Advanced',
  'mode.basic.tagline': 'We guide you step by step',
  'mode.basic.point1':
    'One question per screen: the name, how many of you there are, whatever the game needs and how you connect',
  'mode.basic.point2': 'We take care of the technical side: version, memory and port',
  'mode.basic.point3': 'Afterwards, just one button to turn it on and off, your players and the console',
  'mode.basic.cta': 'Create in basic mode →',
  'mode.advanced.tagline': 'You decide everything',
  'mode.advanced.point1': 'Pick the exact version, memory and port',
  'mode.advanced.point2': 'The same screen, with all the configuration unlocked and a technical sheet',
  'mode.advanced.point3': 'Backups with interval and retention, seeds and every game setting',
  'mode.advanced.cta': 'Create in advanced mode →',
  'mode.chooser.title': 'How do you want to create it?',
  'mode.chooser.text':
    'You can switch modes whenever you like from the left sidebar or from the app settings. It doesn’t affect the server, only how much we ask you.',
  'mode.recommended': 'Recommended',
  'mode.current': 'Your current mode',

  'settings.title': 'App settings',
  'settings.back': 'Back',
  'settings.language.title': 'Language',
  'settings.language.hint':
    'Used across the whole interface. Game names and technical terms (RCON, BepInEx…) are not translated. Some error and installation messages still appear in Spanish.',
  'settings.language.auto': 'Automatic: same as Windows ({name})',
  'settings.mode.title': 'Mode',
  'settings.mode.hint':
    'How much the app asks you and how many settings it shows. It changes nothing on your servers: you can switch back and forth whenever you like.',
  'settings.mode.basicSub':
    'Just what you need to play. The app picks the version, memory and port for you, and guides you step by step when creating a server.',
  'settings.mode.advancedSub':
    'Everything in view: exact version, memory, port, backups with interval and retention, and every setting of each game.',
  'settings.dataFolder.title': 'Data folder',
  'settings.dataFolder.hint':
    'This is where the app keeps your servers, their backups, Java, SteamCMD and downloads. You can move it to another drive if this one is running out of space.',
  'settings.dataFolder.current': 'Current location',
  'settings.dataFolder.isDefault': 'This is the default folder.',
  'settings.dataFolder.notDefault': 'The default folder is {path}.',
  'settings.dataFolder.open': 'Open folder',
  'settings.dataFolder.change': 'Move it…',
  'settings.dataFolder.backToDefault': 'Go back to the default folder',
  'settings.dataFolder.pickTitle': 'Choose where to keep the QubiQ data',
  'settings.dataFolder.checking': 'Checking the folder and measuring how much space your data takes…',
  'settings.dataFolder.checkFailed': 'That folder could not be checked',
  'settings.dataFolder.target': 'The data will go to',
  'settings.dataFolder.subfolder':
    'The folder you chose already has things in it, so a QubiQ folder is created to keep them apart.',
  'settings.dataFolder.sameDrive': 'It is on the same drive: it moves instantly, without copying anything.',
  'settings.dataFolder.otherDrive': 'It is on another drive: {size} has to be copied.',
  'settings.dataFolder.problemTitle': 'It cannot be moved there',
  'settings.dataFolder.problem.same': 'The data is already in that folder.',
  'settings.dataFolder.problem.nested':
    'The new folder cannot be inside the current one, nor the current one inside the new one.',
  'settings.dataFolder.problem.spaces':
    'The path contains spaces. Some server installers (Forge’s, for example) fail with them, so they are not allowed. Choose a folder without spaces, such as D:\\QubiQ.',
  'settings.dataFolder.problem.network':
    'It is a network folder. If the network drops while a server is running the game can get corrupted, and SteamCMD cannot install to them. Choose a folder on a drive in this computer.',
  'settings.dataFolder.problem.occupied':
    'That folder already contains QubiQ data ({entries}). It won’t be mixed with yours: choose another folder or empty that one.',
  'settings.dataFolder.problem.notWritable':
    'Windows does not allow creating folders there. Choose another one, for example inside your user folder or on another drive.',
  'settings.dataFolder.problem.space':
    'Not enough space: {needed} is needed (your data plus a 1 GB margin) and that drive has {free} left.',
  'settings.dataFolder.problem.busy': {
    one: 'The server {servers} has to be stopped first: while it is running or installing, its files are open.',
    other:
      'These servers have to be stopped first: {servers}. While they are running or installing, their files are open.'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'The Valheim server {servers} has mods, and there its paths would reach {length} characters (Windows allows {max}). BepInEx would not start and the server would silently lose its mods. Choose a shorter path.',
    other:
      'The Valheim servers {servers} have mods, and there their paths would reach {length} characters (Windows allows {max}). BepInEx would not start and they would silently lose their mods. Choose a shorter path.'
  },
  'settings.dataFolder.problem.links':
    'The data contains a link to another folder ({path}). Across drives it cannot be copied without dragging along what is on the other side. Remove it or choose a folder on the same drive.',
  'settings.dataFolder.warning.firewallTitle': 'The Windows firewall will ask again',
  'settings.dataFolder.warning.firewall':
    'Firewall permissions are tied to each program’s path, and your servers’ paths change. The first time you start each server after the move, Windows will ask whether to let it use the network: accept, or your friends won’t be able to join.',
  'settings.dataFolder.warning.copyTitle': 'It will take a while',
  'settings.dataFolder.warning.copy':
    '{size} has to be copied. On an SSD expect about {minutes} min; on a hard drive, quite a bit longer. The app cannot be used in the meantime. If anything fails, the data stays where it is: the original folder is only deleted once the copy is complete and verified.',
  'settings.dataFolder.warning.cloudTitle': 'This folder is synced to the cloud',
  'settings.dataFolder.warning.cloud':
    'OneDrive and similar services upload everything that changes and lock files while doing so. With servers inside, that would mean GBs of uploads and half-written saves. Better to use a folder that is not synced.',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim will not be able to use mods',
  'settings.dataFolder.warning.valheimPath': {
    one: 'In that folder, the paths of the Valheim server {servers} would reach {length} characters (Windows allows {max}). It has no mods now and will keep working the same, but you won’t be able to add any.',
    other:
      'In that folder, the paths of the Valheim servers {servers} would reach {length} characters (Windows allows {max}). They have no mods now and will keep working the same, but you won’t be able to add any.'
  },
  'settings.dataFolder.howTitle': 'How it works',
  'settings.dataFolder.howText':
    'When you click {button}, the app closes and reopens by itself to move the data before starting anything. You will see the progress; when it finishes, everything stays as it is now, but in the new folder.',
  'settings.dataFolder.apply': 'Move and restart',
  'settings.dataFolder.applying': 'Restarting…',

  'relocation.movingTitle': 'Moving the QubiQ data',
  'relocation.movingHint':
    'Don’t close the app or turn off the computer. If it gets interrupted, nothing is lost: it resumes when you open it again.',
  'relocation.from': 'From',
  'relocation.to': 'To',
  'relocation.phase.measuring': 'Measuring what needs to be moved…',
  'relocation.phase.moving': 'Moving…',
  'relocation.phase.copying': 'Copying: {copied} of {total}',
  'relocation.phase.verifying': 'Checking that the copy is identical…',
  'relocation.phase.cleaning': 'Copy verified. Deleting the original folder…',
  'relocation.doneTitle': 'Data moved',
  'relocation.firewallTitle': 'One more thing',
  'relocation.firewall':
    'The first time you start each server, Windows may ask whether to let it use the network. Accept, or your friends won’t be able to join.',
  'relocation.leftoversTitle': 'Some leftovers remain in the previous folder',
  'relocation.leftovers':
    'Your data is complete in the new folder, but some folders in {path} could not be deleted (instances, runtimes, tools or cache). You can delete those folders by hand; don’t delete the whole folder, as it stores where your data is now.',
  'relocation.failedTitle': 'The data could not be moved',
  'relocation.untouched': 'Your data is still where it was, unchanged',
  'relocation.error.locked':
    'Some program had a data file open (an antivirus, Windows Explorer or a server opened outside QubiQ). Close it and try again from the settings.',
  'relocation.error.mismatch':
    'The copy did not match the original (files were missing or had a different size), so nothing has been deleted. Check that the target drive works properly and try again.',
  'relocation.error.links':
    'The data contains a link to another folder ({path}) and it cannot be copied across drives. Remove it or choose a folder on the same drive.',
  'relocation.error.missing': 'The source folder was not found, or the target folder stopped being available.',
  'relocation.error.other': 'Unexpected error: {detail}',
  'relocation.continue': 'Continue'
}
