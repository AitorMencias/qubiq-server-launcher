import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'Servidores de jogos, sem complicação',
  'games.subtitleOne': 'Servidores de {game}, sem complicação',
  'games.disclaimerAll':
    'O QubiQ não é um produto oficial de nenhum dos jogos que gerencia nem tem vínculo com os estúdios deles.',
  'games.agreement.minecraft': 'o EULA do Minecraft',
  'games.agreement.steam': 'o Acordo de Assinatura do Steam',
  'games.tunnelExampleHost': 'algo',
  'games.upTo': 'Até {n}',
  'games.upToComfortably': 'Até {n} com folga',
  'games.alwaysPublic': 'Sempre aparece na lista pública',

  'games.port.game': 'Jogo',
  'games.port.messaging': 'Mensagens do jogo',
  'games.port.playerData': 'Dados de jogador',
  'games.port.steamQuery': 'Consulta do Steam',
  'games.port.rustPlus': 'Rust+ (app do celular)',
  'games.port.tcpUdp': 'TCP e UDP',
  'games.port.udpTcp': 'UDP e TCP',
  'games.summary.custom': 'personalizado',
  'games.summary.rustMap': 'mapa: {size}',

  'games.minecraft.tagline': 'Construir e sobreviver. O clássico, com plugins ou mods.',
  'games.minecraft.players': 'Até ~20',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'Plugins e mods',
  'games.minecraft.startup': 'depende dos mods: de segundos a alguns minutos',
  'games.minecraft.ports': 'uma TCP (25565)',
  'games.minecraft.extra': 'Java: o app baixa sozinho',
  'games.minecraft.joinHint': 'No Minecraft: Multijogador → Adicionar servidor.',
  'games.minecraft.backupScope':
    'São salvos o mundo e a configuração. Os jars não são necessários: dá para baixar de novo.',

  'games.satisfactory.tagline': 'Fábricas enormes montadas em equipe.',
  'games.satisfactory.players': 'Até 4 (expansível)',
  'games.satisfactory.download': '15,5 GB',
  'games.satisfactory.highlight1': 'Configurado sem abrir o jogo',
  'games.satisfactory.highlight2': 'Só um por vez',
  'games.satisfactory.startup': 'uns 6 segundos',
  'games.satisfactory.ports': 'a 7777 por TCP e UDP, e a 8888 por TCP',
  'games.satisfactory.disclaimer':
    'Ferramenta não oficial. Sem vínculo com a Coffee Stain Studios nem com Satisfactory.',
  'games.satisfactory.joinHint': 'No Satisfactory: Gerenciador de servidores → Adicionar servidor, com este endereço.',
  'games.satisfactory.join1': 'Abra o Satisfactory e entre em “Gerenciador de servidores” no menu principal.',
  'games.satisfactory.join2': 'Clique em “Adicionar servidor” e cole o endereço ali.',
  'games.satisfactory.join3':
    'Ele vai pedir a senha de administrador (a que você definiu ao criar o servidor) para você poder gerenciá-lo.',
  'games.satisfactory.join4':
    'O servidor fica na sua lista: clique em “Entrar” e, se você definiu uma senha de acesso, digite-a.',
  'games.satisfactory.joinWarning':
    'A conexão direta por IP não funciona: o jogo exige uma permissão que só se consegue adicionando o servidor desse jeito. Se tentar na marra, o Satisfactory responde “Encryption token missing”.',
  'games.satisfactory.backupScope':
    'São salvos os saves e as configurações do servidor. O jogo não é necessário: ele é baixado de novo do Steam.',
  'games.satisfactory.moderationHint':
    'Este jogo não deixa expulsar nem banir de fora. Entre na partida com sua senha de administrador e faça isso pelo menu do próprio jogo. Se precisar cortar de vez, pare o servidor ou defina uma senha de acesso em Ajustes.',

  'games.valheim.tagline': 'Sobreviver, construir e derrotar chefes em um mundo viking.',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'Dá para jogar de fora sem abrir portas',
  'games.valheim.highlight2': 'O mais leve de todos',
  'games.valheim.highlight3': 'Sem moderação ao vivo',
  'games.valheim.startup': '35 s com um mundo novo, 12 s depois',
  'games.valheim.ports': 'duas UDP (2456 e 2457), ou nenhuma com crossplay',
  'games.valheim.disclaimer': 'Ferramenta não oficial. Sem vínculo com a Iron Gate nem com Valheim.',
  'games.valheim.joinHint': 'No Valheim: Entrar em partida → Adicionar servidor, com este endereço.',
  'games.valheim.join1': 'Abra o Valheim, escolha seu personagem e entre em “Entrar em partida”.',
  'games.valheim.join2': 'Clique em “Adicionar servidor” e cole o endereço, com a porta incluída.',
  'games.valheim.join3': 'Digite a senha do servidor quando ele pedir.',
  'games.valheim.join4': 'O servidor fica nos seus favoritos: na próxima vez basta clicar em “Conectar”.',
  'games.valheim.crossplay2': 'Clique em “Entrar com código” e digite o código de 6 dígitos que o app mostra.',
  'games.valheim.crossplay4':
    'O código muda toda vez que o servidor é iniciado: será preciso passá-lo de novo.',
  'games.valheim.backupScope':
    'São salvos os mundos e as listas de moderação. O jogo não é necessário: ele é baixado de novo do Steam.',
  'games.valheim.moderationHint':
    'No Valheim a moderação é pelo ID do Steam, não pelo nome: o jogo não informa o nome do personagem de ninguém. Banir alguém o expulsa na hora, e as listas completas (administradores, banidos e permitidos) ficam em Configuração → Moderação.',

  'games.factorio.tagline': 'Montar uma fábrica enorme em grupo, e defendê-la.',
  'games.factorio.highlight1': 'Inicia em um segundo',
  'games.factorio.highlight2': 'Com mods e com Space Age',
  'games.factorio.highlight3': 'É preciso ter o jogo',
  'games.factorio.startup': 'um segundo',
  'games.factorio.ports': 'uma UDP (34197)',
  'games.factorio.extra': 'ter o Factorio na sua conta do Steam',
  'games.factorio.disclaimer': 'Ferramenta não oficial. Sem vínculo com a Wube Software nem com Factorio.',
  'games.factorio.joinHint': 'No Factorio: Multijogador → Conectar ao endereço.',
  'games.factorio.join1': 'Abra o Factorio e entre em “Multijogador” no menu principal.',
  'games.factorio.join2': 'Clique em “Conectar ao endereço” e cole o endereço, com a porta incluída.',
  'games.factorio.join3': 'Digite a senha do servidor quando ele pedir.',
  'games.factorio.join4': 'Todos precisam ter a mesma versão do jogo e os mesmos mods que o servidor.',
  'games.factorio.joinWarning':
    'Se você pular a senha, o Factorio derruba a conexão sem dizer por quê (no servidor aparece “PasswordMissing”). E se o seu jogo não estiver na mesma versão do servidor, ele não vai te deixar entrar: veja a versão na ficha do servidor.',
  'games.factorio.backupScope':
    'São salvos os saves, os mods e as listas de moderação. O jogo não é necessário: ele é baixado de novo do Steam.',
  'games.factorio.moderationHint':
    'No Factorio a moderação é pelo nome da conta do Factorio, que é o que aparece no chat. Banir alguém o expulsa na hora.',

  'games.zomboid.tagline': 'Sobreviver à epidemia zumbi pelo máximo de tempo possível.',
  'games.zomboid.download': '6,7 GB',
  'games.zomboid.highlight1': 'Moderação e comandos como no Minecraft',
  'games.zomboid.highlight2': 'Centenas de regras de partida',
  'games.zomboid.highlight3': 'Leva mais de um minuto para iniciar',
  'games.zomboid.startup': 'uns 40 segundos (um minuto e meio na primeira vez)',
  'games.zomboid.ports': 'uma UDP (16261), duas com o Steam ativado',
  'games.zomboid.disclaimer':
    'Ferramenta não oficial. Sem vínculo com a The Indie Stone nem com Project Zomboid.',
  'games.zomboid.joinHint': 'No Project Zomboid: Entrar → Favoritos → Adicionar servidor, com este endereço.',
  'games.zomboid.join1': 'Abra o Project Zomboid e entre em “Entrar” no menu principal.',
  'games.zomboid.join2': 'Vá até a aba “Favoritos” e clique em “Adicionar servidor” com este endereço e a porta.',
  'games.zomboid.join3':
    'Digite o nome de usuário e a senha que quiser: na primeira vez a conta é criada sozinha.',
  'games.zomboid.join4':
    'Se o servidor tiver senha, ela vai no campo “Senha do servidor”, que é diferente do da sua conta.',
  'games.zomboid.joinWarning':
    'Seu usuário e sua senha são deste servidor, não do Steam: você os inventa na primeira vez e com eles volta ao mesmo personagem. Se digitar errado, o servidor diz que a senha é inválida em vez de criar outra conta.',
  'games.zomboid.backupScope':
    'São salvos a partida, as configurações e o banco de contas (quem é administrador e quem está banido). O jogo não é necessário: ele é baixado de novo do Steam.',
  'games.zomboid.moderationHint':
    'No Zomboid a moderação é pelo nome da conta do servidor, não pelo Steam. Os comandos passam pelo console remoto, então o servidor precisa estar ligado: parado, dá para ver quem é quem, mas não dá para mudar nada.',

  'games.enshrouded.tagline': 'Sobreviver, construir e explorar um mundo engolido pela névoa.',
  'games.enshrouded.download': '8,8 GB',
  'games.enshrouded.highlight1': 'Inicia em 3 segundos',
  'games.enshrouded.highlight2': 'Permissões por senha',
  'games.enshrouded.startup': 'entre 2 e 4 segundos',
  'games.enshrouded.ports': 'uma UDP (15637)',
  'games.enshrouded.extra': 'sempre aparece na lista pública do jogo',
  'games.enshrouded.disclaimer': 'Ferramenta não oficial. Sem vínculo com a Keen Games nem com Enshrouded.',
  'games.enshrouded.joinHint': 'No Enshrouded: Jogar → Servidores → Adicionar servidor, com este endereço.',
  'games.enshrouded.join1': 'Abra o Enshrouded e entre em “Servidores” no menu de jogar.',
  'games.enshrouded.join2': 'Clique em “Adicionar servidor” e cole o endereço, com a porta incluída.',
  'games.enshrouded.join3':
    'Digite a senha do cargo que te deram: é a senha que define o que você pode fazer lá dentro.',
  'games.enshrouded.join4':
    'O servidor fica nos seus favoritos, onde aparece mesmo que a lista pública demore a atualizar.',
  'games.enshrouded.joinWarning':
    'No Enshrouded não existe uma senha do servidor, e sim uma por cargo. Com a de Administrador você pode expulsar e banir; com a de Convidado não pode nem abrir baús. Se te passarem a errada, você entra do mesmo jeito, mas com outras permissões.',
  'games.enshrouded.backupScope':
    'São salvos os mundos e a configuração, com os cargos e os banidos. O jogo não é necessário: ele é baixado de novo do Steam. Com o servidor ligado, o backup é feito logo depois de um dos salvamentos dele, que acontecem a cada cinco minutos.',
  'games.enshrouded.moderationHint':
    'O Enshrouded não deixa expulsar ninguém de fora do jogo: o próprio servidor diz que expulsar em um dedicado “não está implementado”. O que dá para fazer é tirar um banimento daqui, e banir de dentro do jogo com a senha de Administrador (aba Social).',

  'games.rust.tagline': 'Sobreviver, construir uma base e defendê-la. Todo mês, mapa novo.',
  'games.rust.players': 'Até {n} em um PC de casa',
  'games.rust.download': '5,5 GB',
  'games.rust.highlight1': 'Moderação ao vivo',
  'games.rust.highlight2': 'Plugins com Oxide',
  'games.rust.highlight3': 'Mapa novo todo mês',
  'games.rust.startup': 'de 2 a 5 minutos na primeira vez (gera o mapa), uns 13 s depois',
  'games.rust.ports': 'duas UDP (28015 e 28017), e mais uma TCP com Rust+',
  'games.rust.extra': 'sempre aparece na lista pública; mapa novo todo mês',
  'games.rust.disclaimer': 'Ferramenta não oficial. Sem vínculo com a Facepunch Studios nem com Rust.',
  'games.rust.joinHint': 'No Rust: aperte F1 e digite “client.connect” seguido deste endereço.',
  'games.rust.join1': 'Abra o Rust e espere chegar ao menu principal.',
  'games.rust.join2': 'Aperte F1 para abrir o console do jogo.',
  'games.rust.join3':
    'Digite “client.connect” e o endereço com a porta, por exemplo: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Aperte Enter. Depois o servidor aparece em “Histórico” na lista de servidores, para a próxima vez.',
  'games.rust.joinWarning':
    'Se o servidor acabou de virar o mês e não foi atualizado, o Rust não te deixa entrar: diz que a versão não bate. Acontece na primeira quinta-feira de cada mês; veja Configuração → Wipe.',
  'games.rust.backupScope':
    'São salvos o mapa com tudo o que foi construído, os jogadores, os administradores e os banidos, e os plugins com a configuração deles. O jogo não é necessário: ele é baixado de novo do Steam.',
  'games.rust.moderationHint':
    'No Rust a moderação é pelo ID do Steam, embora a lista mostre o nome. Expulsar e banir têm efeito na hora; administradores e banidos ficam em Configuração → Moderação.'
}
