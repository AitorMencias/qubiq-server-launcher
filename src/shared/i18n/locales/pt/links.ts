import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': 'Remover-se',

  'link.add.button': 'Conectar a outro QubiQ',
  'link.add.title': 'Conectar a outro QubiQ',
  'link.add.intro':
    'Gerencie daqui os servidores de outro computador com QubiQ, com o mesmo que a página remota do celular permite: iniciar, parar, reiniciar e ver o console, os jogadores e o histórico. Nada da configuração nem dos arquivos dele.',
  'link.add.before':
    'No outro computador, vá em Configurações do app → Acesso remoto: ative-o, marque os servidores que quer gerenciar daqui e gere um código.',
  'link.add.address': 'Endereço do outro computador',
  'link.add.addressHelp':
    'O que aparece lá em «Endereço para entrar», por exemplo 192.168.1.20:8443. De fora da casa dele, o IP público com a porta aberta, ou o endereço do Tailscale.',
  'link.add.search': 'Procurar',
  'link.add.searching': 'Procurando…',
  'link.add.found': 'Há um QubiQ em {address}.',
  'link.add.fingerprintTitle': 'Confira a impressão digital',
  'link.add.fingerprintHelp':
    'É a «Impressão digital do certificado» que o outro computador mostra em Configurações do app → Acesso remoto. Compare-a inteira: se não coincidir, alguém pode estar no meio e você não deve continuar.',
  'link.add.fingerprintMatch': 'Coincidem: é esse computador',
  'link.add.code': 'Código de pareamento',
  'link.add.name': 'Nome deste computador lá',
  'link.add.nameHelp': 'É assim que vai aparecer na lista de dispositivos dele.',
  'link.add.defaultName': 'QubiQ de {pc}',
  'link.add.submit': 'Parear',
  'link.add.working': 'Pareando…',
  'link.add.back': 'Mudar o endereço',
  'link.add.noSecureStorage':
    'O Windows não permite cifrar a chave deste computador, então não é possível parear: ela ficaria guardada à vista.',

  'link.group': 'Em {host}',
  'link.state.connecting': 'Conectando…',
  'link.state.online': 'Conectado',
  'link.state.offline': 'Sem conexão',
  'link.state.revoked': 'Já não tem acesso',
  'link.state.cert-changed': 'A impressão digital mudou',
  'link.state.key-lost': 'Chave inutilizável',
  'link.statusUnknown': 'Estado desconhecido',
  'link.noServers': 'Sem servidores: marque-os lá, em Acesso remoto.',
  'link.retry': 'Tentar de novo',
  'link.lastContact': 'Última resposta: {date}.',
  'link.offline.text':
    'Não é possível contatar {host}. Os servidores dele podem continuar ligados: o que você vê é o último estado conhecido.',
  'link.revoked.text':
    '{host} já não reconhece este computador: foi removido da lista dele. Remova a conexão e pareie de novo com um código novo.',
  'link.keyLost.text':
    'A chave desta conexão não funciona neste computador ou com este usuário do Windows (os dados foram copiados de outro PC?). Remova a conexão e pareie de novo.',
  'link.certChanged.text':
    '{host} mostra um certificado diferente do que foi conferido ao parear. Isso acontece se ele foi renovado ou recriado lá, mas também se alguém se colocou no meio. Nada é enviado até você confirmar.',
  'link.certChanged.old': 'Impressão digital fixada',
  'link.certChanged.new': 'Impressão digital mostrada agora',
  'link.certChanged.check': 'Compare-a com a que o outro computador mostra em Configurações do app → Acesso remoto.',
  'link.certChanged.load': 'Ver a nova impressão digital',
  'link.certChanged.trust': 'Coincidem: confiar na nova',

  'link.panel.details': 'Conexão',
  'link.panel.address': 'Endereço',
  'link.panel.device': 'Este computador lá',
  'link.panel.fingerprint': 'Impressão digital fixada',
  'link.panel.paired': 'Pareado',
  'link.panel.permissions': 'O que este computador pode fazer',
  'link.panel.permissionsHelp': 'Quem decide é o dono do outro computador, no Acesso remoto dele.',
  'link.panel.controlYes': 'Iniciar, parar e reiniciar: sim',
  'link.panel.controlNo': 'Iniciar, parar e reiniciar: não, só olhar',
  'link.panel.console': 'Console: {level}',
  'link.panel.servers': 'Servidores',
  'link.remove.title': 'Remover a conexão',
  'link.remove.hint':
    'A chave deste computador é apagada e pede-se ao outro que o esqueça. Para conectar de novo será preciso um código novo.',
  'link.remove.button': 'Remover a conexão',
  'link.remove.confirm': 'Remover a conexão com {host}?',
  'link.remove.working': 'Removendo…',
  'link.remove.done': 'Conexão com {host} removida.',
  'link.remove.notNotified':
    'Conexão com {host} removida aqui, mas ele não respondeu: «{device}» continua na lista de dispositivos dele. Remova-o no Acesso remoto dele.',

  'link.server.on': 'em {host}',
  'link.server.noControl':
    'Este computador só pode olhar: o dono de {host} não lhe deu permissão para iniciar nem parar.',
  'link.server.gone':
    'Este servidor já não está na lista de {host}: foi apagado ou tiraram a permissão deste computador.',

  'link.error.offline':
    'Não é possível contatar esse computador. Confira o endereço, se o acesso remoto está ativado lá e, de fora da casa dele, se a porta está aberta.',
  'link.error.cert-changed': 'O certificado do outro computador não é o que foi conferido.',
  'link.error.key-lost': 'A chave desta conexão não funciona neste computador.',
  'link.error.bad-address':
    'Esse endereço não é válido. Escreva o IP ou o nome do computador, e a porta se não for a 8443.',
  'link.error.not-qubiq': 'O que responde nesse endereço não é o acesso remoto do QubiQ.',
  'link.error.no-secure-storage': 'O Windows não permite cifrar a chave deste computador.',
  'link.error.unknown-link': 'Essa conexão já não existe.'
}
