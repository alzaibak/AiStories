const User = require('./User');
const Category = require('./Category');
const Product = require('./Product');
const tendering = require('./tendering');
const storyPlatform = require('./storyPlatform');

const { Organization, Tender, TenderItem, TenderInvitation, Offer, OfferItem, Document, Clarification, Message, PurchaseOrder, AuditLog } = tendering;

Organization.hasMany(User, { foreignKey: 'organizationId', as: 'users' });
User.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });
Organization.hasMany(Product, { foreignKey: 'sellerOrgId', as: 'products' });
Product.belongsTo(Organization, { foreignKey: 'sellerOrgId', as: 'sellerOrganization' });
Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Category.hasMany(Category, { foreignKey: 'parentId', as: 'children' });
Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });
Organization.hasMany(Tender, { foreignKey: 'buyerOrgId', as: 'tenders' });
Tender.belongsTo(Organization, { foreignKey: 'buyerOrgId', as: 'buyerOrganization' });
Tender.hasMany(TenderItem, { foreignKey: 'tenderId', as: 'items' });
TenderItem.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });
Tender.hasMany(TenderInvitation, { foreignKey: 'tenderId', as: 'invitations' });
Tender.hasMany(Offer, { foreignKey: 'tenderId', as: 'offers' });
Offer.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });
Organization.hasMany(Offer, { foreignKey: 'sellerOrgId', as: 'offers' });
Offer.belongsTo(Organization, { foreignKey: 'sellerOrgId', as: 'sellerOrganization' });
Offer.hasMany(OfferItem, { foreignKey: 'offerId', as: 'items' });
OfferItem.belongsTo(Offer, { foreignKey: 'offerId', as: 'offer' });
OfferItem.belongsTo(TenderItem, { foreignKey: 'tenderItemId', as: 'tenderItem' });
OfferItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Organization.hasMany(Document, { foreignKey: 'ownerOrgId', as: 'documents' });
Document.belongsTo(Organization, { foreignKey: 'ownerOrgId', as: 'ownerOrganization' });
Tender.hasMany(Clarification, { foreignKey: 'tenderId', as: 'clarifications' });
Clarification.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });
Offer.hasMany(Message, { foreignKey: 'offerId', as: 'messages' });
Tender.hasMany(Message, { foreignKey: 'tenderId', as: 'messages' });
Offer.hasOne(PurchaseOrder, { foreignKey: 'offerId', as: 'purchaseOrder' });
PurchaseOrder.belongsTo(Offer, { foreignKey: 'offerId', as: 'offer' });
PurchaseOrder.belongsTo(Tender, { foreignKey: 'tenderId', as: 'tender' });
module.exports = {
  sequelize: require('../config/database'),
  User, Category, Product, ...tendering, ...storyPlatform
};
