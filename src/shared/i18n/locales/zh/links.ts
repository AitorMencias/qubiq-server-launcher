import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': '移除自身',

  'link.add.button': '连接到另一个 QubiQ',
  'link.add.title': '连接到另一个 QubiQ',
  'link.add.intro':
    '在这里管理另一台装有 QubiQ 的电脑上的服务器，权限与手机远程页面相同：启动、停止、重启，查看控制台、玩家和历史记录。不涉及它的设置和文件。',
  'link.add.before':
    '在另一台电脑上打开“应用设置 → 远程访问”：启用它，勾选要在这里管理的服务器，然后生成一个代码。',
  'link.add.address': '另一台电脑的地址',
  'link.add.addressHelp':
    '即那边“连接地址”中显示的地址，例如 192.168.1.20:8443。在它所在的家以外，使用开放了端口的公网 IP，或它的 Tailscale 地址。',
  'link.add.search': '查找',
  'link.add.searching': '正在查找…',
  'link.add.found': '{address} 上有一个 QubiQ。',
  'link.add.fingerprintTitle': '核对指纹',
  'link.add.fingerprintHelp':
    '这是另一台电脑在“应用设置 → 远程访问”中显示的“证书指纹”。请完整比对：如果不一致，可能有人在中间拦截，请不要继续。',
  'link.add.fingerprintMatch': '一致：就是那台电脑',
  'link.add.code': '配对代码',
  'link.add.name': '这台电脑在那边的名称',
  'link.add.nameHelp': '它会以这个名称出现在对方的设备列表中。',
  'link.add.defaultName': '{pc} 的 QubiQ',
  'link.add.submit': '配对',
  'link.add.working': '正在配对…',
  'link.add.back': '更改地址',
  'link.add.noSecureStorage': 'Windows 无法加密这台电脑的密钥，因此不能配对：密钥会以明文保存。',

  'link.group': '在 {host}',
  'link.state.connecting': '正在连接…',
  'link.state.online': '已连接',
  'link.state.offline': '无连接',
  'link.state.revoked': '已无访问权限',
  'link.state.cert-changed': '指纹已改变',
  'link.state.key-lost': '密钥不可用',
  'link.statusUnknown': '状态未知',
  'link.noServers': '没有服务器：请在那边的远程访问中勾选。',
  'link.retry': '重试',
  'link.lastContact': '最后响应：{date}。',
  'link.offline.text': '无法联系 {host}。它的服务器可能仍在运行：你看到的是最后已知的状态。',
  'link.revoked.text': '{host} 已不再识别这台电脑：它已被从列表中移除。请移除连接，并用新代码重新配对。',
  'link.keyLost.text':
    '此连接的密钥无法在这台电脑或这个 Windows 用户下使用（数据是从其他电脑复制过来的吗？）。请移除连接并重新配对。',
  'link.certChanged.text':
    '{host} 显示的证书与配对时核对的不同。如果那边续期或重新生成了证书会出现这种情况，但有人在中间拦截时也会如此。在你确认之前，不会向它发送任何内容。',
  'link.certChanged.old': '已固定的指纹',
  'link.certChanged.new': '当前显示的指纹',
  'link.certChanged.check': '请与另一台电脑在“应用设置 → 远程访问”中显示的指纹比对。',
  'link.certChanged.load': '查看新指纹',
  'link.certChanged.trust': '一致：信任新指纹',

  'link.panel.details': '连接',
  'link.panel.address': '地址',
  'link.panel.device': '这台电脑在那边的名称',
  'link.panel.fingerprint': '已固定的指纹',
  'link.panel.paired': '配对时间',
  'link.panel.permissions': '这台电脑能做什么',
  'link.panel.permissionsHelp': '由另一台电脑的主人在其远程访问中决定。',
  'link.panel.controlYes': '启动、停止和重启：可以',
  'link.panel.controlNo': '启动、停止和重启：不可以，只能查看',
  'link.panel.console': '控制台：{level}',
  'link.panel.servers': '服务器',
  'link.remove.title': '移除连接',
  'link.remove.hint': '会删除这台电脑的密钥，并请求另一台电脑忘记它。重新连接需要新的代码。',
  'link.remove.button': '移除连接',
  'link.remove.confirm': '要移除与 {host} 的连接吗？',
  'link.remove.working': '正在移除…',
  'link.remove.done': '已移除与 {host} 的连接。',
  'link.remove.notNotified':
    '已在这里移除与 {host} 的连接，但它没有响应：“{device}”仍在它的设备列表中。请在它的远程访问中移除。',

  'link.server.on': '在 {host}',
  'link.server.noControl': '这台电脑只能查看：{host} 的主人没有允许它启动或停止。',
  'link.server.gone': '这个服务器已不在 {host} 的列表中：它已被删除，或这台电脑的权限已被取消。',

  'link.error.offline': '无法联系那台电脑。请检查地址、那边是否启用了远程访问，以及在它的家以外时端口是否已开放。',
  'link.error.cert-changed': '另一台电脑的证书与核对过的不一致。',
  'link.error.key-lost': '此连接的密钥无法在这台电脑上使用。',
  'link.error.bad-address': '这个地址无效。请输入电脑的 IP 或名称，如果端口不是 8443 也请写上。',
  'link.error.not-qubiq': '该地址上响应的不是 QubiQ 远程访问。',
  'link.error.no-secure-storage': 'Windows 无法加密这台电脑的密钥。',
  'link.error.unknown-link': '该连接已不存在。'
}
