import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'गेम सर्वर, बिना झंझट',
  'games.subtitleOne': '{game} सर्वर, बिना झंझट',
  'games.disclaimerAll':
    'QubiQ जिन गेमों को संभालता है, उनमें से किसी का आधिकारिक उत्पाद नहीं है और न ही उनके स्टूडियो से जुड़ा है।',
  'games.agreement.minecraft': 'Minecraft EULA',
  'games.agreement.steam': 'Steam सब्सक्राइबर समझौता',
  'games.tunnelExampleHost': 'kuchh',
  'games.upTo': '{n} तक',
  'games.upToComfortably': 'आराम से {n} तक',
  'games.alwaysPublic': 'हमेशा सार्वजनिक सूची में दिखता है',

  'games.port.game': 'गेम',
  'games.port.messaging': 'गेम संदेश',
  'games.port.playerData': 'खिलाड़ी डेटा',
  'games.port.steamQuery': 'Steam क्वेरी',
  'games.port.rustPlus': 'Rust+ (मोबाइल ऐप)',
  'games.port.tcpUdp': 'TCP और UDP',
  'games.port.udpTcp': 'UDP और TCP',
  'games.summary.custom': 'कस्टम',
  'games.summary.rustMap': 'मैप: {size}',

  'games.minecraft.tagline': 'बनाइए और ज़िंदा रहिए। वही क्लासिक, प्लगइन या मॉड के साथ।',
  'games.minecraft.players': 'लगभग 20 तक',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'प्लगइन और मॉड',
  'games.minecraft.startup': 'मॉड पर निर्भर: कुछ सेकंड से कुछ मिनट तक',
  'games.minecraft.ports': 'एक TCP (25565)',
  'games.minecraft.extra': 'Java: ऐप खुद डाउनलोड करता है',
  'games.minecraft.joinHint': 'Minecraft में: Multiplayer → Add Server।',
  'games.minecraft.backupScope':
    'दुनिया और कॉन्फ़िगरेशन सेव होते हैं। jar फ़ाइलों की ज़रूरत नहीं: उन्हें फिर से डाउनलोड किया जा सकता है।',

  'games.satisfactory.tagline': 'टीम में मिलकर बनाई गई विशाल फ़ैक्टरियाँ।',
  'games.satisfactory.players': '4 तक (बढ़ाया जा सकता है)',
  'games.satisfactory.download': '15.5 GB',
  'games.satisfactory.highlight1': 'गेम खोले बिना सेट होता है',
  'games.satisfactory.highlight2': 'एक समय में सिर्फ़ एक',
  'games.satisfactory.startup': 'लगभग 6 सेकंड',
  'games.satisfactory.ports': '7777 TCP और UDP पर, और 8888 TCP पर',
  'games.satisfactory.disclaimer':
    'अनौपचारिक टूल। Coffee Stain Studios या Satisfactory से संबद्ध नहीं।',
  'games.satisfactory.joinHint': 'Satisfactory में: Server Manager → Add Server, इस पते के साथ।',
  'games.satisfactory.join1': 'Satisfactory खोलें और मुख्य मेनू से “Server Manager” में जाएँ।',
  'games.satisfactory.join2': '“Add Server” दबाएँ और वहाँ पता पेस्ट करें।',
  'games.satisfactory.join3':
    'इसे संभालने के लिए यह एडमिन पासवर्ड माँगेगा (जो आपने सर्वर बनाते समय रखा था)।',
  'games.satisfactory.join4':
    'सर्वर आपकी सूची में रहेगा: “Join” दबाएँ और अगर आपने जुड़ने का पासवर्ड रखा है तो उसे लिखें।',
  'games.satisfactory.joinWarning':
    'सीधे IP से कनेक्शन काम नहीं करता: गेम को एक अनुमति चाहिए जो सिर्फ़ इसी तरह सर्वर जोड़ने पर मिलती है। ज़बरदस्ती करने पर Satisfactory “Encryption token missing” कहता है।',
  'games.satisfactory.backupScope':
    'सेव और सर्वर सेटिंग्स का बैकअप होता है। गेम की ज़रूरत नहीं: वह Steam से फिर डाउनलोड हो जाता है।',
  'games.satisfactory.moderationHint':
    'यह गेम बाहर से किसी को निकालने या बैन करने नहीं देता। अपने एडमिन पासवर्ड से गेम में जाएँ और गेम के मेनू से करें। अगर पूरी तरह रोकना हो, तो सर्वर बंद करें या सेटिंग्स में जुड़ने का पासवर्ड रखें।',

  'games.valheim.tagline': 'वाइकिंग दुनिया में ज़िंदा रहिए, बनाइए और बॉस को हराइए।',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'पोर्ट खोले बिना बाहर से खेला जा सकता है',
  'games.valheim.highlight2': 'सबसे हल्का',
  'games.valheim.highlight3': 'चलते-चलते मॉडरेशन नहीं',
  'games.valheim.startup': 'नई दुनिया के साथ 35 सेकंड, बाद में 12 सेकंड',
  'games.valheim.ports': 'दो UDP (2456 और 2457), या क्रॉसप्ले के साथ एक भी नहीं',
  'games.valheim.disclaimer': 'अनौपचारिक टूल। Iron Gate या Valheim से संबद्ध नहीं।',
  'games.valheim.joinHint': 'Valheim में: Join Game → Add server, इस पते के साथ।',
  'games.valheim.join1': 'Valheim खोलें, अपना किरदार चुनें और “Join Game” में जाएँ।',
  'games.valheim.join2': '“Add server” दबाएँ और पोर्ट सहित पता पेस्ट करें।',
  'games.valheim.join3': 'माँगे जाने पर सर्वर का पासवर्ड लिखें।',
  'games.valheim.join4': 'सर्वर आपके फ़ेवरिट में रहेगा: अगली बार बस “Connect” दबाएँ।',
  'games.valheim.crossplay2': '“Join by code” दबाएँ और ऐप का दिया 6 अंकों का कोड लिखें।',
  'games.valheim.crossplay4': 'हर बार सर्वर चालू होने पर कोड बदलता है: उसे फिर से भेजना होगा।',
  'games.valheim.backupScope':
    'दुनियाएँ और मॉडरेशन सूचियाँ सेव होती हैं। गेम की ज़रूरत नहीं: वह Steam से फिर डाउनलोड हो जाता है।',
  'games.valheim.moderationHint':
    'Valheim में मॉडरेशन Steam ID से होता है, नाम से नहीं: गेम किसी के किरदार का नाम नहीं बताता। किसी को बैन करने पर वह तुरंत निकल जाता है, और पूरी सूचियाँ (एडमिन, बैन और अनुमति वाले) कॉन्फ़िगरेशन → मॉडरेशन में हैं।',

  'games.factorio.tagline': 'मिलकर एक विशाल फ़ैक्टरी बनाइए और उसकी रक्षा कीजिए।',
  'games.factorio.highlight1': 'एक सेकंड में चालू',
  'games.factorio.highlight2': 'मॉड और Space Age के साथ',
  'games.factorio.highlight3': 'गेम आपके पास होना चाहिए',
  'games.factorio.startup': 'एक सेकंड',
  'games.factorio.ports': 'एक UDP (34197)',
  'games.factorio.extra': 'आपके Steam खाते में Factorio होना',
  'games.factorio.disclaimer': 'अनौपचारिक टूल। Wube Software या Factorio से संबद्ध नहीं।',
  'games.factorio.joinHint': 'Factorio में: Multiplayer → Connect to address।',
  'games.factorio.join1': 'Factorio खोलें और मुख्य मेनू से “Multiplayer” में जाएँ।',
  'games.factorio.join2': '“Connect to address” दबाएँ और पोर्ट सहित पता पेस्ट करें।',
  'games.factorio.join3': 'माँगे जाने पर सर्वर का पासवर्ड लिखें।',
  'games.factorio.join4': 'सभी के पास सर्वर वाला ही गेम वर्शन और वही मॉड होने चाहिए।',
  'games.factorio.joinWarning':
    'पासवर्ड छोड़ दिया तो Factorio बिना वजह बताए कनेक्शन काट देता है (सर्वर पर “PasswordMissing” दर्ज होता है)। और अगर आपका गेम सर्वर वाले वर्शन पर नहीं है, तो अंदर नहीं जाने देगा: वर्शन सर्वर की जानकारी में देखें।',
  'games.factorio.backupScope':
    'सेव, मॉड और मॉडरेशन सूचियाँ सेव होती हैं। गेम की ज़रूरत नहीं: वह Steam से फिर डाउनलोड हो जाता है।',
  'games.factorio.moderationHint':
    'Factorio में मॉडरेशन Factorio खाते के नाम से होता है, जो चैट में दिखता है। किसी को बैन करने पर वह तुरंत निकल जाता है।',

  'games.zomboid.tagline': 'ज़ॉम्बी महामारी में जितना हो सके उतना ज़िंदा रहिए।',
  'games.zomboid.download': '6.7 GB',
  'games.zomboid.highlight1': 'Minecraft जैसा मॉडरेशन और कमांड',
  'games.zomboid.highlight2': 'सैकड़ों गेम नियम',
  'games.zomboid.highlight3': 'चालू होने में एक मिनट से ज़्यादा',
  'games.zomboid.startup': 'लगभग 40 सेकंड (पहली बार डेढ़ मिनट)',
  'games.zomboid.ports': 'एक UDP (16261), Steam चालू होने पर दो',
  'games.zomboid.disclaimer':
    'अनौपचारिक टूल। The Indie Stone या Project Zomboid से संबद्ध नहीं।',
  'games.zomboid.joinHint': 'Project Zomboid में: Join → Favorites → Add server, इस पते के साथ।',
  'games.zomboid.join1': 'Project Zomboid खोलें और मुख्य मेनू से “Join” में जाएँ।',
  'games.zomboid.join2': '“Favorites” टैब में जाएँ और इस पते और पोर्ट के साथ “Add server” दबाएँ।',
  'games.zomboid.join3':
    'कोई भी यूज़रनेम और पासवर्ड लिखें: पहली बार खाता अपने आप बन जाता है।',
  'games.zomboid.join4':
    'अगर सर्वर पर पासवर्ड है, तो वह “Server password” वाले खाने में जाता है, जो आपके खाते के पासवर्ड से अलग है।',
  'games.zomboid.joinWarning':
    'आपका यूज़रनेम और पासवर्ड इस सर्वर के हैं, Steam के नहीं: पहली बार आप खुद बनाते हैं और उन्हीं से अपने किरदार पर लौटते हैं। गलत लिखा तो सर्वर नया खाता बनाने के बजाय कहेगा कि पासवर्ड अमान्य है।',
  'games.zomboid.backupScope':
    'गेम, सेटिंग्स और खातों का डेटाबेस (कौन एडमिन है और कौन बैन है) सेव होते हैं। गेम की ज़रूरत नहीं: वह Steam से फिर डाउनलोड हो जाता है।',
  'games.zomboid.moderationHint':
    'Zomboid में मॉडरेशन सर्वर खाते के नाम से होता है, Steam से नहीं। कमांड रिमोट कंसोल से जाते हैं, इसलिए सर्वर चालू होना चाहिए: बंद होने पर दिखता है कि कौन कौन है, पर कुछ बदला नहीं जा सकता।',

  'games.enshrouded.tagline': 'धुंध में डूबी दुनिया में ज़िंदा रहिए, बनाइए और खोजिए।',
  'games.enshrouded.download': '8.8 GB',
  'games.enshrouded.highlight1': '3 सेकंड में चालू',
  'games.enshrouded.highlight2': 'पासवर्ड से अनुमतियाँ',
  'games.enshrouded.startup': '2 से 4 सेकंड',
  'games.enshrouded.ports': 'एक UDP (15637)',
  'games.enshrouded.extra': 'हमेशा गेम की सार्वजनिक सूची में दिखता है',
  'games.enshrouded.disclaimer': 'अनौपचारिक टूल। Keen Games या Enshrouded से संबद्ध नहीं।',
  'games.enshrouded.joinHint': 'Enshrouded में: Play → Servers → Add server, इस पते के साथ।',
  'games.enshrouded.join1': 'Enshrouded खोलें और Play मेनू से “Servers” में जाएँ।',
  'games.enshrouded.join2': '“Add server” दबाएँ और पोर्ट सहित पता पेस्ट करें।',
  'games.enshrouded.join3':
    'आपको दी गई भूमिका का पासवर्ड लिखें: पासवर्ड ही तय करता है कि आप अंदर क्या कर सकते हैं।',
  'games.enshrouded.join4':
    'सर्वर आपके फ़ेवरिट में रहेगा, जहाँ वह तब भी दिखता है जब सार्वजनिक सूची देर से ताज़ा होती है।',
  'games.enshrouded.joinWarning':
    'Enshrouded में एक सर्वर पासवर्ड नहीं, बल्कि हर भूमिका का अलग पासवर्ड होता है। Admin वाले से आप निकाल और बैन कर सकते हैं; Guest वाले से संदूक भी नहीं खोल सकते। गलत पासवर्ड मिला तो भी अंदर जाएँगे, पर दूसरी अनुमतियों के साथ।',
  'games.enshrouded.backupScope':
    'दुनियाएँ और कॉन्फ़िगरेशन, भूमिकाओं और बैन के साथ, सेव होते हैं। गेम की ज़रूरत नहीं: वह Steam से फिर डाउनलोड हो जाता है। सर्वर चालू हो तो बैकअप उसके किसी सेव के ठीक बाद लिया जाता है, जो हर पाँच मिनट में होता है।',
  'games.enshrouded.moderationHint':
    'Enshrouded गेम के बाहर से किसी को निकालने नहीं देता: उसका अपना सर्वर कहता है कि डेडिकेटेड सर्वर पर निकालना “लागू नहीं है”। यहाँ से बैन हटाया जा सकता है, और गेम के अंदर Admin पासवर्ड से बैन किया जा सकता है (Social टैब)।',

  'games.rust.tagline': 'ज़िंदा रहिए, बेस बनाइए और उसकी रक्षा कीजिए। हर महीने नया मैप।',
  'games.rust.players': 'घरेलू PC पर {n} तक',
  'games.rust.download': '5.5 GB',
  'games.rust.highlight1': 'चलते-चलते मॉडरेशन',
  'games.rust.highlight2': 'Oxide से प्लगइन',
  'games.rust.highlight3': 'हर महीने नया मैप',
  'games.rust.startup': 'पहली बार 2 से 5 मिनट (मैप बनाता है), बाद में लगभग 13 सेकंड',
  'games.rust.ports': 'दो UDP (28015 और 28017), और Rust+ के साथ एक TCP और',
  'games.rust.extra': 'हमेशा सार्वजनिक सूची में दिखता है; हर महीने नया मैप',
  'games.rust.disclaimer': 'अनौपचारिक टूल। Facepunch Studios या Rust से संबद्ध नहीं।',
  'games.rust.joinHint': 'Rust में: F1 दबाएँ और “client.connect” के बाद यह पता लिखें।',
  'games.rust.join1': 'Rust खोलें और मुख्य मेनू आने तक रुकें।',
  'games.rust.join2': 'गेम कंसोल खोलने के लिए F1 दबाएँ।',
  'games.rust.join3':
    '“client.connect” और पोर्ट सहित पता लिखें, जैसे: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Enter दबाएँ। इसके बाद अगली बार के लिए यह सर्वर सूची में “History” में दिखेगा।',
  'games.rust.joinWarning':
    'अगर सर्वर पर अभी महीना बदला है और उसे अपडेट नहीं किया गया, तो Rust आपको अंदर नहीं जाने देगा: कहेगा कि वर्शन मेल नहीं खाता। यह हर महीने के पहले गुरुवार को होता है; कॉन्फ़िगरेशन → वाइप देखें।',
  'games.rust.backupScope':
    'सब कुछ बने हुए मैप, खिलाड़ी, एडमिन और बैन, और प्लगइन उनकी कॉन्फ़िगरेशन के साथ सेव होते हैं। गेम की ज़रूरत नहीं: वह Steam से फिर डाउनलोड हो जाता है।',
  'games.rust.moderationHint':
    'Rust में मॉडरेशन Steam ID से होता है, भले ही सूची नाम दिखाए। निकालना और बैन करना तुरंत असर करते हैं; एडमिन और बैन कॉन्फ़िगरेशन → मॉडरेशन में हैं।'
}
