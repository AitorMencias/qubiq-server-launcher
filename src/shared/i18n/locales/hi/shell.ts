import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'रद्द करें',
  'common.quoted': '“{text}”',

  'main.quit.title': 'सर्वर चल रहे हैं',
  'main.quit.message': 'आपके कुछ सर्वर चल रहे हैं।',
  'main.quit.detail':
    'दुनिया को नुकसान न पहुँचे, इसलिए उन्हें ठीक से बंद किया जाएगा। गेम सेव होने में कुछ सेकंड लग सकते हैं।',
  'main.quit.confirm': 'सर्वर बंद करें और बाहर निकलें',
  'main.quit.cancel': 'रद्द करें',
  'main.missing.title': 'डेटा फ़ोल्डर नहीं मिला',
  'main.missing.message': 'QubiQ का डेटा फ़ोल्डर नहीं मिला: {path}',
  'main.missing.detail':
    'हो सकता है वह किसी ऐसी ड्राइव पर हो जो अभी जुड़ी नहीं है। उसे जोड़ें और “फिर से कोशिश करें” दबाएँ। अगर आप डिफ़ॉल्ट फ़ोल्डर ({defaultPath}) चुनते हैं, तो ऐप आपके सर्वरों के बिना खुलेगा; दूसरे फ़ोल्डर की किसी चीज़ को छुआ नहीं जाएगा।',
  'main.missing.retry': 'फिर से कोशिश करें',
  'main.missing.useDefault': 'डिफ़ॉल्ट फ़ोल्डर इस्तेमाल करें',
  'main.missing.quit': 'बाहर निकलें',

  'app.noServersYet': 'आपके पास अभी कोई सर्वर नहीं है।',
  'app.createServer': '+ सर्वर बनाएँ',
  'app.mode': 'मोड',
  'app.modeHint.basic': 'खेलने के लिए ज़रूरी चीज़ें ही। तकनीकी बातें हम आपके लिए चुनते हैं।',
  'app.modeHint.advanced': 'वही स्क्रीन, सभी सेटिंग्स खुली हुई।',
  'app.settings': 'ऐप सेटिंग्स',
  'app.loadError': 'सर्वर लोड नहीं हो सके',
  'app.create.title': 'नया सर्वर बनाएँ',
  'app.create.titleGame': '{game} का नया सर्वर बनाएँ',
  'app.create.modeBasic': 'बेसिक मोड',
  'app.create.modeAdvanced': 'एडवांस्ड मोड',
  'app.create.changeMode': 'मोड बदलें',
  'app.empty.title': 'आपके पास अभी कोई सर्वर नहीं है',
  'app.empty.text': 'पहला सर्वर बनाइए और कुछ ही मिनटों में खेलना शुरू कीजिए।',
  'app.empty.button': 'मेरा पहला सर्वर बनाएँ',

  'mode.basic': 'बेसिक',
  'mode.advanced': 'एडवांस्ड',
  'mode.basic.tagline': 'हम आपको कदम-दर-कदम ले चलेंगे',
  'mode.basic.point1':
    'हर स्क्रीन पर एक सवाल: नाम, आप कितने लोग हैं, गेम को क्या चाहिए और आप कैसे जुड़ेंगे',
  'mode.basic.point2': 'तकनीकी हिस्सा हम संभालते हैं: वर्शन, मेमोरी और पोर्ट',
  'mode.basic.point3': 'उसके बाद चालू-बंद करने का बस एक बटन, आपके खिलाड़ी और कंसोल',
  'mode.basic.cta': 'बेसिक मोड में बनाएँ →',
  'mode.advanced.tagline': 'सब कुछ आप तय करें',
  'mode.advanced.point1': 'सटीक वर्शन, मेमोरी और पोर्ट आप चुनें',
  'mode.advanced.point2': 'वही स्क्रीन, पूरी कॉन्फ़िगरेशन खुली हुई और तकनीकी जानकारी के साथ',
  'mode.advanced.point3': 'अंतराल और रिटेंशन वाले बैकअप, सीड और गेम की सभी सेटिंग्स',
  'mode.advanced.cta': 'एडवांस्ड मोड में बनाएँ →',
  'mode.chooser.title': 'आप इसे कैसे बनाना चाहते हैं?',
  'mode.chooser.text':
    'आप बाईं पट्टी या ऐप सेटिंग्स से जब चाहें मोड बदल सकते हैं। इससे सर्वर पर कोई असर नहीं पड़ता, बस इस पर कि हम आपसे कितना पूछते हैं।',
  'mode.recommended': 'सुझाया गया',
  'mode.current': 'आपका मौजूदा मोड',

  'settings.title': 'ऐप सेटिंग्स',
  'settings.back': 'वापस',
  'settings.language.title': 'भाषा',
  'settings.language.hint':
    'पूरे इंटरफ़ेस की भाषा। गेम के नाम और तकनीकी शब्द (RCON, BepInEx…) अनुवादित नहीं होते। कुछ त्रुटि और इंस्टॉलेशन संदेश अभी भी स्पेनिश में दिखते हैं।',
  'settings.language.auto': 'स्वचालित: Windows वाली ({name})',
  'settings.mode.title': 'मोड',
  'settings.mode.hint':
    'ऐप आपसे कितना पूछता है और कितनी सेटिंग्स दिखाता है। आपके सर्वरों में कुछ नहीं बदलता: आप जब चाहें बदल सकते हैं।',
  'settings.mode.basicSub':
    'खेलने के लिए ज़रूरी चीज़ें ही। ऐप आपके लिए वर्शन, मेमोरी और पोर्ट चुनता है और सर्वर बनाते समय कदम-दर-कदम ले चलता है।',
  'settings.mode.advancedSub':
    'सब कुछ सामने: सटीक वर्शन, मेमोरी, पोर्ट, अंतराल और रिटेंशन वाले बैकअप, और हर गेम की सभी सेटिंग्स।',
  'settings.dataFolder.title': 'डेटा फ़ोल्डर',
  'settings.dataFolder.hint':
    'यहाँ ऐप आपके सर्वर, उनके बैकअप, Java, SteamCMD और डाउनलोड रखता है। अगर इस ड्राइव में जगह कम है तो आप इसे दूसरी ड्राइव पर ले जा सकते हैं।',
  'settings.dataFolder.current': 'मौजूदा स्थान',
  'settings.dataFolder.isDefault': 'यह डिफ़ॉल्ट फ़ोल्डर है।',
  'settings.dataFolder.notDefault': 'डिफ़ॉल्ट फ़ोल्डर {path} है।',
  'settings.dataFolder.open': 'फ़ोल्डर खोलें',
  'settings.dataFolder.change': 'जगह बदलें…',
  'settings.dataFolder.backToDefault': 'डिफ़ॉल्ट फ़ोल्डर में वापस ले जाएँ',
  'settings.dataFolder.pickTitle': 'चुनें कि QubiQ का डेटा कहाँ रखना है',
  'settings.dataFolder.checking': 'फ़ोल्डर जाँचा जा रहा है और आपके डेटा का आकार नापा जा रहा है…',
  'settings.dataFolder.checkFailed': 'वह फ़ोल्डर जाँचा नहीं जा सका',
  'settings.dataFolder.target': 'डेटा यहाँ जाएगा',
  'settings.dataFolder.subfolder':
    'आपके चुने फ़ोल्डर में पहले से चीज़ें हैं, इसलिए उन्हें अलग रखने के लिए एक QubiQ फ़ोल्डर बनाया जाएगा।',
  'settings.dataFolder.sameDrive': 'यह उसी ड्राइव पर है: बिना कुछ कॉपी किए तुरंत चला जाएगा।',
  'settings.dataFolder.otherDrive': 'यह दूसरी ड्राइव पर है: {size} कॉपी करना होगा।',
  'settings.dataFolder.problemTitle': 'वहाँ नहीं ले जाया जा सकता',
  'settings.dataFolder.problem.same': 'डेटा पहले से उसी फ़ोल्डर में है।',
  'settings.dataFolder.problem.nested':
    'नया फ़ोल्डर मौजूदा फ़ोल्डर के अंदर नहीं हो सकता, और न ही मौजूदा फ़ोल्डर नए के अंदर।',
  'settings.dataFolder.problem.spaces':
    'पाथ में स्पेस हैं। कुछ सर्वर इंस्टॉलर (जैसे Forge का) इनके साथ विफल हो जाते हैं, इसलिए इनकी अनुमति नहीं है। बिना स्पेस वाला फ़ोल्डर चुनें, जैसे D:\\QubiQ।',
  'settings.dataFolder.problem.network':
    'यह नेटवर्क फ़ोल्डर है। सर्वर चालू रहते नेटवर्क टूटा तो गेम खराब हो सकता है, और SteamCMD ऐसे फ़ोल्डरों में इंस्टॉल नहीं करता। इस कंप्यूटर की किसी ड्राइव पर फ़ोल्डर चुनें।',
  'settings.dataFolder.problem.occupied':
    'उस फ़ोल्डर में पहले से QubiQ का डेटा है ({entries})। उसे आपके डेटा के साथ मिलाया नहीं जाएगा: कोई दूसरा फ़ोल्डर चुनें या उसे खाली करें।',
  'settings.dataFolder.problem.notWritable':
    'Windows वहाँ फ़ोल्डर बनाने नहीं देता। कोई दूसरा चुनें, जैसे अपने यूज़र फ़ोल्डर के अंदर या किसी दूसरी ड्राइव पर।',
  'settings.dataFolder.problem.space':
    'जगह कम है: {needed} चाहिए (आपका डेटा और 1 GB अतिरिक्त) और उस ड्राइव पर {free} बचा है।',
  'settings.dataFolder.problem.busy': {
    one: 'पहले सर्वर {servers} को रोकना होगा: चालू रहते या इंस्टॉल होते समय उसकी फ़ाइलें खुली रहती हैं।',
    other:
      'पहले इन सर्वरों को रोकना होगा: {servers}। चालू रहते या इंस्टॉल होते समय उनकी फ़ाइलें खुली रहती हैं।'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'Valheim सर्वर {servers} में मॉड हैं, और वहाँ उसके पाथ {length} अक्षरों तक पहुँच जाएँगे (Windows {max} तक मानता है)। BepInEx शुरू नहीं होगा और सर्वर बिना बताए मॉड के बिना चलेगा। छोटा पाथ चुनें।',
    other:
      'Valheim सर्वरों {servers} में मॉड हैं, और वहाँ उनके पाथ {length} अक्षरों तक पहुँच जाएँगे (Windows {max} तक मानता है)। BepInEx शुरू नहीं होगा और वे बिना बताए मॉड के बिना चलेंगे। छोटा पाथ चुनें।'
  },
  'settings.dataFolder.problem.links':
    'डेटा के अंदर किसी दूसरे फ़ोल्डर ({path}) का लिंक है। ड्राइवों के बीच इसे दूसरी तरफ़ की चीज़ें साथ लिए बिना कॉपी नहीं किया जा सकता। इसे हटाएँ या उसी ड्राइव पर फ़ोल्डर चुनें।',
  'settings.dataFolder.warning.firewallTitle': 'Windows फ़ायरवॉल फिर से पूछेगा',
  'settings.dataFolder.warning.firewall':
    'फ़ायरवॉल की अनुमतियाँ हर प्रोग्राम के पाथ से जुड़ी होती हैं, और आपके सर्वरों के पाथ बदल जाएँगे। स्थानांतरण के बाद हर सर्वर को पहली बार चालू करने पर Windows पूछेगा कि क्या उसे नेटवर्क इस्तेमाल करने दें: हाँ करें, वरना आपके दोस्त जुड़ नहीं पाएँगे।',
  'settings.dataFolder.warning.copyTitle': 'इसमें कुछ समय लगेगा',
  'settings.dataFolder.warning.copy':
    '{size} कॉपी करना होगा। SSD पर लगभग {minutes} मिनट मानकर चलें; हार्ड डिस्क पर काफ़ी ज़्यादा। इस दौरान ऐप इस्तेमाल नहीं हो सकता। कुछ गड़बड़ हुई तो डेटा वहीं रहेगा: मूल फ़ोल्डर तभी मिटाया जाता है जब कॉपी पूरी होकर जाँच ली जाती है।',
  'settings.dataFolder.warning.cloudTitle': 'यह फ़ोल्डर क्लाउड के साथ सिंक होता है',
  'settings.dataFolder.warning.cloud':
    'OneDrive जैसी सेवाएँ हर बदलाव अपलोड करती हैं और उस दौरान फ़ाइलें लॉक कर देती हैं। अंदर सर्वर हों तो GB का अपलोड और आधे लिखे सेव होंगे। ऐसा फ़ोल्डर बेहतर है जो सिंक न होता हो।',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim में मॉड नहीं लग पाएँगे',
  'settings.dataFolder.warning.valheimPath': {
    one: 'उस फ़ोल्डर में Valheim सर्वर {servers} के पाथ {length} अक्षरों तक पहुँच जाएँगे (Windows {max} तक मानता है)। अभी उसमें मॉड नहीं हैं और वह पहले जैसा चलता रहेगा, लेकिन उसमें मॉड नहीं लगाए जा सकेंगे।',
    other:
      'उस फ़ोल्डर में Valheim सर्वरों {servers} के पाथ {length} अक्षरों तक पहुँच जाएँगे (Windows {max} तक मानता है)। अभी उनमें मॉड नहीं हैं और वे पहले जैसे चलते रहेंगे, लेकिन उनमें मॉड नहीं लगाए जा सकेंगे।'
  },
  'settings.dataFolder.howTitle': 'यह कैसे होता है',
  'settings.dataFolder.howText':
    '{button} दबाने पर ऐप बंद होकर अपने आप फिर खुलेगा, ताकि कुछ भी शुरू होने से पहले डेटा ले जाया जा सके। आपको प्रगति दिखेगी; पूरा होने पर सब कुछ अभी जैसा ही रहेगा, बस नए फ़ोल्डर में।',
  'settings.dataFolder.apply': 'ले जाएँ और रीस्टार्ट करें',
  'settings.dataFolder.applying': 'रीस्टार्ट हो रहा है…',

  'relocation.movingTitle': 'QubiQ का डेटा ले जाया जा रहा है',
  'relocation.movingHint':
    'ऐप बंद न करें और कंप्यूटर बंद न करें। अगर बीच में रुक गया तो कुछ नहीं खोएगा: अगली बार खोलने पर यह फिर शुरू होगा।',
  'relocation.from': 'से',
  'relocation.to': 'तक',
  'relocation.phase.measuring': 'नापा जा रहा है कि क्या ले जाना है…',
  'relocation.phase.moving': 'ले जाया जा रहा है…',
  'relocation.phase.copying': 'कॉपी हो रहा है: {total} में से {copied}',
  'relocation.phase.verifying': 'जाँचा जा रहा है कि कॉपी हूबहू है…',
  'relocation.phase.cleaning': 'कॉपी जाँच ली गई। मूल फ़ोल्डर मिटाया जा रहा है…',
  'relocation.doneTitle': 'डेटा ले जाया गया',
  'relocation.firewallTitle': 'एक बात और',
  'relocation.firewall':
    'हर सर्वर को पहली बार चालू करने पर Windows पूछ सकता है कि क्या उसे नेटवर्क इस्तेमाल करने दें। हाँ करें, वरना आपके दोस्त जुड़ नहीं पाएँगे।',
  'relocation.leftoversTitle': 'पिछले फ़ोल्डर में कुछ चीज़ें रह गई हैं',
  'relocation.leftovers':
    'आपका पूरा डेटा नए फ़ोल्डर में है, लेकिन {path} के कुछ फ़ोल्डर (instances, runtimes, tools या cache) मिटाए नहीं जा सके। आप उन्हें हाथ से मिटा सकते हैं; पूरा फ़ोल्डर न मिटाएँ, उसमें लिखा है कि आपका डेटा अब कहाँ है।',
  'relocation.failedTitle': 'डेटा ले जाया नहीं जा सका',
  'relocation.untouched': 'आपका डेटा बिना बदलाव के वहीं है जहाँ था',
  'relocation.error.locked':
    'किसी प्रोग्राम ने डेटा की कोई फ़ाइल खोल रखी थी (कोई एंटीवायरस, Windows एक्सप्लोरर या QubiQ के बाहर खोला गया सर्वर)। उसे बंद करें और सेटिंग्स से फिर कोशिश करें।',
  'relocation.error.mismatch':
    'कॉपी मूल जैसी नहीं निकली (फ़ाइलें कम थीं या आकार अलग था), इसलिए कुछ भी नहीं मिटाया गया। जाँचें कि लक्ष्य ड्राइव ठीक काम कर रही है और फिर कोशिश करें।',
  'relocation.error.links':
    'डेटा के अंदर किसी दूसरे फ़ोल्डर ({path}) का लिंक है और इसे ड्राइवों के बीच कॉपी नहीं किया जा सकता। इसे हटाएँ या उसी ड्राइव पर फ़ोल्डर चुनें।',
  'relocation.error.missing': 'स्रोत फ़ोल्डर नहीं मिला, या लक्ष्य फ़ोल्डर उपलब्ध नहीं रहा।',
  'relocation.error.other': 'अनपेक्षित त्रुटि: {detail}',
  'relocation.continue': 'जारी रखें'
}
