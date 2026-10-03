import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': 'ख़ुद को हटाया',

  'link.add.button': 'दूसरे QubiQ से जुड़ें',
  'link.add.title': 'दूसरे QubiQ से जुड़ें',
  'link.add.intro':
    'QubiQ वाले दूसरे कंप्यूटर के सर्वर यहाँ से चलाएँ, उतना ही जितना फ़ोन का रिमोट पेज करने देता है: शुरू करना, रोकना, दोबारा शुरू करना, और कंसोल, खिलाड़ी व इतिहास देखना। उसकी सेटिंग्स या फ़ाइलें नहीं।',
  'link.add.before':
    'दूसरे कंप्यूटर पर ऐप सेटिंग्स → रिमोट एक्सेस खोलें: उसे चालू करें, जिन सर्वरों को यहाँ से चलाना है उन्हें चुनें और एक कोड बनाएँ।',
  'link.add.address': 'दूसरे कंप्यूटर का पता',
  'link.add.addressHelp':
    'वह पता जो वहाँ «जुड़ने का पता» में दिखता है, जैसे 192.168.1.20:8443। उसके घर के बाहर से, खुले पोर्ट के साथ उसका सार्वजनिक IP, या उसका Tailscale पता।',
  'link.add.search': 'खोजें',
  'link.add.searching': 'खोज रहे हैं…',
  'link.add.found': '{address} पर एक QubiQ है।',
  'link.add.fingerprintTitle': 'फ़िंगरप्रिंट जाँचें',
  'link.add.fingerprintHelp':
    'यह वह «प्रमाणपत्र का फ़िंगरप्रिंट» है जो दूसरा कंप्यूटर ऐप सेटिंग्स → रिमोट एक्सेस में दिखाता है। पूरा मिलाएँ: अगर मेल नहीं खाता, तो बीच में कोई हो सकता है और आगे न बढ़ें।',
  'link.add.fingerprintMatch': 'मेल खाते हैं: यह वही कंप्यूटर है',
  'link.add.code': 'पेयरिंग कोड',
  'link.add.name': 'वहाँ इस कंप्यूटर का नाम',
  'link.add.nameHelp': 'उसकी डिवाइस सूची में यह इसी नाम से दिखेगा।',
  'link.add.defaultName': '{pc} का QubiQ',
  'link.add.submit': 'पेयर करें',
  'link.add.working': 'पेयर हो रहा है…',
  'link.add.back': 'पता बदलें',
  'link.add.noSecureStorage':
    'Windows इस कंप्यूटर की कुंजी को एन्क्रिप्ट नहीं करने देता, इसलिए पेयर नहीं हो सकता: कुंजी खुले में सहेजी जाती।',

  'link.group': '{host} पर',
  'link.state.connecting': 'जुड़ रहे हैं…',
  'link.state.online': 'जुड़ा हुआ',
  'link.state.offline': 'कनेक्शन नहीं',
  'link.state.revoked': 'अब पहुँच नहीं',
  'link.state.cert-changed': 'फ़िंगरप्रिंट बदल गया है',
  'link.state.key-lost': 'कुंजी बेकार',
  'link.statusUnknown': 'स्थिति अज्ञात',
  'link.noServers': 'कोई सर्वर नहीं: उन्हें वहाँ, रिमोट एक्सेस में चुनें।',
  'link.retry': 'फिर कोशिश करें',
  'link.lastContact': 'आख़िरी जवाब: {date}।',
  'link.offline.text':
    '{host} से संपर्क नहीं हो पा रहा। उसके सर्वर शायद अब भी चल रहे हों: जो दिख रहा है वह आख़िरी ज्ञात स्थिति है।',
  'link.revoked.text':
    '{host} अब इस कंप्यूटर को नहीं पहचानता: इसे उसकी सूची से हटा दिया गया है। कनेक्शन हटाएँ और नए कोड से फिर पेयर करें।',
  'link.keyLost.text':
    'इस कनेक्शन की कुंजी इस कंप्यूटर या इस Windows उपयोगकर्ता पर काम नहीं करती (क्या डेटा किसी दूसरे PC से कॉपी किया गया?)। कनेक्शन हटाएँ और फिर पेयर करें।',
  'link.certChanged.text':
    '{host} पेयर करते समय जाँचे गए प्रमाणपत्र से अलग प्रमाणपत्र दिखा रहा है। ऐसा तब होता है जब वहाँ उसे नवीनीकृत या दोबारा बनाया गया हो, पर तब भी जब कोई बीच में आ गया हो। आपकी पुष्टि तक उसे कुछ नहीं भेजा जाएगा।',
  'link.certChanged.old': 'तय किया गया फ़िंगरप्रिंट',
  'link.certChanged.new': 'अभी दिख रहा फ़िंगरप्रिंट',
  'link.certChanged.check': 'इसे उस फ़िंगरप्रिंट से मिलाएँ जो दूसरा कंप्यूटर ऐप सेटिंग्स → रिमोट एक्सेस में दिखाता है।',
  'link.certChanged.load': 'नया फ़िंगरप्रिंट देखें',
  'link.certChanged.trust': 'मेल खाते हैं: नए पर भरोसा करें',

  'link.panel.details': 'कनेक्शन',
  'link.panel.address': 'पता',
  'link.panel.device': 'वहाँ यह कंप्यूटर',
  'link.panel.fingerprint': 'तय किया गया फ़िंगरप्रिंट',
  'link.panel.paired': 'पेयर किया गया',
  'link.panel.permissions': 'यह कंप्यूटर क्या कर सकता है',
  'link.panel.permissionsHelp': 'यह दूसरे कंप्यूटर का मालिक अपने रिमोट एक्सेस में तय करता है।',
  'link.panel.controlYes': 'शुरू करना, रोकना और दोबारा शुरू करना: हाँ',
  'link.panel.controlNo': 'शुरू करना, रोकना और दोबारा शुरू करना: नहीं, सिर्फ़ देखना',
  'link.panel.console': 'कंसोल: {level}',
  'link.panel.servers': 'सर्वर',
  'link.remove.title': 'कनेक्शन हटाएँ',
  'link.remove.hint':
    'इस कंप्यूटर की कुंजी मिटा दी जाती है और दूसरे से इसे भूलने को कहा जाता है। फिर से जुड़ने के लिए नया कोड चाहिए होगा।',
  'link.remove.button': 'कनेक्शन हटाएँ',
  'link.remove.confirm': '{host} से कनेक्शन हटाएँ?',
  'link.remove.working': 'हटा रहे हैं…',
  'link.remove.done': '{host} से कनेक्शन हटा दिया गया।',
  'link.remove.notNotified':
    '{host} से कनेक्शन यहाँ हटा दिया गया, पर उसने जवाब नहीं दिया: «{device}» अब भी उसकी डिवाइस सूची में है। उसे वहाँ रिमोट एक्सेस में हटाएँ।',

  'link.server.on': '{host} पर',
  'link.server.noControl':
    'यह कंप्यूटर सिर्फ़ देख सकता है: {host} के मालिक ने इसे शुरू करने या रोकने की अनुमति नहीं दी है।',
  'link.server.gone':
    'यह सर्वर अब {host} की सूची में नहीं है: इसे मिटा दिया गया या इस कंप्यूटर की अनुमति हटा दी गई।',

  'link.error.offline':
    'उस कंप्यूटर से संपर्क नहीं हो पा रहा। पता जाँचें, कि वहाँ रिमोट एक्सेस चालू है, और उसके घर के बाहर से, कि पोर्ट खुला है।',
  'link.error.cert-changed': 'दूसरे कंप्यूटर का प्रमाणपत्र वह नहीं है जो जाँचा गया था।',
  'link.error.key-lost': 'इस कनेक्शन की कुंजी इस कंप्यूटर पर काम नहीं करती।',
  'link.error.bad-address':
    'यह पता मान्य नहीं है। कंप्यूटर का IP या नाम लिखें, और पोर्ट भी अगर वह 8443 नहीं है।',
  'link.error.not-qubiq': 'उस पते पर जवाब देने वाला QubiQ का रिमोट एक्सेस नहीं है।',
  'link.error.no-secure-storage': 'Windows इस कंप्यूटर की कुंजी को एन्क्रिप्ट नहीं करने देता।',
  'link.error.unknown-link': 'वह कनेक्शन अब मौजूद नहीं है।'
}
