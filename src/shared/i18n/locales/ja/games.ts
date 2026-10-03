import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'ゲームサーバーを、手軽に',
  'games.subtitleOne': '{game} のサーバーを、手軽に',
  'games.disclaimerAll':
    'QubiQ は管理対象のいずれのゲームの公式製品でもなく、各スタジオとも関係ありません。',
  'games.agreement.minecraft': 'Minecraft の EULA',
  'games.agreement.steam': 'Steam 利用規約',
  'games.tunnelExampleHost': 'something',
  'games.upTo': '最大 {n} 人',
  'games.upToComfortably': '{n} 人まで快適',
  'games.alwaysPublic': '常に公開リストに表示されます',

  'games.port.game': 'ゲーム',
  'games.port.messaging': 'ゲーム内メッセージ',
  'games.port.playerData': 'プレイヤーデータ',
  'games.port.steamQuery': 'Steam クエリ',
  'games.port.rustPlus': 'Rust+（スマホアプリ）',
  'games.port.tcpUdp': 'TCP と UDP',
  'games.port.udpTcp': 'UDP と TCP',
  'games.summary.custom': 'カスタム',
  'games.summary.rustMap': 'マップ：{size}',

  'games.minecraft.tagline': '建築とサバイバル。定番の一本を、プラグインや MOD と一緒に。',
  'games.minecraft.players': '最大 約 20 人',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'プラグインと MOD',
  'games.minecraft.startup': 'MOD 次第：数秒から数分',
  'games.minecraft.ports': 'TCP 1 つ（25565）',
  'games.minecraft.extra': 'Java：アプリが自動でダウンロード',
  'games.minecraft.joinHint': 'Minecraft で：マルチプレイ → サーバーを追加。',
  'games.minecraft.backupScope':
    'ワールドと設定を保存します。jar は不要です。再ダウンロードできます。',

  'games.satisfactory.tagline': 'みんなで巨大な工場を築こう。',
  'games.satisfactory.players': '最大 4 人（拡張可）',
  'games.satisfactory.download': '15.5 GB',
  'games.satisfactory.highlight1': 'ゲームを開かずに設定できる',
  'games.satisfactory.highlight2': '同時に 1 つだけ',
  'games.satisfactory.startup': '約 6 秒',
  'games.satisfactory.ports': '7777（TCP と UDP）と 8888（TCP）',
  'games.satisfactory.disclaimer':
    '非公式ツールです。Coffee Stain Studios および Satisfactory とは関係ありません。',
  'games.satisfactory.joinHint': 'Satisfactory で：サーバーマネージャー → サーバーを追加（このアドレスで）。',
  'games.satisfactory.join1': 'Satisfactory を開き、メインメニューから「サーバーマネージャー」に入ります。',
  'games.satisfactory.join2': '「サーバーを追加」を押して、アドレスを貼り付けます。',
  'games.satisfactory.join3':
    '管理するために、管理者パスワード（サーバー作成時に設定したもの）を求められます。',
  'games.satisfactory.join4':
    'サーバーはリストに残ります。「参加」を押し、参加用パスワードを設定していれば入力します。',
  'games.satisfactory.joinWarning':
    'IP での直接接続はできません。この方法でサーバーを追加したときにだけ得られる許可が必要です。無理に接続しようとすると「Encryption token missing」と表示されます。',
  'games.satisfactory.backupScope':
    'セーブとサーバー設定を保存します。ゲーム本体は不要です。Steam から再ダウンロードされます。',
  'games.satisfactory.moderationHint':
    'このゲームは外部からキックや BAN ができません。管理者パスワードでゲームに入り、ゲーム内メニューから行ってください。すぐに締め出したい場合は、サーバーを停止するか、「設定」で参加用パスワードを設定してください。',

  'games.valheim.tagline': 'ヴァイキングの世界で生き抜き、建築し、ボスを倒そう。',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'ポート開放なしで外から遊べる',
  'games.valheim.highlight2': 'いちばん軽い',
  'games.valheim.highlight3': '稼働中のモデレーション不可',
  'games.valheim.startup': '新しいワールドで 35 秒、以降は 12 秒',
  'games.valheim.ports': 'UDP 2 つ（2456 と 2457）、クロスプレイなら不要',
  'games.valheim.disclaimer': '非公式ツールです。Iron Gate および Valheim とは関係ありません。',
  'games.valheim.joinHint': 'Valheim で：ゲームに参加 → サーバーを追加（このアドレスで）。',
  'games.valheim.join1': 'Valheim を開き、キャラクターを選んで「ゲームに参加」に入ります。',
  'games.valheim.join2': '「サーバーを追加」を押して、ポート付きのアドレスを貼り付けます。',
  'games.valheim.join3': '求められたらサーバーのパスワードを入力します。',
  'games.valheim.join4': 'サーバーはお気に入りに残ります。次回は「接続」を押すだけです。',
  'games.valheim.crossplay2': '「コードで参加」を押し、アプリに表示される 6 桁のコードを入力します。',
  'games.valheim.crossplay4': 'コードはサーバーを起動するたびに変わるので、そのつど伝え直す必要があります。',
  'games.valheim.backupScope':
    'ワールドとモデレーションのリストを保存します。ゲーム本体は不要です。Steam から再ダウンロードされます。',
  'games.valheim.moderationHint':
    'Valheim では名前ではなく Steam ID でモデレーションします。ゲームは誰のキャラクター名も教えてくれません。BAN するとすぐにキックされ、全リスト（管理者、BAN、許可リスト）は「構成 → モデレーション」にあります。',

  'games.factorio.tagline': 'みんなで巨大な工場を作り、守り抜こう。',
  'games.factorio.highlight1': '1 秒で起動',
  'games.factorio.highlight2': 'MOD と Space Age に対応',
  'games.factorio.highlight3': 'ゲームの所有が必要',
  'games.factorio.startup': '1 秒',
  'games.factorio.ports': 'UDP 1 つ（34197）',
  'games.factorio.extra': 'Steam アカウントに Factorio があること',
  'games.factorio.disclaimer': '非公式ツールです。Wube Software および Factorio とは関係ありません。',
  'games.factorio.joinHint': 'Factorio で：マルチプレイ → アドレスに接続。',
  'games.factorio.join1': 'Factorio を開き、メインメニューから「マルチプレイ」に入ります。',
  'games.factorio.join2': '「アドレスに接続」を押して、ポート付きのアドレスを貼り付けます。',
  'games.factorio.join3': '求められたらサーバーのパスワードを入力します。',
  'games.factorio.join4': '全員がサーバーと同じゲームバージョン、同じ MOD である必要があります。',
  'games.factorio.joinWarning':
    'パスワードを入れないと、Factorio は理由を告げずに接続を切ります（サーバー側には「PasswordMissing」と記録されます）。また、ゲームのバージョンがサーバーと違うと入れません。バージョンはサーバー情報で確認してください。',
  'games.factorio.backupScope':
    'セーブ、MOD、モデレーションのリストを保存します。ゲーム本体は不要です。Steam から再ダウンロードされます。',
  'games.factorio.moderationHint':
    'Factorio では Factorio アカウント名（チャットに表示される名前）でモデレーションします。BAN するとすぐにキックされます。',

  'games.zomboid.tagline': 'ゾンビの蔓延をできるだけ長く生き延びよう。',
  'games.zomboid.download': '6.7 GB',
  'games.zomboid.highlight1': 'Minecraft と同じようにモデレーション・コマンド操作',
  'games.zomboid.highlight2': '数百のゲームルール',
  'games.zomboid.highlight3': '起動に 1 分以上かかる',
  'games.zomboid.startup': '約 40 秒（初回は 1 分半）',
  'games.zomboid.ports': 'UDP 1 つ（16261）、Steam 有効時は 2 つ',
  'games.zomboid.disclaimer':
    '非公式ツールです。The Indie Stone および Project Zomboid とは関係ありません。',
  'games.zomboid.joinHint': 'Project Zomboid で：参加 → お気に入り → サーバーを追加（このアドレスで）。',
  'games.zomboid.join1': 'Project Zomboid を開き、メインメニューから「参加」に入ります。',
  'games.zomboid.join2': '「お気に入り」タブで、このアドレスとポートで「サーバーを追加」を押します。',
  'games.zomboid.join3':
    '好きなユーザー名とパスワードを入力します。初回はアカウントが自動で作られます。',
  'games.zomboid.join4':
    'サーバーにパスワードがある場合は「サーバーパスワード」欄に入力します。アカウントのパスワードとは別です。',
  'games.zomboid.joinWarning':
    'ユーザー名とパスワードは Steam ではなくこのサーバーのものです。初回に自分で決め、それを使って同じキャラクターに戻ります。入力を間違えると、別のアカウントを作る代わりに「パスワードが無効」と表示されます。',
  'games.zomboid.backupScope':
    'セーブ、設定、アカウントのデータベース（誰が管理者で誰が BAN されているか）を保存します。ゲーム本体は不要です。Steam から再ダウンロードされます。',
  'games.zomboid.moderationHint':
    'Zomboid では Steam ではなくサーバーのアカウント名でモデレーションします。コマンドはリモートコンソール経由なので、サーバーが起動している必要があります。停止中は誰が誰かは見えますが、変更はできません。',

  'games.enshrouded.tagline': '霧に呑まれた世界で生き抜き、建築し、探索しよう。',
  'games.enshrouded.download': '8.8 GB',
  'games.enshrouded.highlight1': '3 秒で起動',
  'games.enshrouded.highlight2': 'パスワードで権限を分ける',
  'games.enshrouded.startup': '2〜4 秒',
  'games.enshrouded.ports': 'UDP 1 つ（15637）',
  'games.enshrouded.extra': '常にゲームの公開リストに表示されます',
  'games.enshrouded.disclaimer': '非公式ツールです。Keen Games および Enshrouded とは関係ありません。',
  'games.enshrouded.joinHint': 'Enshrouded で：プレイ → サーバー → サーバーを追加（このアドレスで）。',
  'games.enshrouded.join1': 'Enshrouded を開き、プレイメニューから「サーバー」に入ります。',
  'games.enshrouded.join2': '「サーバーを追加」を押して、ポート付きのアドレスを貼り付けます。',
  'games.enshrouded.join3':
    '渡されたロールのパスワードを入力します。パスワードによって中でできることが決まります。',
  'games.enshrouded.join4':
    'サーバーはお気に入りに残ります。公開リストの更新が遅くても、そこには表示されます。',
  'games.enshrouded.joinWarning':
    'Enshrouded にはサーバー共通のパスワードはなく、ロールごとにパスワードがあります。管理者のパスワードならキックや BAN ができ、ゲストのパスワードではチェストも開けられません。違うパスワードを渡されても入れますが、権限が異なります。',
  'games.enshrouded.backupScope':
    'ワールドと設定（ロールと BAN を含む）を保存します。ゲーム本体は不要です。Steam から再ダウンロードされます。サーバー稼働中は、5 分ごとの自動保存の直後にバックアップを取ります。',
  'games.enshrouded.moderationHint':
    'Enshrouded はゲームの外から誰かをキックできません。サーバー自身が、専用サーバーでのキックは「未実装」だと返します。ここからできるのは BAN の解除で、BAN はゲーム内で管理者パスワードを使って行います（ソーシャルタブ）。',

  'games.rust.tagline': '生き抜き、拠点を築いて守り抜こう。毎月新しいマップ。',
  'games.rust.players': '家庭用 PC で最大 {n} 人',
  'games.rust.download': '5.5 GB',
  'games.rust.highlight1': '稼働中にモデレーションできる',
  'games.rust.highlight2': 'Oxide でプラグイン',
  'games.rust.highlight3': '毎月新しいマップ',
  'games.rust.startup': '初回は 2〜5 分（マップを生成）、以降は約 13 秒',
  'games.rust.ports': 'UDP 2 つ（28015 と 28017）、Rust+ を使うと TCP がもう 1 つ',
  'games.rust.extra': '常に公開リストに表示；毎月新しいマップ',
  'games.rust.disclaimer': '非公式ツールです。Facepunch Studios および Rust とは関係ありません。',
  'games.rust.joinHint': 'Rust で：F1 を押し、「client.connect」に続けてこのアドレスを入力。',
  'games.rust.join1': 'Rust を開き、メインメニューが表示されるまで待ちます。',
  'games.rust.join2': 'F1 を押してゲーム内コンソールを開きます。',
  'games.rust.join3':
    '「client.connect」とポート付きのアドレスを入力します。例：client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Enter を押します。以後はサーバーリストの「履歴」に表示され、次回から使えます。',
  'games.rust.joinWarning':
    '月が替わったばかりでサーバーが更新されていないと、Rust は「バージョンが一致しない」と言って入れてくれません。毎月第 1 木曜日に起こります。「構成 → ワイプ」を参照してください。',
  'games.rust.backupScope':
    '建築物を含むマップ、プレイヤー、管理者と BAN、プラグインとその設定を保存します。ゲーム本体は不要です。Steam から再ダウンロードされます。',
  'games.rust.moderationHint':
    'Rust ではリストに名前が表示されますが、モデレーションは Steam ID で行います。キックと BAN はすぐに反映され、管理者と BAN は「構成 → モデレーション」にあります。'
}
