const { sendTemplateEmail, deliverEmail, composeTemplateMessage } = require('../email');
const { User, ReturnItem } = require('../../models');
const policy = require('./policy');
const { toMinor } = require('./refundCalculator');
const { formatMoney, formatDate, returnActionUrl, tokenFor } = require('./format');

function breakdownText(items, request, language) {
  const lines = items.map((item) => {
    const explanation = item.calculationBreakdown?.explanation;
    if (explanation?.text) return `${item.titleSnapshot} ×${item.quantity}\n${explanation.text}`;
    return `${item.titleSnapshot} ×${item.quantity} : ${formatMoney(toMinor(item.refundAmount), request.currency, language)}`;
  });
  if (!lines.length) {
    lines.push(formatMoney(toMinor(request.refundAmount), request.currency, language));
  }
  return lines.join('\n\n');
}

/**
 * Sends one lifecycle email of a return request. Text lives in the email_templates
 * table; the admin can override a message through the return policy settings.
 */
async function notifyReturn({ code, request, settings = null, language = 'ar', extra = {} }) {
  const activeSettings = settings || await policy.getReturnPolicy();
  const locale = tokenFor(language);
  const user = request.user || await User.findByPk(request.userId);
  if (!user?.email) return false;
  const items = request.items?.length
    ? request.items
    : await ReturnItem.findAll({ where: { returnRequestId: request.id } });

  const refundMinor = items.reduce((sum, item) => sum + toMinor(item.refundAmount), 0);
  const variables = {
    firstName: user.firstName || '',
    rmaNumber: request.rmaNumber,
    orderId: request.orderId || request.mysteryBoxPurchaseId || '',
    bookTitles: items.map((item) => `${item.titleSnapshot} ×${item.quantity}`).join(', '),
    refundAmount: extra.refundAmount || formatMoney(refundMinor, request.currency, locale),
    shipBackDeadline: formatDate(request.shipBackDeadline, locale) || '—',
    returnAddress: policy.formatReturnAddress(activeSettings.returnAddress, '—'),
    returnInstructions: policy.returnInstructions(activeSettings, locale, request.isSellerFault),
    reason: extra.reason || request.rejectionReason || request.reasonDetails || '',
    inspectionNotes: extra.inspectionNotes || request.inspectionNotes || '',
    refundDeadlineDays: String(activeSettings.refundDeadlineDays || 14),
    bankDelay: String(extra.bankDelay || activeSettings.refundDeadlineDays || 14),
    daysLeft: extra.daysLeft || '',
    refundBreakdown: extra.refundBreakdown || breakdownText(items, request, locale),
    actionUrl: extra.actionUrl || returnActionUrl(request.id, locale)
  };

  const override = activeSettings.emailTemplates?.[code]?.[locale];
  if (override?.subject?.trim() && override?.body?.trim()) {
    const message = composeTemplateMessage({
      templateCode: code,
      template: { translations: { [locale]: override } },
      language: locale,
      variables
    });
    if (message) {
      await deliverEmail({
        to: user.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        purpose: `return:${code}`
      });
      return true;
    }
  }

  const sent = await sendTemplateEmail({
    templateCode: code,
    to: user.email,
    language: locale,
    variables,
    purpose: `return:${code}`
  });
  if (!sent) console.warn(`Modèle d’e-mail de retour introuvable ou inactif : ${code}.`);
  return sent;
}

module.exports = { notifyReturn, breakdownText };
