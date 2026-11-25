const PALETTE = {
  page: '#f2f6f4',
  card: '#ffffff',
  border: '#e3ece7',
  ink: '#12241f',
  body: '#3f544d',
  muted: '#71887f',
  brand: '#0b6b50',
  brandDeep: '#08523d',
  mint: '#eef8f2',
  mintBorder: '#cfe8dc',
  soft: '#fbfdfc'
};

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const STRINGS = {
  fr: {
    lang: 'fr',
    dir: 'ltr',
    monogram: 'IS',
    brand: 'Islamic Stories',
    tagline: 'Des histoires pour toute la famille',
    codeLabel: 'Votre code',
    buttonFallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    footerNote: 'Vous recevez cet e-mail parce qu’une action a été demandée avec cette adresse sur Islamic Stories.',
    signoff: 'L’équipe Islamic Stories',
    defaultAction: 'Ouvrir Islamic Stories'
  },
  en: {
    lang: 'en',
    dir: 'ltr',
    monogram: 'IS',
    brand: 'Islamic Stories',
    tagline: 'Stories for the whole family',
    codeLabel: 'Your code',
    buttonFallback: 'If the button does not work, copy this link into your browser:',
    footerNote: 'You are receiving this email because an action was requested with this address on Islamic Stories.',
    signoff: 'The Islamic Stories team',
    defaultAction: 'Open Islamic Stories'
  },
  ar: {
    lang: 'ar',
    dir: 'rtl',
    monogram: 'ح',
    brand: 'حكايات إسلامية',
    tagline: 'حكايات وقصص لكل أفراد العائلة',
    codeLabel: 'رمزك',
    buttonFallback: 'إذا لم يعمل الزر، انسخ هذا الرابط إلى متصفحك:',
    footerNote: 'وصلتك هذه الرسالة لأن طلبًا تم باستخدام هذا العنوان في حكايات إسلامية.',
    signoff: 'فريق حكايات إسلامية',
    defaultAction: 'افتح حكايات إسلامية'
  }
};

const TEMPLATE_COPY = {
  order_confirmation: {
    fr: { title: 'Commande confirmée', action: 'Voir ma commande' },
    en: { title: 'Order confirmed', action: 'View my order' },
    ar: { title: 'تم تأكيد الطلب', action: 'عرض طلبي' }
  },
  subscription_renewal: {
    fr: { title: 'Abonnement renouvelé', action: 'Gérer mon abonnement' },
    en: { title: 'Subscription renewed', action: 'Manage my subscription' },
    ar: { title: 'تم تجديد الاشتراك', action: 'إدارة اشتراكي' }
  },
  quiz_result: {
    fr: { title: 'Votre résultat', action: 'Voir mon résultat' },
    en: { title: 'Your result', action: 'View my result' },
    ar: { title: 'نتيجتك', action: 'عرض نتيجتي' }
  },
  story_published: {
    fr: { title: 'Une nouvelle histoire', action: 'Lire l’histoire' },
    en: { title: 'A new story', action: 'Read the story' },
    ar: { title: 'قصة جديدة', action: 'اقرأ القصة' }
  },
  donation_receipt: {
    fr: { title: 'Merci pour votre don', action: 'Voir mon reçu' },
    en: { title: 'Thank you for your donation', action: 'View my receipt' },
    ar: { title: 'شكرًا لتبرعك', action: 'عرض الإيصال' }
  },
  continue_reading: {
    fr: { title: 'Reprenez votre lecture', action: 'Reprendre la lecture' },
    en: { title: 'Pick up where you left off', action: 'Continue reading' },
    ar: { title: 'تابع القراءة', action: 'متابعة القراءة' }
  },
  mystery_box_purchase: {
    fr: { title: 'Votre box est confirmée', action: 'Voir ma box' },
    en: { title: 'Your box is confirmed', action: 'View my box' },
    ar: { title: 'تم تأكيد صندوقك', action: 'عرض صندوقي' }
  },
  mystery_box_shipping: {
    fr: { title: 'Votre box est en route', action: 'Suivre ma livraison' },
    en: { title: 'Your box is on its way', action: 'Track my delivery' },
    ar: { title: 'صندوقك في الطريق', action: 'تتبع الشحنة' }
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function copyFor(language) {
  return STRINGS[language] || STRINGS.fr;
}

function templateCopy(code, language) {
  const entry = TEMPLATE_COPY[code];
  const copy = entry?.[language] || entry?.fr;
  return {
    title: copy?.title || '',
    action: copy?.action || copyFor(language).defaultAction
  };
}

function codeBlock({ code, label, font, dir }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border:1px solid ${PALETTE.mintBorder};border-radius:12px;background:${PALETTE.mint}">
<tr><td align="center" style="padding:20px 16px 22px">
<div style="font-family:${font};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${PALETTE.brand}">${escapeHtml(label)}</div>
<div class="email-code" style="margin-top:10px;font-family:'Courier New',Courier,monospace;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:8px;text-indent:8px;color:${PALETTE.brandDeep};direction:ltr;unicode-bidi:embed">${escapeHtml(code)}</div>
</td></tr></table>`;
}

function actionBlock({ actionUrl, actionLabel, font, align }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0">
<tr><td align="${align}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${PALETTE.brand}" style="border-radius:10px">
<a class="email-btn" href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 26px;font-family:${font};font-size:15px;line-height:1;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(actionLabel)}</a>
</td></tr></table>
</td></tr></table>`;
}

function noteBlock({ note, font, dir }) {
  const gapSide = dir === 'rtl' ? 'border-right' : 'border-left';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0">
<tr><td style="background:${PALETTE.soft};border:1px solid ${PALETTE.border};${gapSide}:3px solid ${PALETTE.mintBorder};border-radius:10px;padding:14px 16px">
<p style="margin:0;font-family:${font};font-size:13px;line-height:1.65;color:${PALETTE.muted}">${escapeHtml(note)}</p>
</td></tr></table>`;
}

function renderEmail({
  language = 'fr',
  preheader = '',
  title = '',
  intro = '',
  code = '',
  codeLabel = '',
  bodyHtml = '',
  actionUrl = '',
  actionLabel = '',
  footnote = '',
  note = ''
} = {}) {
  const copy = copyFor(language);
  const dir = copy.dir;
  const align = dir === 'rtl' ? 'right' : 'left';
  const gapSide = dir === 'rtl' ? 'padding-right' : 'padding-left';
  const font = FONT;
  const sections = [];

  if (title) {
    sections.push(`<h1 style="margin:26px 0 0;font-family:${font};font-size:23px;line-height:1.35;font-weight:700;color:${PALETTE.ink};letter-spacing:-0.2px">${escapeHtml(title)}</h1>`);
  }
  if (intro) {
    sections.push(`<p style="margin:12px 0 0;font-family:${font};font-size:15px;line-height:1.7;color:${PALETTE.body}">${escapeHtml(intro)}</p>`);
  }
  if (code) {
    sections.push(codeBlock({ code, label: codeLabel || copy.codeLabel, font, dir }));
  }
  if (bodyHtml) {
    sections.push(bodyHtml);
  }
  if (actionUrl && actionLabel) {
    sections.push(actionBlock({ actionUrl, actionLabel, font, align }));
    sections.push(`<p style="margin:14px 0 0;font-family:${font};font-size:12px;line-height:1.6;color:${PALETTE.muted}">${escapeHtml(copy.buttonFallback)}<br><a href="${escapeHtml(actionUrl)}" style="color:${PALETTE.brand};text-decoration:underline;word-break:break-all">${escapeHtml(actionUrl)}</a></p>`);
  }
  if (footnote) {
    sections.push(`<p style="margin:20px 0 0;font-family:${font};font-size:13px;line-height:1.65;color:${PALETTE.muted}">${escapeHtml(footnote)}</p>`);
  }
  if (note) {
    sections.push(noteBlock({ note, font, dir }));
  }
  sections.push(`<p style="margin:26px 0 0;font-family:${font};font-size:14px;line-height:1.6;color:${PALETTE.body}">${escapeHtml(copy.signoff)}</p>`);

  return `<!DOCTYPE html>
<html lang="${copy.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(title || copy.brand)}</title>
<style>
  @media only screen and (max-width:620px) {
    .email-wrap { padding:16px 12px !important; }
    .email-card-body { padding:24px 22px 26px !important; }
    .email-card-head { padding:24px 22px 0 !important; }
    .email-card-foot { padding:18px 22px 22px !important; }
    .email-code { font-size:27px !important; letter-spacing:5px !important; }
    .email-btn { display:block !important; padding:15px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PALETTE.page};-webkit-font-smoothing:antialiased">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:transparent">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PALETTE.page}">
<tr><td class="email-wrap" align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:16px;overflow:hidden">
<tr><td style="height:4px;background:${PALETTE.brand};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="email-card-head" style="padding:30px 34px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="44" valign="middle" style="width:44px"><div style="width:44px;height:44px;border-radius:13px;background:${PALETTE.brand};color:#ffffff;font-family:${font};font-size:16px;line-height:44px;font-weight:700;text-align:center">${escapeHtml(copy.monogram)}</div></td>
<td valign="middle" style="${gapSide}:12px"><div style="font-family:${font};font-size:16px;line-height:1.35;font-weight:700;color:${PALETTE.ink}">${escapeHtml(copy.brand)}</div><div style="margin-top:2px;font-family:${font};font-size:12px;line-height:1.4;color:${PALETTE.muted}">${escapeHtml(copy.tagline)}</div></td>
</tr></table>
</td></tr>
<tr><td class="email-card-body" style="padding:6px 34px 30px;text-align:${align}">
${sections.join('\n')}
</td></tr>
<tr><td class="email-card-foot" style="padding:20px 34px 24px;background:${PALETTE.soft};border-top:1px solid ${PALETTE.border};text-align:${align}">
<p style="margin:0;font-family:${font};font-size:12px;line-height:1.65;color:${PALETTE.muted}">${escapeHtml(copy.footerNote)}</p>
</td></tr>
</table>
<p style="margin:18px 0 0;font-family:${font};font-size:11px;line-height:1.6;color:${PALETTE.muted}">© ${new Date().getFullYear()} ${escapeHtml(copy.brand)}</p>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Plain-text alternative built from the same content as the HTML version, so clients that block
 * HTML still show a complete, readable message.
 */
function renderEmailText({
  language = 'fr',
  title = '',
  intro = '',
  code = '',
  codeLabel = '',
  bodyText = '',
  actionUrl = '',
  actionLabel = '',
  footnote = '',
  note = ''
} = {}) {
  const copy = copyFor(language);
  const sections = [`${copy.brand}\n${copy.tagline}`];

  if (title) sections.push(title);
  if (intro) sections.push(intro);
  if (code) sections.push(`${(codeLabel || copy.codeLabel).toUpperCase()}\n${code}`);
  if (bodyText) sections.push(String(bodyText).trim());
  if (actionUrl && actionLabel) sections.push(`${actionLabel}\n${actionUrl}`);
  if (footnote) sections.push(footnote);
  if (note) sections.push(note);
  sections.push(copy.signoff);
  sections.push(`${copy.footerNote}\n© ${new Date().getFullYear()} ${copy.brand}`);

  return sections.join('\n\n');
}

/** Builds the HTML and plain-text versions of one message from a single set of values. */
function composeEmail(options = {}) {
  return {
    html: renderEmail(options),
    text: renderEmailText(options)
  };
}

function textToEmailHtml(text, language = 'fr') {
  const copy = copyFor(language);
  const dir = copy.dir;
  const align = dir === 'rtl' ? 'right' : 'left';
  const valueGap = dir === 'rtl' ? 'padding-right:16px' : 'padding-left:16px';
  const blocks = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length >= 2 && lines.every((line) => /^[^:]{1,48}:\s*\S/.test(line))) {
      const rows = lines.map((line) => {
        const separator = line.indexOf(':');
        return `<tr>
<td style="padding:7px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${PALETTE.muted};vertical-align:top;white-space:nowrap">${escapeHtml(line.slice(0, separator).trim())}</td>
<td style="padding:7px 0;${valueGap};font-family:${FONT};font-size:14px;line-height:1.5;font-weight:600;color:${PALETTE.ink};text-align:${align}">${escapeHtml(line.slice(separator + 1).trim())}</td>
</tr>`;
      }).join('\n');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;border-top:1px solid ${PALETTE.border};border-bottom:1px solid ${PALETTE.border}">${rows}</table>`;
    }
    if (lines.every((line) => /^[-•*]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li style="margin:6px 0">${escapeHtml(line.replace(/^[-•*]\s+/, ''))}</li>`)
        .join('');
      return `<ul style="margin:14px 0 0;padding-${dir === 'rtl' ? 'right' : 'left'}:20px;font-family:${FONT};font-size:15px;line-height:1.7;color:${PALETTE.body}">${items}</ul>`;
    }
    return `<p style="margin:14px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${PALETTE.body}">${lines.map(escapeHtml).join('<br>')}</p>`;
  }).join('\n');
}

module.exports = {
  renderEmail,
  renderEmailText,
  composeEmail,
  textToEmailHtml,
  templateCopy,
  escapeHtml,
  PALETTE,
  FONT
};
