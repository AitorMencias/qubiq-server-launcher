import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'キャンセル',
  'common.quoted': '「{text}」',

  'main.quit.title': 'サーバーが起動中です',
  'main.quit.message': '実行中のサーバーがあります。',
  'main.quit.detail': 'ワールドを壊さないよう正しく停止します。ゲームの保存に数秒かかることがあります。',
  'main.quit.confirm': 'サーバーを停止して終了',
  'main.quit.cancel': 'キャンセル',
  'main.missing.title': 'データフォルダーが見つかりません',
  'main.missing.message': 'QubiQ のデータフォルダーが見つかりません：{path}',
  'main.missing.detail':
    '今は接続されていないドライブにあるのかもしれません。接続して「再試行」を押してください。既定のフォルダー（{defaultPath}）を選ぶと、サーバーなしでアプリが起動します。もう一方のフォルダーの中身には手を付けません。',
  'main.missing.retry': '再試行',
  'main.missing.useDefault': '既定のフォルダーを使う',
  'main.missing.quit': '終了',

  'app.noServersYet': 'まだサーバーがありません。',
  'app.createServer': '+ サーバーを作成',
  'app.mode': 'モード',
  'app.modeHint.basic': '遊ぶのに必要なことだけ。技術的なことはこちらで決めます。',
  'app.modeHint.advanced': '同じ画面で、すべての設定を開放します。',
  'app.settings': 'アプリの設定',
  'app.loadError': 'サーバーを読み込めませんでした',
  'app.create.title': '新しいサーバーを作成',
  'app.create.titleGame': '{game} の新しいサーバーを作成',
  'app.create.modeBasic': 'ベーシックモード',
  'app.create.modeAdvanced': 'アドバンスモード',
  'app.create.changeMode': 'モードを変更',
  'app.empty.title': 'まだサーバーがありません',
  'app.empty.text': '最初のサーバーを作れば、数分で遊び始められます。',
  'app.empty.button': '最初のサーバーを作成',

  'mode.basic': 'ベーシック',
  'mode.advanced': 'アドバンス',
  'mode.basic.tagline': '一歩ずつご案内します',
  'mode.basic.point1': '1 画面に 1 つの質問：名前、人数、ゲームに必要なこと、接続方法',
  'mode.basic.point2': '技術的なことはお任せ：バージョン、メモリ、ポート',
  'mode.basic.point3': 'あとはオン・オフのボタンひとつと、プレイヤー一覧とコンソールだけ',
  'mode.basic.cta': 'ベーシックモードで作成 →',
  'mode.advanced.tagline': 'すべて自分で決める',
  'mode.advanced.point1': 'バージョン、メモリ、ポートを細かく選べます',
  'mode.advanced.point2': '同じ画面で、すべての設定と技術情報を表示',
  'mode.advanced.point3': '間隔と保持数を決められるバックアップ、シード、ゲームのすべての設定',
  'mode.advanced.cta': 'アドバンスモードで作成 →',
  'mode.chooser.title': 'どのように作成しますか？',
  'mode.chooser.text':
    'モードは左のサイドバーやアプリの設定からいつでも切り替えられます。サーバーには影響せず、質問の多さが変わるだけです。',
  'mode.recommended': 'おすすめ',
  'mode.current': '現在のモード',

  'settings.title': 'アプリの設定',
  'settings.back': '戻る',
  'settings.language.title': '言語',
  'settings.language.hint':
    'インターフェース全体の言語です。ゲーム名と技術用語（RCON、BepInEx…）は翻訳しません。一部のエラーやインストールのメッセージはまだスペイン語で表示されます。',
  'settings.language.auto': '自動：Windows と同じ（{name}）',
  'settings.mode.title': 'モード',
  'settings.mode.hint':
    'アプリがどれだけ質問し、どれだけ設定を表示するかです。サーバーは何も変わりません。いつでも切り替えられます。',
  'settings.mode.basicSub':
    '遊ぶのに必要なことだけ。バージョン、メモリ、ポートはアプリが選び、サーバー作成を一歩ずつ案内します。',
  'settings.mode.advancedSub':
    'すべてを表示：バージョン、メモリ、ポート、間隔と保持数を決められるバックアップ、各ゲームのすべての設定。',
  'settings.dataFolder.title': 'データフォルダー',
  'settings.dataFolder.hint':
    'アプリはここにサーバー、そのバックアップ、Java、SteamCMD、ダウンロードを保存します。このドライブの空きが少ない場合は、別のドライブへ移動できます。',
  'settings.dataFolder.current': '現在の場所',
  'settings.dataFolder.isDefault': '既定のフォルダーです。',
  'settings.dataFolder.notDefault': '既定のフォルダーは {path} です。',
  'settings.dataFolder.open': 'フォルダーを開く',
  'settings.dataFolder.change': '場所を変更…',
  'settings.dataFolder.backToDefault': '既定のフォルダーに戻す',
  'settings.dataFolder.pickTitle': 'QubiQ のデータを保存する場所を選んでください',
  'settings.dataFolder.checking': 'フォルダーを確認し、データのサイズを測っています…',
  'settings.dataFolder.checkFailed': 'そのフォルダーを確認できませんでした',
  'settings.dataFolder.target': 'データの移動先',
  'settings.dataFolder.subfolder':
    '選んだフォルダーにはすでに中身があるため、混ざらないよう QubiQ フォルダーを作成します。',
  'settings.dataFolder.sameDrive': '同じドライブです。コピーせずに一瞬で移動します。',
  'settings.dataFolder.otherDrive': '別のドライブです。{size} をコピーする必要があります。',
  'settings.dataFolder.problemTitle': 'そこへは移動できません',
  'settings.dataFolder.problem.same': 'データはすでにそのフォルダーにあります。',
  'settings.dataFolder.problem.nested':
    '新しいフォルダーを現在のフォルダーの中に置くことも、その逆もできません。',
  'settings.dataFolder.problem.spaces':
    'パスに空白が含まれています。一部のサーバーインストーラー（Forge など）は空白があると失敗するため、使用できません。D:\\QubiQ のように空白のないフォルダーを選んでください。',
  'settings.dataFolder.problem.network':
    'ネットワークフォルダーです。サーバー稼働中にネットワークが切れるとデータが壊れるおそれがあり、SteamCMD もそこにはインストールできません。このパソコンのドライブ上のフォルダーを選んでください。',
  'settings.dataFolder.problem.occupied':
    'そのフォルダーにはすでに QubiQ のデータ（{entries}）があります。あなたのデータと混ぜることはしません。別のフォルダーを選ぶか、そのフォルダーを空にしてください。',
  'settings.dataFolder.problem.notWritable':
    'Windows がそこでのフォルダー作成を許可していません。ユーザーフォルダーの中や別のドライブなど、ほかの場所を選んでください。',
  'settings.dataFolder.problem.space':
    '空き容量が足りません：{needed} が必要です（データ＋1 GB の余裕）が、そのドライブの空きは {free} です。',
  'settings.dataFolder.problem.busy': {
    other: '先にこれらのサーバーを停止してください：{servers}。起動中やインストール中はファイルが開いたままです。'
  },
  'settings.dataFolder.problem.valheimPath': {
    other:
      'Valheim サーバー {servers} には MOD が入っており、その場所ではパスが {length} 文字になります（Windows の上限は {max} 文字）。BepInEx が起動せず、サーバーは何も知らせずに MOD なしで動きます。もっと短いパスを選んでください。'
  },
  'settings.dataFolder.problem.links':
    'データの中に別のフォルダー（{path}）へのリンクがあります。ドライブをまたぐと、リンク先の中身まで一緒にコピーしてしまいます。リンクを削除するか、同じドライブのフォルダーを選んでください。',
  'settings.dataFolder.warning.firewallTitle': 'Windows ファイアウォールがもう一度確認します',
  'settings.dataFolder.warning.firewall':
    'ファイアウォールの許可はプログラムのパスごとに記録されており、サーバーのパスが変わります。移動後に各サーバーを初めて起動すると、Windows がネットワークの使用を許可するか尋ねます。許可しないと友だちが参加できません。',
  'settings.dataFolder.warning.copyTitle': 'しばらく時間がかかります',
  'settings.dataFolder.warning.copy':
    '{size} をコピーします。SSD なら約 {minutes} 分、HDD ならかなり長くかかります。その間アプリは使えません。途中で失敗してもデータは元の場所に残ります。元のフォルダーは、コピーが完了して検証されてから削除されます。',
  'settings.dataFolder.warning.cloudTitle': 'クラウドと同期されるフォルダーです',
  'settings.dataFolder.warning.cloud':
    'OneDrive などのサービスは変更をすべてアップロードし、その間ファイルをロックします。サーバーを置くと数 GB のアップロードと書きかけのセーブが発生します。同期されないフォルダーのほうが安全です。',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim で MOD が使えなくなります',
  'settings.dataFolder.warning.valheimPath': {
    other:
      'そのフォルダーでは、Valheim サーバー {servers} のパスが {length} 文字になります（Windows の上限は {max} 文字）。今は MOD がないのでこれまでどおり動きますが、MOD を入れることはできなくなります。'
  },
  'settings.dataFolder.howTitle': '移動の流れ',
  'settings.dataFolder.howText':
    '{button} を押すとアプリが終了して自動で再起動し、何かを起動する前にデータを移動します。進行状況が表示され、完了後は新しいフォルダーで今までどおりに使えます。',
  'settings.dataFolder.apply': '移動して再起動',
  'settings.dataFolder.applying': '再起動中…',

  'settings.about.title': 'このアプリについて',
  'settings.about.version': 'バージョン {version}',
  'settings.about.free':
    'このプログラムはフリーソフトウェアです。GNU 一般公衆利用許諾書のバージョン 3、または（任意で）それ以降のバージョンの条件に従って、再配布や改変ができます。有用であることを願って配布されていますが、商品性や特定目的への適合性の黙示的な保証も含め、一切の保証はありません。',
  'settings.about.unofficial': '非公式ツールです。管理するゲームの開発元とは関係がなく、承認も受けていません。',
  'settings.about.source': 'ソースコード',
  'settings.about.license': 'ライセンス',
  'settings.about.notices': 'サードパーティの通知',
  'settings.about.plugins': 'このアプリは次の独自プラグインをインストールします。それぞれソースコードとライセンスがあります：',
  'settings.about.missingFile':
    'アプリと同じ場所に {file} が見つかりません。インストール版なら再インストールしてください。開発中なら「npm run build」で生成されます。',

  'relocation.movingTitle': 'QubiQ のデータを移動しています',
  'relocation.movingHint':
    'アプリを閉じたりパソコンの電源を切ったりしないでください。中断されてもデータは失われず、次に開いたときに再開します。',
  'relocation.from': '移動元',
  'relocation.to': '移動先',
  'relocation.phase.measuring': '移動する内容を計測しています…',
  'relocation.phase.moving': '移動しています…',
  'relocation.phase.copying': 'コピー中：{copied} / {total}',
  'relocation.phase.verifying': 'コピーが同一か確認しています…',
  'relocation.phase.cleaning': 'コピーを確認しました。元のフォルダーを削除しています…',
  'relocation.doneTitle': 'データを移動しました',
  'relocation.firewallTitle': 'もうひとつ',
  'relocation.firewall':
    '各サーバーを初めて起動すると、Windows がネットワークの使用を許可するか尋ねることがあります。許可しないと友だちが参加できません。',
  'relocation.leftoversTitle': '以前のフォルダーに残りがあります',
  'relocation.leftovers':
    'データは新しいフォルダーにすべて揃っていますが、{path} の一部のフォルダー（instances、runtimes、tools、cache）を削除できませんでした。手動で削除してかまいません。ただしフォルダー全体は削除しないでください。現在のデータの場所が記録されています。',
  'relocation.failedTitle': 'データを移動できませんでした',
  'relocation.untouched': 'データは元の場所にそのまま残っています',
  'relocation.error.locked':
    'どこかのプログラム（ウイルス対策ソフト、Windows エクスプローラー、QubiQ 以外から起動したサーバーなど）がデータのファイルを開いていました。それを閉じてから、設定でもう一度お試しください。',
  'relocation.error.mismatch':
    'コピーが元と一致しなかったため（ファイルが足りない、またはサイズが違う）、何も削除していません。移動先のドライブが正常か確認して、もう一度お試しください。',
  'relocation.error.links':
    'データの中に別のフォルダー（{path}）へのリンクがあり、ドライブをまたいでコピーできません。リンクを削除するか、同じドライブのフォルダーを選んでください。',
  'relocation.error.missing': '移動元のフォルダーが見つからないか、移動先のフォルダーが使えなくなりました。',
  'relocation.error.other': '予期しないエラー：{detail}',
  'relocation.continue': '続ける'
}
