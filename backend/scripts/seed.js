const sequelize = require('../config/database');
const { User, Organization, Category, Product, Tender, TenderItem, Offer, OfferItem } = require('../models');
const { hashPassword } = require('../utils/security');
const { ensureSeedAdmin } = require('../utils/seedAdmin');

const buyers = [
  { email: 'achats@hopital-exemple.test', firstName: 'Nadia', lastName: 'Acheteur', legalName: 'Centre Hospitalier Exemple', country: 'France', registrationNumber: 'BUYER-FR-001' },
  { email: 'procurement@ong-exemple.test', firstName: 'Karim', lastName: 'Acheteur', legalName: 'ONG Santé Exemple', country: 'Maroc', registrationNumber: 'BUYER-MA-002' }
];
const sellers = [
  { email: 'offres@laboratoire-a.test', firstName: 'Amira', lastName: 'Fournisseur', legalName: 'Laboratoire Atlas Pharma', country: 'Maroc', registrationNumber: 'SELLER-MA-001' },
  { email: 'sales@medicines-b.test', firstName: 'Omar', lastName: 'Fournisseur', legalName: 'Medicines Sahel Ltd', country: 'Sénégal', registrationNumber: 'SELLER-SN-002' },
  { email: 'tenders@pharma-c.test', firstName: 'Leila', lastName: 'Fournisseur', legalName: 'Pharma du Levant', country: 'Jordanie', registrationNumber: 'SELLER-JO-003' },
  { email: 'export@health-d.test', firstName: 'Youssef', lastName: 'Fournisseur', legalName: 'Health Export Group', country: 'Tunisie', registrationNumber: 'SELLER-TN-004' }
];

async function ensureOrganization(input, type) {
  const [organization] = await Organization.findOrCreate({
    where: { type, registrationNumber: input.registrationNumber },
    defaults: {
      type,
      legalName: input.legalName,
      country: input.country,
      address: `Adresse professionnelle, ${input.country}`,
      registrationNumber: input.registrationNumber,
      pharmaceuticalLicense: type === 'SELLER' ? `LIC-${input.registrationNumber}` : null,
      verificationStatus: 'APPROVED'
    }
  });
  return organization;
}

async function ensureUser(input, role, organizationId, password) {
  const passwordHash = await hashPassword(password);
  const [user] = await User.findOrCreate({
    where: { email: input.email },
    defaults: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role,
      organizationId,
      status: 'ACTIVE',
      language: 'fr',
      emailVerifiedAt: new Date()
    }
  });
  return user;
}

async function main() {
  const adminOnly = process.argv.includes('--admin-only');
  const requiredEnvironment = adminOnly
    ? ['SEED_ADMIN_PASSWORD']
    : ['SEED_ADMIN_PASSWORD', 'SEED_USER_PASSWORD'];
  const missing = requiredEnvironment.filter((key) => !process.env[key] || process.env[key].length < 12);
  if (missing.length) {
    throw new Error(`Définissez des mots de passe de graine de 12 caractères minimum : ${missing.join(', ')}.`);
  }
  if (!process.env.SEED_ADMIN_EMAIL) {
    throw new Error('Définissez SEED_ADMIN_EMAIL avant de créer le compte administrateur.');
  }
  await sequelize.authenticate();
  if (!adminOnly) await require('../migrate')('up');

  const { renamed, removedPrevious } = await ensureSeedAdmin({
    User,
    hashPassword,
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    previousEmail: process.env.SEED_ADMIN_PREVIOUS_EMAIL,
    deletePreviousAdmin: process.env.SEED_ADMIN_DELETE_PREVIOUS === 'true'
  });
  console.info(renamed
    ? `Compte SUPER_ADMIN transféré vers ${process.env.SEED_ADMIN_EMAIL.toLowerCase()}.`
    : `Compte SUPER_ADMIN prêt : ${process.env.SEED_ADMIN_EMAIL.toLowerCase()}.`);
  if (removedPrevious) {
    console.info('Ancien compte super-administrateur supprimé.');
  }
  if (adminOnly) return;

  const buyerOrgs = [];
  for (const buyer of buyers) {
    const organization = await ensureOrganization(buyer, 'BUYER');
    await ensureUser(buyer, 'BUYER', organization.id, process.env.SEED_USER_PASSWORD);
    buyerOrgs.push(organization);
  }

  const sellerOrgs = [];
  for (const seller of sellers) {
    const organization = await ensureOrganization(seller, 'SELLER');
    await ensureUser(seller, 'SELLER', organization.id, process.env.SEED_USER_PASSWORD);
    sellerOrgs.push(organization);
  }

  const categoryInputs = [
    ['Antalgiques', 'antalgiques'],
    ['Antibiotiques', 'antibiotiques'],
    ['Consommables médicaux', 'consommables-medicaux']
  ];
  const categories = [];
  for (const [name, slug] of categoryInputs) {
    const [category] = await Category.findOrCreate({
      where: { slug },
      defaults: { name, slug, description: `Produits de la catégorie ${name}`, isActive: true }
    });
    categories.push(category);
  }

  const medicines = [
    { genericName: 'Paracétamol', dosage: '500 mg', dosageForm: 'Comprimé', packaging: 'Boîte de 20', unit: 'boîtes' },
    { genericName: 'Amoxicilline', dosage: '500 mg', dosageForm: 'Gélule', packaging: 'Boîte de 21', unit: 'boîtes' },
    { genericName: 'Solution de réhydratation orale', dosage: '20,5 g', dosageForm: 'Sachet', packaging: 'Boîte de 100 sachets', unit: 'boîtes' }
  ];
  const sampleTenders = [];
  for (let index = 0; index < medicines.length; index += 1) {
    const medicine = medicines[index];
    const buyerOrg = buyerOrgs[index % buyerOrgs.length];
    const tender = await Tender.findOrCreate({
      where: { reference: `TND-${new Date().getFullYear()}-EX${index + 1}` },
      defaults: {
        reference: `TND-${new Date().getFullYear()}-EX${index + 1}`,
        buyerOrgId: buyerOrg.id,
        title: `Approvisionnement en ${medicine.genericName}`,
        description: `Appel d’offres de démonstration pour ${medicine.genericName}, destiné à l’approvisionnement institutionnel.`,
        categoryId: categories[index % categories.length].id,
        deliveryCountry: buyerOrg.country,
        deliveryRegion: 'National',
        publishedAt: new Date(),
        deadline: new Date(Date.now() + (14 + index * 7) * 24 * 60 * 60 * 1000),
        type: index === 2 ? 'URGENT' : 'NORMAL',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        requiredDocuments: [],
        attachmentUrls: [],
        createdBy: (await User.findOne({ where: { organizationId: buyerOrg.id } })).id
      }
    });
    const tenderItem = await TenderItem.findOrCreate({
      where: { tenderId: tender[0].id, genericName: medicine.genericName },
      defaults: {
        tenderId: tender[0].id,
        genericName: medicine.genericName,
        dosage: medicine.dosage,
        dosageForm: medicine.dosageForm,
        packaging: medicine.packaging,
        quantity: 1000 + index * 500,
        unit: medicine.unit,
        remarks: 'Fournir une durée de conservation suffisante à la livraison.'
      }
    });
    sampleTenders.push({ tender: tender[0], item: tenderItem[0], medicine });
  }

  for (const { tender, item, medicine } of sampleTenders) {
    for (let sellerIndex = 0; sellerIndex < sellerOrgs.length; sellerIndex += 1) {
      const seller = sellerOrgs[sellerIndex];
      const product = await Product.findOrCreate({
        where: {
          sellerOrgId: seller.id,
          genericName: medicine.genericName,
          dosage: medicine.dosage,
          dosageForm: medicine.dosageForm
        },
        defaults: {
          sellerOrgId: seller.id,
          tradeName: `${medicine.genericName} ${medicine.dosage}`,
          genericName: medicine.genericName,
          dosage: medicine.dosage,
          dosageForm: medicine.dosageForm,
          packaging: medicine.packaging,
          manufacturer: seller.legalName,
          originCountry: seller.country,
          categoryId: tender.categoryId,
          marketingAuthorization: 'APPROVED',
          therapeuticClasses: [medicine.genericName],
          description: `Médicament de démonstration fourni par ${seller.legalName}.`
        }
      });
      const [offer] = await Offer.findOrCreate({
        where: { tenderId: tender.id, sellerOrgId: seller.id },
        defaults: {
          tenderId: tender.id,
          sellerOrgId: seller.id,
          status: 'SUBMITTED',
          currency: 'EUR',
          totalAmount: (Number(item.quantity) * (0.25 + sellerIndex * 0.035)).toFixed(2),
          deliveryDays: 12 + sellerIndex * 3,
          validityDays: 30,
          incoterm: 'DAP',
          paymentTerms: 'Virement bancaire, 30 jours',
          comment: 'Offre indicative de démonstration.',
          submittedAt: new Date()
        }
      });
      await OfferItem.findOrCreate({
        where: { offerId: offer.id, tenderItemId: item.id },
        defaults: {
          offerId: offer.id,
          tenderItemId: item.id,
          productId: product[0].id,
          unitPrice: (0.25 + sellerIndex * 0.035).toFixed(4),
          moq: 1,
          availableQuantity: Number(item.quantity) * 2,
          lineTotal: (Number(item.quantity) * (0.25 + sellerIndex * 0.035)).toFixed(2)
        }
      });
    }
  }

  console.info('Graine E-Tendering créée : 1 admin, 2 acheteurs, 4 vendeurs, 3 appels d’offres et 12 offres.');
}

main()
  .catch((error) => {
    console.error('Échec de la création des graines :', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
