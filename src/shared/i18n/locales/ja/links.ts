import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': '自身を削除',

  'link.add.button': '別の QubiQ に接続',
  'link.add.title': '別の QubiQ に接続',
  'link.add.intro':
    'QubiQ がある別のパソコンのサーバーを、スマホのリモートページと同じ範囲でここから操作できます：起動、停止、再起動、コンソール・プレイヤー・履歴の表示。設定やファイルには触れません。',
  'link.add.before':
    '別のパソコンで「アプリの設定 → リモートアクセス」を開き、有効にして、ここから操作したいサーバーにチェックを入れ、コードを生成してください。',
  'link.add.address': '別のパソコンのアドレス',
  'link.add.addressHelp':
    '向こうの「接続先アドレス」に表示されているもの（例：192.168.1.20:8443）。その家の外からなら、ポートを開けたグローバル IP か Tailscale のアドレスです。',
  'link.add.search': '検索',
  'link.add.searching': '検索中…',
  'link.add.found': '{address} に QubiQ があります。',
  'link.add.fingerprintTitle': 'フィンガープリントを確認',
  'link.add.fingerprintHelp':
    '別のパソコンが「アプリの設定 → リモートアクセス」に表示している「証明書のフィンガープリント」です。全体を比べてください。一致しない場合は誰かが間に入っている可能性があるので、続けないでください。',
  'link.add.fingerprintMatch': '一致した：そのパソコンです',
  'link.add.code': 'ペアリングコード',
  'link.add.name': '向こうでのこのパソコンの名前',
  'link.add.nameHelp': '向こうのデバイス一覧にこの名前で表示されます。',
  'link.add.defaultName': '{pc} の QubiQ',
  'link.add.submit': 'ペアリング',
  'link.add.working': 'ペアリング中…',
  'link.add.back': 'アドレスを変更',
  'link.add.noSecureStorage':
    'Windows がこのパソコンの鍵を暗号化できないため、ペアリングできません：鍵がそのまま保存されてしまいます。',

  'link.group': '{host} 上',
  'link.state.connecting': '接続中…',
  'link.state.online': '接続済み',
  'link.state.offline': '接続なし',
  'link.state.revoked': 'アクセス権なし',
  'link.state.cert-changed': 'フィンガープリントが変わりました',
  'link.state.key-lost': '鍵が使えません',
  'link.statusUnknown': '状態不明',
  'link.noServers': 'サーバーなし：向こうのリモートアクセスでチェックを入れてください。',
  'link.retry': '再試行',
  'link.lastContact': '最後の応答：{date}',
  'link.offline.text':
    '{host} に接続できません。サーバーは動き続けている可能性があります：表示は最後に分かった状態です。',
  'link.revoked.text':
    '{host} はこのパソコンをもう認識していません：一覧から削除されました。接続を削除し、新しいコードでペアリングし直してください。',
  'link.keyLost.text':
    'この接続の鍵は、このパソコンまたはこの Windows ユーザーでは使えません（別の PC からデータをコピーしましたか？）。接続を削除してペアリングし直してください。',
  'link.certChanged.text':
    '{host} はペアリング時に確認したものと異なる証明書を示しています。向こうで更新・再作成された場合にも起きますが、誰かが間に入った場合にも起きます。確認するまで何も送りません。',
  'link.certChanged.old': '固定したフィンガープリント',
  'link.certChanged.new': '現在のフィンガープリント',
  'link.certChanged.check': '別のパソコンが「アプリの設定 → リモートアクセス」に表示しているものと比べてください。',
  'link.certChanged.load': '新しいフィンガープリントを見る',
  'link.certChanged.trust': '一致した：新しいものを信頼',

  'link.panel.details': '接続',
  'link.panel.address': 'アドレス',
  'link.panel.device': '向こうでのこのパソコン',
  'link.panel.fingerprint': '固定したフィンガープリント',
  'link.panel.paired': 'ペアリング日時',
  'link.panel.permissions': 'このパソコンができること',
  'link.panel.permissionsHelp': '向こうのパソコンの所有者がリモートアクセスで決めます。',
  'link.panel.controlYes': '起動・停止・再起動：可',
  'link.panel.controlNo': '起動・停止・再起動：不可（見るだけ）',
  'link.panel.console': 'コンソール：{level}',
  'link.panel.servers': 'サーバー',
  'link.remove.title': '接続を削除',
  'link.remove.hint':
    'このパソコンの鍵を削除し、向こうにも忘れるよう依頼します。再接続には新しいコードが必要です。',
  'link.remove.button': '接続を削除',
  'link.remove.confirm': '{host} との接続を削除しますか？',
  'link.remove.working': '削除中…',
  'link.remove.done': '{host} との接続を削除しました。',
  'link.remove.notNotified':
    '{host} との接続をここでは削除しましたが、応答がありませんでした：向こうのデバイス一覧に「{device}」が残っています。向こうのリモートアクセスで削除してください。',

  'link.server.on': '{host} 上',
  'link.server.noControl':
    'このパソコンは見るだけです：{host} の所有者が起動・停止を許可していません。',
  'link.server.gone':
    'このサーバーは {host} の一覧にもうありません：削除されたか、このパソコンの権限が外されました。',

  'link.error.offline':
    'そのパソコンに接続できません。アドレス、向こうでリモートアクセスが有効か、家の外からならポートが開いているかを確認してください。',
  'link.error.cert-changed': '別のパソコンの証明書が、確認したものと違います。',
  'link.error.key-lost': 'この接続の鍵はこのパソコンでは使えません。',
  'link.error.bad-address':
    'そのアドレスは無効です。パソコンの IP か名前と、8443 以外ならポートを入力してください。',
  'link.error.not-qubiq': 'そのアドレスで応答しているのは QubiQ のリモートアクセスではありません。',
  'link.error.no-secure-storage': 'Windows がこのパソコンの鍵を暗号化できません。',
  'link.error.unknown-link': 'その接続はもうありません。'
}
