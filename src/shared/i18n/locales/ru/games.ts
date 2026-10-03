import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'Игровые серверы без сложностей',
  'games.subtitleOne': 'Серверы {game} без сложностей',
  'games.disclaimerAll':
    'QubiQ не является официальным продуктом ни одной из игр, которыми управляет, и не связан с их студиями.',
  'games.agreement.minecraft': 'EULA Minecraft',
  'games.agreement.steam': 'Соглашение подписчика Steam',
  'games.tunnelExampleHost': 'что-то',
  'games.upTo': 'До {n}',
  'games.upToComfortably': 'До {n} с комфортом',
  'games.alwaysPublic': 'Всегда виден в публичном списке',

  'games.port.game': 'Игра',
  'games.port.messaging': 'Игровые сообщения',
  'games.port.playerData': 'Данные игроков',
  'games.port.steamQuery': 'Запросы Steam',
  'games.port.rustPlus': 'Rust+ (мобильное приложение)',
  'games.port.tcpUdp': 'TCP и UDP',
  'games.port.udpTcp': 'UDP и TCP',
  'games.summary.custom': 'свой',
  'games.summary.rustMap': 'карта: {size}',

  'games.minecraft.tagline': 'Строй и выживай. Классика — с плагинами или модами.',
  'games.minecraft.players': 'До ~20',
  'games.minecraft.download': '≈ 1 ГБ',
  'games.minecraft.highlight1': 'Плагины и моды',
  'games.minecraft.startup': 'зависит от модов: от секунд до пары минут',
  'games.minecraft.ports': 'один TCP (25565)',
  'games.minecraft.extra': 'Java: приложение скачает само',
  'games.minecraft.joinHint': 'В Minecraft: Сетевая игра → Добавить.',
  'games.minecraft.backupScope':
    'Сохраняются мир и настройки. JAR-файлы не нужны: их можно скачать снова.',

  'games.satisfactory.tagline': 'Огромные фабрики, построенные командой.',
  'games.satisfactory.players': 'До 4 (можно больше)',
  'games.satisfactory.download': '15,5 ГБ',
  'games.satisfactory.highlight1': 'Настраивается без запуска игры',
  'games.satisfactory.highlight2': 'Только один одновременно',
  'games.satisfactory.startup': 'около 6 секунд',
  'games.satisfactory.ports': '7777 по TCP и UDP и 8888 по TCP',
  'games.satisfactory.disclaimer':
    'Неофициальный инструмент. Не связан с Coffee Stain Studios и Satisfactory.',
  'games.satisfactory.joinHint': 'В Satisfactory: Менеджер серверов → Добавить сервер, с этим адресом.',
  'games.satisfactory.join1': 'Откройте Satisfactory и зайдите в «Менеджер серверов» из главного меню.',
  'games.satisfactory.join2': 'Нажмите «Добавить сервер» и вставьте туда адрес.',
  'games.satisfactory.join3':
    'Игра попросит пароль администратора (тот, что вы задали при создании сервера), чтобы им можно было управлять.',
  'games.satisfactory.join4':
    'Сервер останется в вашем списке: нажмите «Присоединиться» и, если вы задали пароль для входа, введите его.',
  'games.satisfactory.joinWarning':
    'Прямое подключение по IP не работает: игре нужно разрешение, которое выдаётся только при добавлении сервера этим способом. Если попытаться обойти это, Satisfactory ответит «Encryption token missing».',
  'games.satisfactory.backupScope':
    'Сохраняются сохранения игры и настройки сервера. Сама игра не нужна: она скачивается заново из Steam.',
  'games.satisfactory.moderationHint':
    'В этой игре нельзя выгонять или банить извне. Зайдите в игру с паролем администратора и сделайте это из игрового меню. Если нужно отрезать всех сразу, остановите сервер или задайте пароль для входа в разделе «Настройки».',

  'games.valheim.tagline': 'Выживай, строй и побеждай боссов в мире викингов.',
  'games.valheim.download': '2 ГБ',
  'games.valheim.highlight1': 'Можно играть извне без открытия портов',
  'games.valheim.highlight2': 'Самый лёгкий из всех',
  'games.valheim.highlight3': 'Нет модерации на лету',
  'games.valheim.startup': '35 с с новым миром, потом 12 с',
  'games.valheim.ports': 'два UDP (2456 и 2457) или ни одного с кроссплеем',
  'games.valheim.disclaimer': 'Неофициальный инструмент. Не связан с Iron Gate и Valheim.',
  'games.valheim.joinHint': 'В Valheim: Присоединиться → Добавить сервер, с этим адресом.',
  'games.valheim.join1': 'Откройте Valheim, выберите персонажа и перейдите в «Присоединиться».',
  'games.valheim.join2': 'Нажмите «Добавить сервер» и вставьте адрес вместе с портом.',
  'games.valheim.join3': 'Введите пароль сервера, когда его спросят.',
  'games.valheim.join4': 'Сервер останется в избранном: в следующий раз достаточно нажать «Подключиться».',
  'games.valheim.crossplay2': 'Нажмите «Присоединиться по коду» и введите 6-значный код из приложения.',
  'games.valheim.crossplay4':
    'Код меняется при каждом запуске сервера: его придётся передавать заново.',
  'games.valheim.backupScope':
    'Сохраняются миры и списки модерации. Сама игра не нужна: она скачивается заново из Steam.',
  'games.valheim.moderationHint':
    'В Valheim модерация идёт по Steam ID, а не по имени: игра не сообщает, как зовут чьего-либо персонажа. Бан сразу выгоняет игрока, а полные списки (администраторы, забаненные и допущенные) находятся в разделе Конфигурация → Модерация.',

  'games.factorio.tagline': 'Постройте вместе огромную фабрику и защищайте её.',
  'games.factorio.highlight1': 'Запускается за секунду',
  'games.factorio.highlight2': 'С модами и Space Age',
  'games.factorio.highlight3': 'Нужно иметь игру',
  'games.factorio.startup': 'одна секунда',
  'games.factorio.ports': 'один UDP (34197)',
  'games.factorio.extra': 'Factorio в вашей учётной записи Steam',
  'games.factorio.disclaimer': 'Неофициальный инструмент. Не связан с Wube Software и Factorio.',
  'games.factorio.joinHint': 'В Factorio: Сетевая игра → Подключиться по адресу.',
  'games.factorio.join1': 'Откройте Factorio и зайдите в «Сетевая игра» из главного меню.',
  'games.factorio.join2': 'Нажмите «Подключиться по адресу» и вставьте адрес вместе с портом.',
  'games.factorio.join3': 'Введите пароль сервера, когда его спросят.',
  'games.factorio.join4': 'У всех должна быть та же версия игры и те же моды, что и на сервере.',
  'games.factorio.joinWarning':
    'Если пропустить пароль, Factorio разорвёт соединение без объяснений (на сервере это записывается как «PasswordMissing»). А если ваша игра не той же версии, что сервер, вас не пустят: версию смотрите в сводке сервера.',
  'games.factorio.backupScope':
    'Сохраняются сохранения, моды и списки модерации. Сама игра не нужна: она скачивается заново из Steam.',
  'games.factorio.moderationHint':
    'В Factorio модерация идёт по имени учётной записи Factorio — тому, что видно в чате. Бан сразу выгоняет игрока.',

  'games.zomboid.tagline': 'Выживайте в зомби-эпидемии как можно дольше.',
  'games.zomboid.download': '6,7 ГБ',
  'games.zomboid.highlight1': 'Модерация и команды как в Minecraft',
  'games.zomboid.highlight2': 'Сотни правил игры',
  'games.zomboid.highlight3': 'Запускается больше минуты',
  'games.zomboid.startup': 'около 40 секунд (полторы минуты в первый раз)',
  'games.zomboid.ports': 'один UDP (16261), два с включённым Steam',
  'games.zomboid.disclaimer':
    'Неофициальный инструмент. Не связан с The Indie Stone и Project Zomboid.',
  'games.zomboid.joinHint': 'В Project Zomboid: Присоединиться → Избранное → Добавить сервер, с этим адресом.',
  'games.zomboid.join1': 'Откройте Project Zomboid и зайдите в «Присоединиться» из главного меню.',
  'games.zomboid.join2': 'Перейдите на вкладку «Избранное» и нажмите «Добавить сервер» с этим адресом и портом.',
  'games.zomboid.join3':
    'Введите любое имя пользователя и пароль: в первый раз учётная запись создаётся автоматически.',
  'games.zomboid.join4':
    'Если у сервера есть пароль, он вводится в поле «Пароль сервера», отдельное от пароля вашей учётной записи.',
  'games.zomboid.joinWarning':
    'Ваши имя пользователя и пароль относятся к этому серверу, а не к Steam: вы придумываете их в первый раз и с ними возвращаетесь к тому же персонажу. Если ошибиться при вводе, сервер скажет, что пароль неверный, а не создаст новую учётную запись.',
  'games.zomboid.backupScope':
    'Сохраняются игра, настройки и база учётных записей (кто администратор и кто забанен). Сама игра не нужна: она скачивается заново из Steam.',
  'games.zomboid.moderationHint':
    'В Zomboid модерация идёт по имени учётной записи сервера, а не Steam. Команды передаются через удалённую консоль, поэтому сервер должен быть запущен: когда он остановлен, видно, кто есть кто, но изменить ничего нельзя.',

  'games.enshrouded.tagline': 'Выживайте, стройте и исследуйте мир, поглощённый туманом.',
  'games.enshrouded.download': '8,8 ГБ',
  'games.enshrouded.highlight1': 'Запускается за 3 секунды',
  'games.enshrouded.highlight2': 'Права по паролю',
  'games.enshrouded.startup': 'от 2 до 4 секунд',
  'games.enshrouded.ports': 'один UDP (15637)',
  'games.enshrouded.extra': 'всегда виден в публичном списке игры',
  'games.enshrouded.disclaimer': 'Неофициальный инструмент. Не связан с Keen Games и Enshrouded.',
  'games.enshrouded.joinHint': 'В Enshrouded: Играть → Серверы → Добавить сервер, с этим адресом.',
  'games.enshrouded.join1': 'Откройте Enshrouded и зайдите в «Серверы» из меню игры.',
  'games.enshrouded.join2': 'Нажмите «Добавить сервер» и вставьте адрес вместе с портом.',
  'games.enshrouded.join3':
    'Введите пароль роли, который вам дали: от пароля зависит, что вы сможете делать внутри.',
  'games.enshrouded.join4':
    'Сервер останется в избранном — там он виден, даже если публичный список обновляется с задержкой.',
  'games.enshrouded.joinWarning':
    'В Enshrouded нет единого пароля сервера — у каждой роли свой. С паролем администратора можно выгонять и банить; с паролем гостя нельзя даже открывать сундуки. Если вам дадут не тот, вы всё равно войдёте, но с другими правами.',
  'games.enshrouded.backupScope':
    'Сохраняются миры и настройки вместе с ролями и банами. Сама игра не нужна: она скачивается заново из Steam. При работающем сервере копия делается сразу после одного из его сохранений, которые происходят каждые пять минут.',
  'games.enshrouded.moderationHint':
    'Enshrouded не позволяет выгонять игроков извне: сам сервер сообщает, что выгон на выделенном сервере «не реализован». Зато отсюда можно снять бан, а забанить — внутри игры с паролем администратора (вкладка «Социальное»).',

  'games.rust.tagline': 'Выживайте, стройте базу и защищайте её. Каждый месяц — новая карта.',
  'games.rust.players': 'До {n} на домашнем ПК',
  'games.rust.download': '5,5 ГБ',
  'games.rust.highlight1': 'Модерация на лету',
  'games.rust.highlight2': 'Плагины с Oxide',
  'games.rust.highlight3': 'Новая карта каждый месяц',
  'games.rust.startup': 'от 2 до 5 минут в первый раз (генерирует карту), потом около 13 с',
  'games.rust.ports': 'два UDP (28015 и 28017) и ещё один TCP с Rust+',
  'games.rust.extra': 'всегда виден в публичном списке; новая карта каждый месяц',
  'games.rust.disclaimer': 'Неофициальный инструмент. Не связан с Facepunch Studios и Rust.',
  'games.rust.joinHint': 'В Rust: нажмите F1 и введите «client.connect» и затем этот адрес.',
  'games.rust.join1': 'Откройте Rust и дождитесь главного меню.',
  'games.rust.join2': 'Нажмите F1, чтобы открыть игровую консоль.',
  'games.rust.join3':
    'Введите «client.connect» и адрес с портом, например: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Нажмите Enter. После этого сервер появится в «Истории» списка серверов для следующего раза.',
  'games.rust.joinWarning':
    'Если на сервере только что сменился месяц, а он не обновлён, Rust не пустит вас: скажет, что версия не совпадает. Это происходит в первый четверг каждого месяца; см. Конфигурация → Вайп.',
  'games.rust.backupScope':
    'Сохраняются карта со всеми постройками, игроки, администраторы и баны, а также плагины с их настройками. Сама игра не нужна: она скачивается заново из Steam.',
  'games.rust.moderationHint':
    'В Rust модерация идёт по Steam ID, хотя в списке показано имя. Выгон и бан действуют сразу; администраторы и баны — в разделе Конфигурация → Модерация.'
}
