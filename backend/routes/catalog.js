const router = require('express').Router();
const { Op } = require('sequelize');
const { Product, Category, Organization } = require('../models');
const { authenticate, allowRoles, requireApprovedSeller } = require('../middleware/authorization');
const { requiredString, positiveNumber } = require('../utils/security');
const { recordAudit } = require('../utils/audit');

router.use(authenticate);

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      where: { isActive: true },
      order: [['order', 'ASC'], ['name', 'ASC']]
    });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.post('/categories', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const name = requiredString(req.body.name, 'Nom de catégorie');
    const slug = (req.body.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const category = await Category.create({
      name, slug, description: req.body.description || null,
      parentId: req.body.parentId || null, isActive: true
    });
    await recordAudit(req, 'CREATE_CATEGORY', 'Category', category.id);
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'SELLER') where.sellerOrgId = req.user.organizationId;
    if (req.query.search) {
      const term = `%${String(req.query.search).slice(0, 100)}%`;
      where[Op.or] = [{ tradeName: { [Op.like]: term } }, { genericName: { [Op.like]: term } }];
    }
    if (req.query.categoryId) where.categoryId = Number(req.query.categoryId);
    const products = await Product.findAll({
      where,
      include: [
        { model: Organization, as: 'sellerOrganization', attributes: ['id', 'legalName', 'country', 'verificationStatus'] },
        { model: Category, as: 'category', attributes: ['id', 'name'], required: false }
      ],
      order: [['updatedAt', 'DESC']],
      limit: Math.min(Math.max(Number(req.query.limit) || 100, 1), 200)
    });
    const visible = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)
      ? products
      : products.filter((product) => req.user.role === 'SELLER'
        ? product.sellerOrgId === req.user.organizationId
        : product.sellerOrganization && product.sellerOrganization.verificationStatus === 'APPROVED');
    res.json(visible);
  } catch (error) {
    next(error);
  }
});

router.post('/products', allowRoles('SELLER'), requireApprovedSeller, async (req, res, next) => {
  try {
    const product = await Product.create({
      sellerOrgId: req.user.organizationId,
      tradeName: requiredString(req.body.tradeName, 'Nom commercial'),
      genericName: requiredString(req.body.genericName, 'DCI'),
      dosage: requiredString(req.body.dosage, 'Dosage', 120),
      dosageForm: requiredString(req.body.dosageForm, 'Forme galénique', 120),
      packaging: req.body.packaging ? requiredString(req.body.packaging, 'Conditionnement', 255) : null,
      manufacturer: req.body.manufacturer ? requiredString(req.body.manufacturer, 'Fabricant', 255) : null,
      originCountry: requiredString(req.body.originCountry, 'Pays d’origine', 120),
      categoryId: req.body.categoryId ? positiveNumber(req.body.categoryId, 'Catégorie', { integer: true }) : null,
      marketingAuthorization: ['APPROVED', 'PENDING', 'NOT_REQUIRED', 'REJECTED'].includes(req.body.marketingAuthorization)
        ? req.body.marketingAuthorization : 'PENDING',
      therapeuticClasses: Array.isArray(req.body.therapeuticClasses) ? req.body.therapeuticClasses.slice(0, 30) : [],
      rcpUrl: req.body.rcpUrl || null,
      rcpLanguage: ['fr', 'en', 'ar'].includes(req.body.rcpLanguage) ? req.body.rcpLanguage : null,
      rcpUpdatedAt: req.body.rcpUpdatedAt || null,
      description: req.body.description ? String(req.body.description).slice(0, 10000) : ''
    });
    await recordAudit(req, 'CREATE_PRODUCT', 'Product', product.id);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/products/:id', allowRoles('SELLER'), requireApprovedSeller, async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, sellerOrgId: req.user.organizationId } });
    if (!product) return res.status(404).json({ message: 'Produit introuvable.' });
    const fields = {
      tradeName: 'tradeName', genericName: 'genericName', dosage: 'dosage',
      dosageForm: 'dosageForm', packaging: 'packaging', manufacturer: 'manufacturer',
      originCountry: 'originCountry', categoryId: 'categoryId',
      marketingAuthorization: 'marketingAuthorization', therapeuticClasses: 'therapeuticClasses',
      rcpUrl: 'rcpUrl', rcpLanguage: 'rcpLanguage', rcpUpdatedAt: 'rcpUpdatedAt'
    };
    for (const [input, column] of Object.entries(fields)) {
      if (req.body[input] !== undefined) product[column] = req.body[input];
    }
    if (req.body.description !== undefined) product.description = String(req.body.description).slice(0, 10000);
    await product.save();
    await recordAudit(req, 'UPDATE_PRODUCT', 'Product', product.id);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', allowRoles('SELLER'), requireApprovedSeller, async (req, res, next) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, sellerOrgId: req.user.organizationId } });
    if (!product) return res.status(404).json({ message: 'Produit introuvable.' });
    await product.destroy();
    await recordAudit(req, 'DELETE_PRODUCT', 'Product', product.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
