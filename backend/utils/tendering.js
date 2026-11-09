function canBuyerViewOffers(tender, now = new Date()) {
  return tender.sealedOffers === false || new Date(tender.deadline) <= now;
}

module.exports = { canBuyerViewOffers };
