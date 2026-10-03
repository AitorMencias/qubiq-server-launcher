import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'Game servers, hassle-free',
  'games.subtitleOne': '{game} servers, hassle-free',
  'games.disclaimerAll':
    'QubiQ is not an official product of any of the games it manages, nor is it affiliated with their studios.',
  'games.agreement.minecraft': 'the Minecraft EULA',
  'games.agreement.steam': 'the Steam Subscriber Agreement',
  'games.tunnelExampleHost': 'something',
  'games.upTo': 'Up to {n}',
  'games.upToComfortably': 'Up to {n} comfortably',
  'games.alwaysPublic': 'Always shows up in the public list',

  'games.port.game': 'Game',
  'games.port.messaging': 'Game messaging',
  'games.port.playerData': 'Player data',
  'games.port.steamQuery': 'Steam query',
  'games.port.rustPlus': 'Rust+ (mobile app)',
  'games.port.tcpUdp': 'TCP and UDP',
  'games.port.udpTcp': 'UDP and TCP',
  'games.summary.custom': 'custom',
  'games.summary.rustMap': 'map: {size}',

  'games.minecraft.tagline': 'Build and survive. The classic, with plugins or mods.',
  'games.minecraft.players': 'Up to ~20',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'Plugins and mods',
  'games.minecraft.startup': 'depends on the mods: from seconds to a couple of minutes',
  'games.minecraft.ports': 'one TCP (25565)',
  'games.minecraft.extra': 'Java: the app downloads it for you',
  'games.minecraft.joinHint': 'In Minecraft: Multiplayer → Add Server.',
  'games.minecraft.backupScope':
    'The world and the configuration are saved. The jars aren’t needed: they can be downloaded again.',

  'games.satisfactory.tagline': 'Huge factories built as a team.',
  'games.satisfactory.players': 'Up to 4 (expandable)',
  'games.satisfactory.download': '15.5 GB',
  'games.satisfactory.highlight1': 'Configured without opening the game',
  'games.satisfactory.highlight2': 'Only one at a time',
  'games.satisfactory.startup': 'about 6 seconds',
  'games.satisfactory.ports': '7777 over TCP and UDP, and 8888 over TCP',
  'games.satisfactory.disclaimer':
    'Unofficial tool. Not affiliated with Coffee Stain Studios or Satisfactory.',
  'games.satisfactory.joinHint': 'In Satisfactory: Server Manager → Add Server, with this address.',
  'games.satisfactory.join1': 'Open Satisfactory and go to “Server Manager” from the main menu.',
  'games.satisfactory.join2': 'Click “Add Server” and paste the address there.',
  'games.satisfactory.join3':
    'It will ask for the administrator password (the one you set when creating the server) so you can manage it.',
  'games.satisfactory.join4':
    'The server stays in your list: click “Join” and, if you set a password to join, type it in.',
  'games.satisfactory.joinWarning':
    'Connecting directly by IP doesn’t work: the game requires a permission you only get by adding the server this way. If you try to force it, Satisfactory replies “Encryption token missing”.',
  'games.satisfactory.backupScope':
    'The saves and the server settings are backed up. The game isn’t needed: it is downloaded again from Steam.',
  'games.satisfactory.moderationHint':
    'This game doesn’t allow kicking or banning from outside. Join the game with your administrator password and do it from the in-game menu. If you need to cut things off completely, stop the server or set a join password from Settings.',

  'games.valheim.tagline': 'Survive, build and slay bosses in a Viking world.',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'Playable from outside without opening ports',
  'games.valheim.highlight2': 'The lightest of them all',
  'games.valheim.highlight3': 'No live moderation',
  'games.valheim.startup': '35 s with a new world, 12 s afterwards',
  'games.valheim.ports': 'two UDP (2456 and 2457), or none with crossplay',
  'games.valheim.disclaimer': 'Unofficial tool. Not affiliated with Iron Gate or Valheim.',
  'games.valheim.joinHint': 'In Valheim: Join Game → Add server, with this address.',
  'games.valheim.join1': 'Open Valheim, pick your character and go to “Join Game”.',
  'games.valheim.join2': 'Click “Add server” and paste the address there, including the port.',
  'games.valheim.join3': 'Type the server password when asked.',
  'games.valheim.join4': 'The server stays in your favorites: next time just click “Connect”.',
  'games.valheim.crossplay2': 'Click “Join by code” and type the 6-digit code the app gives you.',
  'games.valheim.crossplay4':
    'The code changes every time the server starts: you’ll have to share it again.',
  'games.valheim.backupScope':
    'The worlds and the moderation lists are backed up. The game isn’t needed: it is downloaded again from Steam.',
  'games.valheim.moderationHint':
    'In Valheim you moderate by Steam ID, not by name: the game doesn’t say what anyone’s character is called. Banning someone kicks them immediately, and the full lists (admins, banned and permitted) are in Configuration → Moderation.',

  'games.factorio.tagline': 'Build a huge factory together, and defend it.',
  'games.factorio.highlight1': 'Starts in a second',
  'games.factorio.highlight2': 'With mods and Space Age',
  'games.factorio.highlight3': 'You need to own the game',
  'games.factorio.startup': 'one second',
  'games.factorio.ports': 'one UDP (34197)',
  'games.factorio.extra': 'owning Factorio on your Steam account',
  'games.factorio.disclaimer': 'Unofficial tool. Not affiliated with Wube Software or Factorio.',
  'games.factorio.joinHint': 'In Factorio: Multiplayer → Connect to address.',
  'games.factorio.join1': 'Open Factorio and go to “Multiplayer” from the main menu.',
  'games.factorio.join2': 'Click “Connect to address” and paste the address there, including the port.',
  'games.factorio.join3': 'Type the server password when asked.',
  'games.factorio.join4': 'You all need the same game version and the same mods as the server.',
  'games.factorio.joinWarning':
    'If you skip the password, Factorio drops the connection without saying why (the server logs it as “PasswordMissing”). And if your game isn’t on the same version as the server, it won’t let you in: check the version on the server details.',
  'games.factorio.backupScope':
    'The saves, the mods and the moderation lists are backed up. The game isn’t needed: it is downloaded again from Steam.',
  'games.factorio.moderationHint':
    'In Factorio you moderate by Factorio account name, which is the one shown in chat. Banning someone kicks them immediately.',

  'games.zomboid.tagline': 'Survive the zombie outbreak for as long as you can.',
  'games.zomboid.download': '6.7 GB',
  'games.zomboid.highlight1': 'Moderated and commanded like Minecraft',
  'games.zomboid.highlight2': 'Hundreds of game rules',
  'games.zomboid.highlight3': 'Takes over a minute to start',
  'games.zomboid.startup': 'about 40 seconds (a minute and a half the first time)',
  'games.zomboid.ports': 'one UDP (16261), two with Steam enabled',
  'games.zomboid.disclaimer':
    'Unofficial tool. Not affiliated with The Indie Stone or Project Zomboid.',
  'games.zomboid.joinHint': 'In Project Zomboid: Join → Favorites → Add server, with this address.',
  'games.zomboid.join1': 'Open Project Zomboid and go to “Join” from the main menu.',
  'games.zomboid.join2': 'Go to the “Favorites” tab and click “Add server” with this address and its port.',
  'games.zomboid.join3':
    'Type any username and password you like: the first time, the account is created automatically.',
  'games.zomboid.join4':
    'If the server has a password, it goes in the “Server password” field, which is different from your account’s.',
  'games.zomboid.joinWarning':
    'Your username and password belong to this server, not to Steam: you make them up the first time and use them to get back to the same character. If you mistype them, the server says the password is invalid instead of creating another account.',
  'games.zomboid.backupScope':
    'The save, the settings and the account database (who is an admin and who is banned) are backed up. The game isn’t needed: it is downloaded again from Steam.',
  'games.zomboid.moderationHint':
    'In Zomboid you moderate by server account name, not by Steam. Commands go through the remote console, so the server has to be running: while it’s stopped you can see who is who, but you can’t change anything.',

  'games.enshrouded.tagline': 'Survive, build and explore a world swallowed by fog.',
  'games.enshrouded.download': '8.8 GB',
  'games.enshrouded.highlight1': 'Starts in 3 seconds',
  'games.enshrouded.highlight2': 'Permissions by password',
  'games.enshrouded.startup': 'between 2 and 4 seconds',
  'games.enshrouded.ports': 'one UDP (15637)',
  'games.enshrouded.extra': 'always shows up in the game’s public list',
  'games.enshrouded.disclaimer': 'Unofficial tool. Not affiliated with Keen Games or Enshrouded.',
  'games.enshrouded.joinHint': 'In Enshrouded: Play → Servers → Add server, with this address.',
  'games.enshrouded.join1': 'Open Enshrouded and go to “Servers” from the play menu.',
  'games.enshrouded.join2': 'Click “Add server” and paste the address there, including the port.',
  'games.enshrouded.join3':
    'Type the password for the role you were given: the password decides what you can do inside.',
  'games.enshrouded.join4':
    'The server stays in your favorites, where it shows up even if the public list takes a while to refresh.',
  'games.enshrouded.joinWarning':
    'Enshrouded doesn’t have one server password but one per role. With the Admin one you can kick and ban; with the Guest one you can’t even open chests. If you’re given the wrong one, you’ll still get in, but with different permissions.',
  'games.enshrouded.backupScope':
    'The worlds and the configuration, with the roles and bans, are backed up. The game isn’t needed: it is downloaded again from Steam. While the server is running, the backup is taken right after one of its saves, which happen every five minutes.',
  'games.enshrouded.moderationHint':
    'Enshrouded doesn’t let you kick anyone from outside the game: its own server says kicking on a dedicated server is “not implemented”. What you can do is lift a ban from here, and ban from inside the game with the Admin password (Social tab).',

  'games.rust.tagline': 'Survive, build a base and defend it. A new map every month.',
  'games.rust.players': 'Up to {n} on a home PC',
  'games.rust.download': '5.5 GB',
  'games.rust.highlight1': 'Live moderation',
  'games.rust.highlight2': 'Plugins with Oxide',
  'games.rust.highlight3': 'New map every month',
  'games.rust.startup': '2 to 5 minutes the first time (it generates the map), about 13 s afterwards',
  'games.rust.ports': 'two UDP (28015 and 28017), plus one TCP with Rust+',
  'games.rust.extra': 'always shows up in the public list; new map every month',
  'games.rust.disclaimer': 'Unofficial tool. Not affiliated with Facepunch Studios or Rust.',
  'games.rust.joinHint': 'In Rust: press F1 and type “client.connect” followed by this address.',
  'games.rust.join1': 'Open Rust and wait until you are in the main menu.',
  'games.rust.join2': 'Press F1 to open the game console.',
  'games.rust.join3':
    'Type “client.connect” and the address with its port, for example: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Press Enter. Afterwards it shows up under “History” in the server list, for next time.',
  'games.rust.joinWarning':
    'If the month has just changed and the server hasn’t been updated, Rust won’t let you in: it says the version doesn’t match. It happens on the first Thursday of every month; see Configuration → Wipe.',
  'games.rust.backupScope':
    'The map with everything built, the players, admins and bans, and the plugins with their configuration are backed up. The game isn’t needed: it is downloaded again from Steam.',
  'games.rust.moderationHint':
    'In Rust you moderate by Steam ID, even though the list shows the name. Kicks and bans take effect immediately; admins and bans are in Configuration → Moderation.'
}
