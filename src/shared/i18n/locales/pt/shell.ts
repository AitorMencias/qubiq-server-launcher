import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'Cancelar',
  'common.quoted': '“{text}”',

  'main.quit.title': 'Há servidores ligados',
  'main.quit.message': 'Você tem servidores em execução.',
  'main.quit.detail':
    'Eles serão desligados corretamente para não danificar o mundo. Pode levar alguns segundos enquanto salvam a partida.',
  'main.quit.confirm': 'Desligar servidores e sair',
  'main.quit.cancel': 'Cancelar',
  'main.missing.title': 'A pasta de dados não foi encontrada',
  'main.missing.message': 'A pasta de dados do QubiQ não foi encontrada: {path}',
  'main.missing.detail':
    'Talvez ela esteja em um disco que não está conectado agora. Conecte-o e clique em “Tentar de novo”. Se escolher a pasta padrão ({defaultPath}), o app vai abrir sem os seus servidores; o que está na outra pasta não é alterado.',
  'main.missing.retry': 'Tentar de novo',
  'main.missing.useDefault': 'Usar a pasta padrão',
  'main.missing.quit': 'Sair',

  'app.noServersYet': 'Você ainda não tem nenhum servidor.',
  'app.createServer': '+ Criar servidor',
  'app.mode': 'Modo',
  'app.modeHint.basic': 'O essencial para jogar. A parte técnica a gente escolhe para você.',
  'app.modeHint.advanced': 'A mesma tela, com todas as configurações liberadas.',
  'app.settings': 'Configurações do app',
  'app.loadError': 'Não foi possível carregar os servidores',
  'app.create.title': 'Criar um servidor novo',
  'app.create.titleGame': 'Criar um servidor novo de {game}',
  'app.create.modeBasic': 'Modo básico',
  'app.create.modeAdvanced': 'Modo avançado',
  'app.create.changeMode': 'Mudar de modo',
  'app.empty.title': 'Você ainda não tem servidores',
  'app.empty.text': 'Crie o primeiro e em poucos minutos vocês estarão jogando.',
  'app.empty.button': 'Criar meu primeiro servidor',

  'mode.basic': 'Básico',
  'mode.advanced': 'Avançado',
  'mode.basic.tagline': 'A gente te guia passo a passo',
  'mode.basic.point1':
    'Uma pergunta por tela: o nome, quantos vocês são, o que o jogo pedir e como vocês se conectam',
  'mode.basic.point2': 'A parte técnica fica com a gente: versão, memória e porta',
  'mode.basic.point3': 'Depois, só um botão para ligar e desligar, seus jogadores e o console',
  'mode.basic.cta': 'Criar no modo básico →',
  'mode.advanced.tagline': 'Você decide tudo',
  'mode.advanced.point1': 'Você escolhe a versão exata, a memória e a porta',
  'mode.advanced.point2': 'A mesma tela, com toda a configuração liberada e a ficha técnica',
  'mode.advanced.point3': 'Backups com intervalo e retenção, seeds e todas as configurações do jogo',
  'mode.advanced.cta': 'Criar no modo avançado →',
  'mode.chooser.title': 'Como você quer criá-lo?',
  'mode.chooser.text':
    'Você pode mudar de modo quando quiser pela barra da esquerda ou pelas configurações do app. Isso não afeta o servidor, só o quanto a gente pergunta.',
  'mode.recommended': 'Recomendado',
  'mode.current': 'Seu modo atual',

  'settings.title': 'Configurações do app',
  'settings.back': 'Voltar',
  'settings.language.title': 'Idioma',
  'settings.language.hint':
    'O de toda a interface. Os nomes dos jogos e os termos técnicos (RCON, BepInEx…) não são traduzidos. Algumas mensagens de erro e de instalação ainda aparecem em espanhol.',
  'settings.language.auto': 'Automático: o do Windows ({name})',
  'settings.mode.title': 'Modo',
  'settings.mode.hint':
    'O quanto o app pergunta e quantas configurações mostra. Nada muda nos seus servidores: você pode trocar de um para o outro quando quiser.',
  'settings.mode.basicSub':
    'O essencial para jogar. O app escolhe versão, memória e porta por você e te guia passo a passo ao criar um servidor.',
  'settings.mode.advancedSub':
    'Tudo à vista: versão exata, memória, porta, backups com intervalo e retenção, e todas as configurações de cada jogo.',
  'settings.dataFolder.title': 'Pasta de dados',
  'settings.dataFolder.hint':
    'É aqui que o app guarda seus servidores, os backups deles, o Java, o SteamCMD e os downloads. Você pode levá-la para outro disco se faltar espaço neste.',
  'settings.dataFolder.current': 'Local atual',
  'settings.dataFolder.isDefault': 'É a pasta padrão.',
  'settings.dataFolder.notDefault': 'A pasta padrão é {path}.',
  'settings.dataFolder.open': 'Abrir pasta',
  'settings.dataFolder.change': 'Mudar de lugar…',
  'settings.dataFolder.backToDefault': 'Voltar para a pasta padrão',
  'settings.dataFolder.pickTitle': 'Escolha onde guardar os dados do QubiQ',
  'settings.dataFolder.checking': 'Verificando a pasta e medindo quanto espaço seus dados ocupam…',
  'settings.dataFolder.checkFailed': 'Não foi possível verificar essa pasta',
  'settings.dataFolder.target': 'Os dados vão para',
  'settings.dataFolder.subfolder':
    'A pasta escolhida já tem coisas dentro, então é criada uma pasta QubiQ para não misturar.',
  'settings.dataFolder.sameDrive': 'Está no mesmo disco: a mudança é instantânea, sem copiar nada.',
  'settings.dataFolder.otherDrive': 'Está em outro disco: é preciso copiar {size}.',
  'settings.dataFolder.problemTitle': 'Não dá para mover para lá',
  'settings.dataFolder.problem.same': 'Os dados já estão nessa pasta.',
  'settings.dataFolder.problem.nested':
    'A pasta nova não pode ficar dentro da atual, nem a atual dentro da nova.',
  'settings.dataFolder.problem.spaces':
    'O caminho tem espaços. Alguns instaladores de servidor (o do Forge, por exemplo) falham com eles, por isso não são permitidos. Escolha uma pasta sem espaços, como D:\\QubiQ.',
  'settings.dataFolder.problem.network':
    'É uma pasta de rede. Se a rede cair com um servidor ligado, a partida pode estragar, e o SteamCMD não instala nelas. Escolha uma pasta em um disco deste computador.',
  'settings.dataFolder.problem.occupied':
    'Essa pasta já tem dados do QubiQ ({entries}). Eles não são misturados com os seus: escolha outra pasta ou esvazie essa.',
  'settings.dataFolder.problem.notWritable':
    'O Windows não deixa criar pastas ali. Escolha outra, por exemplo dentro da sua pasta de usuário ou em outro disco.',
  'settings.dataFolder.problem.space':
    'Não há espaço: são necessários {needed} (seus dados mais uma margem de 1 GB) e nesse disco restam {free}.',
  'settings.dataFolder.problem.busy': {
    one: 'Primeiro é preciso parar o servidor {servers}: enquanto está ligado ou instalando, os arquivos dele ficam abertos.',
    other:
      'Primeiro é preciso parar estes servidores: {servers}. Enquanto estão ligados ou instalando, os arquivos deles ficam abertos.'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'O servidor de Valheim {servers} tem mods, e ali os caminhos dele chegariam a {length} caracteres (o Windows aceita {max}). O BepInEx não iniciaria e o servidor ficaria sem mods sem avisar. Escolha um caminho mais curto.',
    other:
      'Os servidores de Valheim {servers} têm mods, e ali os caminhos deles chegariam a {length} caracteres (o Windows aceita {max}). O BepInEx não iniciaria e eles ficariam sem mods sem avisar. Escolha um caminho mais curto.'
  },
  'settings.dataFolder.problem.links':
    'Dentro dos dados há um link para outra pasta ({path}). Entre discos não dá para copiar sem levar junto o que está do outro lado. Remova-o ou escolha uma pasta no mesmo disco.',
  'settings.dataFolder.warning.firewallTitle': 'O firewall do Windows vai perguntar de novo',
  'settings.dataFolder.warning.firewall':
    'As permissões do firewall dependem do caminho de cada programa, e os dos seus servidores mudam de lugar. Na primeira vez que você iniciar cada servidor depois da mudança, o Windows vai perguntar se ele pode usar a rede: aceite, ou seus amigos não vão conseguir entrar.',
  'settings.dataFolder.warning.copyTitle': 'Vai demorar um pouco',
  'settings.dataFolder.warning.copy':
    'É preciso copiar {size}. Em um SSD, conte com uns {minutes} min; em um HD, bem mais. Enquanto isso o app não pode ser usado. Se algo der errado, os dados ficam onde estão: a pasta original só é apagada quando a cópia está completa e verificada.',
  'settings.dataFolder.warning.cloudTitle': 'É uma pasta sincronizada com a nuvem',
  'settings.dataFolder.warning.cloud':
    'O OneDrive e serviços parecidos enviam tudo o que muda e bloqueiam os arquivos enquanto isso. Com servidores dentro seriam GB de upload e saves escritos pela metade. Melhor uma pasta que não seja sincronizada.',
  'settings.dataFolder.warning.valheimPathTitle': 'O Valheim não poderá usar mods',
  'settings.dataFolder.warning.valheimPath': {
    one: 'Nessa pasta, os caminhos do servidor de Valheim {servers} chegariam a {length} caracteres (o Windows aceita {max}). Agora ele não tem mods e continuará funcionando igual, mas não será possível instalar nenhum.',
    other:
      'Nessa pasta, os caminhos dos servidores de Valheim {servers} chegariam a {length} caracteres (o Windows aceita {max}). Agora eles não têm mods e continuarão funcionando igual, mas não será possível instalar nenhum.'
  },
  'settings.dataFolder.howTitle': 'Como funciona',
  'settings.dataFolder.howText':
    'Ao clicar em {button}, o app fecha e abre de novo sozinho para mover os dados antes de iniciar qualquer coisa. Você vai ver o progresso; no fim, tudo continua como agora, só que na pasta nova.',
  'settings.dataFolder.apply': 'Mover e reiniciar',
  'settings.dataFolder.applying': 'Reiniciando…',

  'settings.about.title': 'Sobre',
  'settings.about.version': 'versão {version}',
  'settings.about.free':
    'Este programa é software livre: você pode redistribuí-lo e/ou modificá-lo nos termos da Licença Pública Geral GNU, versão 3 ou (a seu critério) qualquer versão posterior. Ele é distribuído na esperança de que seja útil, mas SEM NENHUMA GARANTIA, nem mesmo a garantia implícita de COMERCIALIZAÇÃO ou ADEQUAÇÃO A UMA FINALIDADE ESPECÍFICA.',
  'settings.about.unofficial':
    'Ferramenta não oficial: não é associada aos estúdios dos jogos que gerencia nem aprovada por eles.',
  'settings.about.source': 'Código-fonte',
  'settings.about.license': 'Licença',
  'settings.about.notices': 'Avisos de terceiros',
  'settings.about.plugins':
    'O app instala estes plugins próprios, cada um com seu código-fonte e sua licença:',
  'settings.about.missingFile':
    '{file} não foi encontrado junto ao app. Se for uma instalação, reinstale-o; em desenvolvimento, “npm run build” o gera.',

  'relocation.movingTitle': 'Movendo os dados do QubiQ',
  'relocation.movingHint':
    'Não feche o app nem desligue o computador. Se for interrompido, nada se perde: continua quando você abrir de novo.',
  'relocation.from': 'De',
  'relocation.to': 'Para',
  'relocation.phase.measuring': 'Medindo o que precisa ser movido…',
  'relocation.phase.moving': 'Movendo…',
  'relocation.phase.copying': 'Copiando: {copied} de {total}',
  'relocation.phase.verifying': 'Verificando se a cópia é idêntica…',
  'relocation.phase.cleaning': 'Cópia verificada. Apagando a pasta original…',
  'relocation.doneTitle': 'Dados movidos',
  'relocation.firewallTitle': 'Mais uma coisa',
  'relocation.firewall':
    'Na primeira vez que você iniciar cada servidor, o Windows pode perguntar se ele pode usar a rede. Aceite, ou seus amigos não vão conseguir entrar.',
  'relocation.leftoversTitle': 'Ficaram restos na pasta anterior',
  'relocation.leftovers':
    'Seus dados estão completos na pasta nova, mas não foi possível apagar algumas pastas de {path} (instances, runtimes, tools ou cache). Você pode apagá-las manualmente; não apague a pasta inteira, pois ela guarda onde seus dados estão agora.',
  'relocation.failedTitle': 'Não foi possível mover os dados',
  'relocation.untouched': 'Seus dados continuam onde estavam, sem alterações',
  'relocation.error.locked':
    'Algum programa estava com um arquivo dos dados aberto (um antivírus, o Explorador do Windows ou um servidor aberto fora do QubiQ). Feche-o e tente de novo pelas configurações.',
  'relocation.error.mismatch':
    'A cópia não ficou igual ao original (faltavam arquivos ou os tamanhos eram diferentes), então nada foi apagado. Verifique se o disco de destino está funcionando bem e tente de novo.',
  'relocation.error.links':
    'Dentro dos dados há um link para outra pasta ({path}) e ele não pode ser copiado entre discos. Remova-o ou escolha uma pasta no mesmo disco.',
  'relocation.error.missing': 'A pasta de origem não foi encontrada, ou a de destino deixou de estar disponível.',
  'relocation.error.other': 'Erro inesperado: {detail}',
  'relocation.continue': 'Continuar'
}
