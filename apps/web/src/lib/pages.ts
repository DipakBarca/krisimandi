/** Long-form pages (help, terms, privacy) in both languages. Kept apart from the short UI texts. */
export type Section = { title: string; body?: string; items?: string[] };
export type Doc = { title: string; intro: string; sections: Section[] };
export type DocName = 'help' | 'terms' | 'privacy';

export const pages: Record<DocName, { ne: Doc; en: Doc }> = {
  help: {
    ne: {
      title: 'कसरी प्रयोग गर्ने',
      intro: 'कृषिमण्डीमा किसानले खेतबाटै बाली बेच्नुहुन्छ र खरिदकर्ताले मूल्य प्रस्ताव वा बोली लगाउनुहुन्छ। पाइलट अवधिमा यो निःशुल्क छ।',
      sections: [
        {
          title: 'सुरु गर्न',
          items: [
            'आफ्नो मोबाइल नम्बर लेख्नुहोस्। SMS मा ६ अङ्कको कोड आउँछ।',
            'नाम, वडा र गाउँ भर्नुहोस्। किसान, खरिदकर्ता वा दुवै छान्नुहोस्।',
            'नागरिकता वा प्यान कार्डको फोटो पठाएमा प्रशासकले जाँचेर ✓ प्रमाणित चिन्ह दिनुहुन्छ।',
          ],
        },
        {
          title: 'किसानका लागि: बाली बेच्ने',
          items: [
            '"मेरो बाली" मा गएर नयाँ बाली राख्नुहोस्: बाली, परिमाण, मूल्य, फोटो र उपलब्ध मिति।',
            'निश्चित मूल्यमा बेच्दा खरिदकर्ताले प्रस्ताव पठाउनुहुन्छ। स्वीकार, अस्वीकार वा जवाफी मूल्य दिन सक्नुहुन्छ।',
            'बोलकबोलमा सकिने समयमा सबैभन्दा माथिको बोली जित्छ। २४ घण्टाभित्र विजेता पक्का गर्नुहोस् वा अर्कोलाई दिनुहोस्।',
          ],
        },
        {
          title: 'खरिदकर्ताका लागि: किन्ने',
          items: [
            'बजारमा बाली, ठाउँ, मूल्य वा नजिकको दूरीले खोज्नुहोस्।',
            'निश्चित मूल्यको बालीमा आफ्नो मूल्य, परिमाण र लिने मिति राखेर प्रस्ताव पठाउनुहोस्।',
            'बोलकबोलमा न्यूनतम बोलीभन्दा माथि बोल्नुहोस्। अन्तिम ५ मिनेटमा बोली परे ५ मिनेट थपिन्छ।',
            'मन परेका बाली ♥ ले सुरक्षित गर्नुहोस् र नयाँ बाली आउँदा सूचना पाउन बाली छान्नुहोस्।',
          ],
        },
        {
          title: 'सौदा पक्का भएपछि',
          items: [
            'सौदा पक्का भएपछि दुवैले एकअर्काको फोन नम्बर देख्नुहुन्छ।',
            'किसानले "लिन तयार छ" थिच्नुहुन्छ र लिने समय र ठाउँ राख्नुहुन्छ।',
            'भुक्तानी आपसमा नगद वा बैंकबाट गर्नुहोस्। खरिदकर्ताले "मैले तिरेँ", किसानले "पैसा पाएँ" थिच्नुहुन्छ।',
            'सामान लगेपछि र पैसा पाएपछि सौदा सम्पन्न हुन्छ। अनि एकअर्कालाई तारा र समीक्षा दिनुहोस्।',
            'हरेक सौदा एपको सौदा रेकर्डबाट हुनुपर्छ। रेकर्ड नभएको सौदा रद्द मानिन्छ।',
          ],
        },
        {
          title: 'समस्या परेमा',
          items: [
            'पहिले अर्को पक्षसँग फोनमा मिलाउनुहोस्।',
            'नमिलेमा व्यक्ति, बाली वा सौदाको पेजमा "उजुरी गर्नुहोस्" थिच्नुहोस्। प्रशासकले फोन गरेर बुझ्नुहुन्छ।',
            'आफ्ना उजुरीको अवस्था प्रोफाइलको "मेरा उजुरी" मा हेर्न सक्नुहुन्छ।',
          ],
        },
        {
          title: 'फोनमा एप राख्ने',
          body: 'Chrome मा कृषिमण्डी खोलेपछि "फोनमा राख्नुहोस्" थिच्नुहोस्, वा मेनु (⋮) बाट "Add to Home screen" छान्नुहोस्। iPhone मा Share बाट "Add to Home Screen" छान्नुहोस्।',
        },
      ],
    },
    en: {
      title: 'How to use KrisiMandi',
      intro: 'On KrisiMandi farmers sell their harvest from the farm, and buyers make offers or bid. It is free during the pilot.',
      sections: [
        {
          title: 'Getting started',
          items: [
            'Enter your mobile number. A 6-digit code arrives by SMS.',
            'Fill in your name, ward and village. Choose farmer, buyer or both.',
            'Send a photo of your citizenship or PAN card and an admin will check it and give you the ✓ verified badge.',
          ],
        },
        {
          title: 'For farmers: selling',
          items: [
            'Go to "My harvest" and add a listing: crop, quantity, price, photos and dates.',
            'At a fixed price, buyers send offers. You can accept, turn down or counter.',
            'In an auction the highest bid at the end wins. Confirm the winner within 24 hours, or pass to the next bidder.',
          ],
        },
        {
          title: 'For buyers: buying',
          items: [
            'Search the market by crop, place, price or distance.',
            'On a fixed-price listing, send an offer with your price, quantity and pickup date.',
            'In an auction, bid at least the minimum. A bid in the last 5 minutes adds 5 minutes.',
            'Save listings with ♥, and choose crops to hear about new listings.',
          ],
        },
        {
          title: 'After a deal is agreed',
          items: [
            'Both sides see each other’s phone number.',
            'The farmer taps "Ready for pickup" and sets the pickup time and place.',
            'Pay each other directly in cash or by bank. The buyer taps "I have paid", the farmer taps "Money received".',
            'The deal completes once it is picked up and paid. Then rate each other.',
            'Every deal must go through its deal record in the app. A deal without one counts as cancelled.',
          ],
        },
        {
          title: 'If something goes wrong',
          items: [
            'First try to sort it out with the other side by phone.',
            'If that does not work, tap "Report" on the person, listing or deal page. An admin will call to follow up.',
            'See your reports under "My reports" on your profile.',
          ],
        },
        {
          title: 'Adding the app to your phone',
          body: 'Open KrisiMandi in Chrome and tap "Add to phone", or choose "Add to Home screen" from the menu (⋮). On iPhone, use Share, then "Add to Home Screen".',
        },
      ],
    },
  },
  terms: {
    ne: {
      title: 'प्रयोगका सर्तहरू',
      intro: 'कृषिमण्डी प्रयोग गर्दा तपाईं यी सर्त मान्नुहुन्छ। यो पाइलट संस्करण हो र सर्तहरू समयसँगै बदलिन सक्छन्; बदलिएमा एपमा जानकारी दिइनेछ।',
      sections: [
        {
          title: 'कृषिमण्डीको भूमिका',
          items: [
            'कृषिमण्डीले किसान र खरिदकर्तालाई भेट गराउने ठाउँ मात्र दिन्छ। बिक्री किसान र खरिदकर्ताबीच हुन्छ।',
            'पाइलट अवधिमा कुनै शुल्क लाग्दैन। भुक्तानी एपबाहिर आपसमा हुन्छ; कृषिमण्डीले पैसा राख्दैन।',
          ],
        },
        {
          title: 'तपाईंको जिम्मेवारी',
          items: [
            'आफ्नै मोबाइल नम्बर र सही नाम प्रयोग गर्नुहोस्। एक व्यक्तिको एउटा खाता।',
            'बालीको परिमाण, गुणस्तर, मूल्य र फोटो सही राख्नुहोस्।',
            'स्वीकार गरेको प्रस्ताव वा जितेको बोलीअनुसार सौदा पूरा गर्नुहोस्।',
            'हरेक सौदा एपको सौदा रेकर्डबाट गर्नुहोस्। रेकर्ड नभएको सौदा रद्द मानिन्छ।',
            'अरूलाई अपमान, धम्की वा ठगी नगर्नुहोस्।',
          ],
        },
        {
          title: 'विवाद',
          body: 'विवाद पहिले दुवै पक्षले आपसमा मिलाउनुहुन्छ। नमिलेमा जुनसुकै पक्षले एपबाट उजुरी गर्न सक्नुहुन्छ र प्रशासकले बुझेर सहयोग गर्नुहुन्छ। प्रशासकले पैसा फिर्ता गराउने ग्यारेन्टी गर्न सक्दैन।',
        },
        {
          title: 'प्रशासकले गर्न सक्ने कारबाही',
          body: 'नियम नमानेमा प्रशासकले बाली हटाउन वा खाता निलम्बन गर्न सक्नुहुन्छ। बाली हटाउँदा कारण जानकारी दिइन्छ।',
        },
        {
          title: 'सेवा',
          body: 'हामी एप चलिरहोस् भनेर प्रयास गर्छौं, तर इन्टरनेट वा SMS समस्याले कहिलेकाहीँ अवरोध हुन सक्छ। यसबाट हुने हानिको जिम्मा कृषिमण्डीले लिँदैन।',
        },
      ],
    },
    en: {
      title: 'Terms of use',
      intro: 'By using KrisiMandi you agree to these terms. This is a pilot and the terms may change; we will tell you in the app if they do.',
      sections: [
        {
          title: 'What KrisiMandi does',
          items: [
            'KrisiMandi is a place for farmers and buyers to meet. Sales are between the farmer and the buyer.',
            'There are no fees during the pilot. Payment happens outside the app between the two sides; KrisiMandi does not hold money.',
          ],
        },
        {
          title: 'Your responsibilities',
          items: [
            'Use your own mobile number and real name. One account per person.',
            'Describe quantity, quality, price and photos honestly.',
            'Complete deals as agreed in an accepted offer or a won auction.',
            'Every deal must go through its deal record in the app. A deal without one counts as cancelled.',
            'Do not insult, threaten or cheat others.',
          ],
        },
        {
          title: 'Disputes',
          body: 'The two sides settle disputes between themselves first. Either side can file a complaint in the app, and an admin will follow up and help. Admins cannot guarantee refunds.',
        },
        {
          title: 'What admins can do',
          body: 'If the rules are broken, admins can remove listings or suspend accounts. When a listing is removed, the reason is given.',
        },
        {
          title: 'The service',
          body: 'We try to keep the app running, but internet or SMS problems can sometimes interrupt it. KrisiMandi is not responsible for losses caused by such interruptions.',
        },
      ],
    },
  },
  privacy: {
    ne: {
      title: 'गोपनीयता',
      intro: 'हामी तपाईंको जानकारी कसरी राख्छौं र प्रयोग गर्छौं भन्ने यहाँ छ।',
      sections: [
        {
          title: 'हामीले राख्ने जानकारी',
          items: [
            'मोबाइल नम्बर, नाम, फोटो, वडा र गाउँ।',
            'तपाईंले राखेका बाली, फोटो, स्थान, प्रस्ताव, बोली, सन्देश, सौदा र समीक्षा।',
            'प्रमाणीकरणका लागि पठाएका कागजात।',
          ],
        },
        {
          title: 'अरूले के देख्छन्',
          items: [
            'अरूले तपाईंको नाम, गाउँ, वडा, बाली र समीक्षा देख्छन्।',
            'बालीको ठाउँ करिब १ किलोमिटरसम्म मात्र देखाइन्छ; ठ्याक्कै ठाउँ तपाईंलाई मात्र देखिन्छ।',
            'फोन नम्बर सौदा पक्का भएपछि मात्र अर्को पक्षले देख्छ।',
            'प्रमाणीकरणका कागजात प्रशासकले मात्र हेर्न सक्नुहुन्छ।',
          ],
        },
        {
          title: 'प्रयोग',
          items: [
            'साइन-इन कोड पठाउन, सौदा चलाउन, सूचना दिन र उजुरी बुझ्न।',
            'तपाईंको जानकारी बेच्दैनौं र विज्ञापनका लागि दिँदैनौं।',
            'SMS पठाउन नम्बर SMS सेवा प्रदायकलाई मात्र दिइन्छ।',
          ],
        },
        {
          title: 'सुरक्षा र अभिलेख',
          body: 'जानकारी सुरक्षित सर्भरमा राखिन्छ र दैनिक ब्याकअप हुन्छ। प्रशासकले गरेका काम र सौदाका परिवर्तनको अभिलेख राखिन्छ।',
        },
        {
          title: 'खाता हटाउन',
          body: 'खाता वा जानकारी हटाउन चाहनुहुन्छ भने सहयोग नम्बरमा फोन गर्नुहोस्। सौदाको अभिलेख विवाद समाधानका लागि केही समय राखिन सक्छ।',
        },
      ],
    },
    en: {
      title: 'Privacy',
      intro: 'This is how we keep and use your information.',
      sections: [
        {
          title: 'What we keep',
          items: [
            'Your mobile number, name, photo, ward and village.',
            'Your listings, photos, locations, offers, bids, messages, deals and reviews.',
            'Documents you send for verification.',
          ],
        },
        {
          title: 'What others see',
          items: [
            'Others see your name, village, ward, listings and reviews.',
            'A listing’s location is shown to about 1 km; only you see the exact spot.',
            'Your phone number is shown to the other side only once a deal is agreed.',
            'Verification documents are seen only by admins.',
          ],
        },
        {
          title: 'How we use it',
          items: [
            'To send sign-in codes, run deals, send notices and follow up complaints.',
            'We do not sell your information or give it to advertisers.',
            'Your number is shared with the SMS provider only to send codes.',
          ],
        },
        {
          title: 'Security and records',
          body: 'Data is kept on a secured server with daily backups. Admin actions and changes to deals are recorded.',
        },
        {
          title: 'Removing your account',
          body: 'To remove your account or information, call the support number. Deal records may be kept for a while to settle disputes.',
        },
      ],
    },
  },
};
