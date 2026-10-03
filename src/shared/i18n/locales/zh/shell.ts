import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': '取消',
  'common.quoted': '“{text}”',

  'main.quit.title': '有服务器正在运行',
  'main.quit.message': '你有正在运行的服务器。',
  'main.quit.detail': '它们会被正常关闭，以免损坏世界。保存游戏进度可能需要几秒钟。',
  'main.quit.confirm': '关闭服务器并退出',
  'main.quit.cancel': '取消',
  'main.missing.title': '找不到数据文件夹',
  'main.missing.message': '找不到 QubiQ 的数据文件夹：{path}',
  'main.missing.detail':
    '它可能在当前未连接的磁盘上。请连接后点击“重试”。如果选择默认文件夹（{defaultPath}），应用将在没有你的服务器的情况下启动；另一个文件夹中的内容不会被改动。',
  'main.missing.retry': '重试',
  'main.missing.useDefault': '使用默认文件夹',
  'main.missing.quit': '退出',

  'app.noServersYet': '你还没有任何服务器。',
  'app.createServer': '+ 创建服务器',
  'app.mode': '模式',
  'app.modeHint.basic': '只保留玩游戏所需的内容，技术细节由我们替你选择。',
  'app.modeHint.advanced': '同样的界面，所有设置全部解锁。',
  'app.settings': '应用设置',
  'app.loadError': '无法加载服务器',
  'app.create.title': '创建新服务器',
  'app.create.titleGame': '创建新的 {game} 服务器',
  'app.create.modeBasic': '基础模式',
  'app.create.modeAdvanced': '高级模式',
  'app.create.changeMode': '切换模式',
  'app.empty.title': '你还没有服务器',
  'app.empty.text': '创建第一个，几分钟后就能开玩。',
  'app.empty.button': '创建我的第一个服务器',

  'mode.basic': '基础',
  'mode.advanced': '高级',
  'mode.basic.tagline': '我们一步步引导你',
  'mode.basic.point1': '每屏一个问题：名称、有几个人、游戏需要的设置，以及你们如何连接',
  'mode.basic.point2': '技术部分交给我们：版本、内存和端口',
  'mode.basic.point3': '之后只需一个按钮开关服务器，还有玩家列表和控制台',
  'mode.basic.cta': '以基础模式创建 →',
  'mode.advanced.tagline': '一切由你决定',
  'mode.advanced.point1': '自选具体版本、内存和端口',
  'mode.advanced.point2': '同样的界面，解锁全部配置并显示技术信息',
  'mode.advanced.point3': '可设置间隔和保留数量的备份、种子以及所有游戏设置',
  'mode.advanced.cta': '以高级模式创建 →',
  'mode.chooser.title': '你想怎样创建？',
  'mode.chooser.text':
    '你随时可以在左侧栏或应用设置中切换模式。这不会影响服务器，只影响我们问你多少问题。',
  'mode.recommended': '推荐',
  'mode.current': '你当前的模式',

  'settings.title': '应用设置',
  'settings.back': '返回',
  'settings.language.title': '语言',
  'settings.language.hint':
    '整个界面使用的语言。游戏名称和技术术语（RCON、BepInEx…）不翻译。部分错误和安装信息目前仍以西班牙语显示。',
  'settings.language.auto': '自动：与 Windows 相同（{name}）',
  'settings.mode.title': '模式',
  'settings.mode.hint': '应用问你多少问题、显示多少设置。不会改动你的服务器：随时可以来回切换。',
  'settings.mode.basicSub': '只保留玩游戏所需的内容。应用会替你选择版本、内存和端口，并在创建服务器时一步步引导你。',
  'settings.mode.advancedSub': '一切尽在眼前：具体版本、内存、端口、可设置间隔和保留数量的备份，以及每个游戏的所有设置。',
  'settings.dataFolder.title': '数据文件夹',
  'settings.dataFolder.hint':
    '应用在这里保存你的服务器及其备份、Java、SteamCMD 和下载的文件。如果这个磁盘空间不够，可以把它移到另一个磁盘。',
  'settings.dataFolder.current': '当前位置',
  'settings.dataFolder.isDefault': '这是默认文件夹。',
  'settings.dataFolder.notDefault': '默认文件夹是 {path}。',
  'settings.dataFolder.open': '打开文件夹',
  'settings.dataFolder.change': '移动到其他位置…',
  'settings.dataFolder.backToDefault': '移回默认文件夹',
  'settings.dataFolder.pickTitle': '选择 QubiQ 数据的保存位置',
  'settings.dataFolder.checking': '正在检查文件夹并计算你的数据大小…',
  'settings.dataFolder.checkFailed': '无法检查该文件夹',
  'settings.dataFolder.target': '数据将移到',
  'settings.dataFolder.subfolder': '你选择的文件夹里已有内容，因此会新建一个 QubiQ 文件夹，避免混在一起。',
  'settings.dataFolder.sameDrive': '位于同一磁盘：瞬间完成移动，无需复制。',
  'settings.dataFolder.otherDrive': '位于另一个磁盘：需要复制 {size}。',
  'settings.dataFolder.problemTitle': '无法移动到这里',
  'settings.dataFolder.problem.same': '数据已经在这个文件夹里了。',
  'settings.dataFolder.problem.nested': '新文件夹不能位于当前文件夹内，当前文件夹也不能位于新文件夹内。',
  'settings.dataFolder.problem.spaces':
    '路径中包含空格。一些服务器安装程序（例如 Forge 的）遇到空格会失败，因此不允许使用。请选择不含空格的文件夹，例如 D:\\QubiQ。',
  'settings.dataFolder.problem.network':
    '这是网络文件夹。如果服务器运行时网络中断，存档可能损坏，而且 SteamCMD 无法安装到这类文件夹。请选择本机磁盘上的文件夹。',
  'settings.dataFolder.problem.occupied':
    '该文件夹中已有 QubiQ 数据（{entries}）。不会与你的数据混合：请选择其他文件夹或清空该文件夹。',
  'settings.dataFolder.problem.notWritable': 'Windows 不允许在那里创建文件夹。请选择其他位置，例如你的用户文件夹或另一个磁盘。',
  'settings.dataFolder.problem.space': '空间不足：需要 {needed}（你的数据加 1 GB 余量），该磁盘只剩 {free}。',
  'settings.dataFolder.problem.busy': {
    other: '请先停止这些服务器：{servers}。它们在运行或安装时，文件处于打开状态。'
  },
  'settings.dataFolder.problem.valheimPath': {
    other:
      'Valheim 服务器 {servers} 装有模组，放在那里其路径将达到 {length} 个字符（Windows 最多允许 {max} 个）。BepInEx 将无法启动，服务器会在没有任何提示的情况下失去模组。请选择更短的路径。'
  },
  'settings.dataFolder.problem.links':
    '数据中有一个指向其他文件夹的链接（{path}）。跨磁盘复制时无法不连带复制另一端的内容。请删除它，或选择同一磁盘上的文件夹。',
  'settings.dataFolder.warning.firewallTitle': 'Windows 防火墙会再次询问',
  'settings.dataFolder.warning.firewall':
    '防火墙权限按每个程序的路径记录，而你的服务器路径会改变。移动后第一次启动每个服务器时，Windows 会询问是否允许其使用网络：请允许，否则你的朋友将无法加入。',
  'settings.dataFolder.warning.copyTitle': '需要一些时间',
  'settings.dataFolder.warning.copy':
    '需要复制 {size}。在 SSD 上大约 {minutes} 分钟；在机械硬盘上会久得多。期间无法使用应用。如果出错，数据会留在原处：只有复制完成并校验无误后才会删除原文件夹。',
  'settings.dataFolder.warning.cloudTitle': '这是一个与云端同步的文件夹',
  'settings.dataFolder.warning.cloud':
    'OneDrive 等服务会上传所有变动的内容，并在上传时锁定文件。放入服务器将意味着数 GB 的上传量和写到一半的存档。最好选择不同步的文件夹。',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim 将无法使用模组',
  'settings.dataFolder.warning.valheimPath': {
    other:
      '在该文件夹中，Valheim 服务器 {servers} 的路径将达到 {length} 个字符（Windows 最多允许 {max} 个）。它们目前没有模组，仍会照常运行，但以后将无法安装模组。'
  },
  'settings.dataFolder.howTitle': '如何进行',
  'settings.dataFolder.howText':
    '点击 {button} 后，应用会关闭并自动重新打开，在启动任何内容之前移动数据。你会看到进度；完成后一切照旧，只是位于新文件夹中。',
  'settings.dataFolder.apply': '移动并重启',
  'settings.dataFolder.applying': '正在重启…',

  'relocation.movingTitle': '正在移动 QubiQ 数据',
  'relocation.movingHint': '请不要关闭应用或关机。即使中断也不会丢失任何数据：下次打开时会继续。',
  'relocation.from': '从',
  'relocation.to': '到',
  'relocation.phase.measuring': '正在计算需要移动的内容…',
  'relocation.phase.moving': '正在移动…',
  'relocation.phase.copying': '正在复制：{copied} / {total}',
  'relocation.phase.verifying': '正在校验副本是否完全一致…',
  'relocation.phase.cleaning': '副本已校验。正在删除原文件夹…',
  'relocation.doneTitle': '数据已移动',
  'relocation.firewallTitle': '还有一件事',
  'relocation.firewall': '第一次启动每个服务器时，Windows 可能会询问是否允许其使用网络。请允许，否则你的朋友将无法加入。',
  'relocation.leftoversTitle': '旧文件夹中留有残余',
  'relocation.leftovers':
    '你的数据已完整位于新文件夹中，但 {path} 中的部分文件夹（instances、runtimes、tools 或 cache）无法删除。你可以手动删除这些文件夹；不要删除整个文件夹，它记录着你的数据现在的位置。',
  'relocation.failedTitle': '无法移动数据',
  'relocation.untouched': '你的数据仍在原处，没有任何改动',
  'relocation.error.locked':
    '有程序打开了数据中的某个文件（杀毒软件、Windows 资源管理器，或在 QubiQ 之外打开的服务器）。请关闭它，然后在设置中重试。',
  'relocation.error.mismatch':
    '副本与原件不一致（缺少文件或大小不同），因此没有删除任何内容。请检查目标磁盘是否正常，然后重试。',
  'relocation.error.links': '数据中有一个指向其他文件夹的链接（{path}），无法跨磁盘复制。请删除它，或选择同一磁盘上的文件夹。',
  'relocation.error.missing': '找不到源文件夹，或目标文件夹已不可用。',
  'relocation.error.other': '意外错误：{detail}',
  'relocation.continue': '继续'
}
