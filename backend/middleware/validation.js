const { z } = require('zod');

const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(200),
  language: z.enum(['fr', 'en', 'ar']).optional(),
  organization: z.object({
    type: z.enum(['BUYER', 'SELLER']),
    legalName: z.string().trim().min(1).max(255),
    country: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(1000),
    registrationNumber: z.string().trim().min(1).max(120),
    pharmaceuticalLicense: z.string().trim().max(255).optional()
  })
});

const clientRegistrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(200),
  language: z.enum(['fr', 'en', 'ar']).default('fr'),
  legalName: z.string().trim().min(1).max(255),
  country: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(1000),
  registrationNumber: z.string().trim().min(1).max(120),
  pharmaceuticalLicense: z.string().trim().min(1).max(255).optional()
});

const verificationRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  language: z.enum(['fr', 'en', 'ar']).default('fr')
});

const verificationSchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().regex(/^\d{6,8}$/)
});

const passwordResetSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(200)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200)
});

const adminInvitationSchema = z.object({
  email: z.string().trim().email().max(255),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  language: z.enum(['fr', 'en', 'ar']).default('fr')
});

const adminRegistrationSchema = adminInvitationSchema.extend({
  password: z.string().min(12).max(200)
});

const adminApprovalSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

const buyerOnboardingSchema = z.object({
  legalName: z.string().trim().min(1).max(255),
  country: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(1000),
  registrationNumber: z.string().trim().min(1).max(120)
});

const organizationVerificationSchema = z.object({
  verificationStatus: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING']),
  internalAdminNote: z.string().max(5000).optional()
});

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: 'Le corps de la requête est invalide.',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  registrationSchema,
  clientRegistrationSchema,
  verificationRequestSchema,
  verificationSchema,
  passwordResetSchema,
  loginSchema,
  adminInvitationSchema,
  adminRegistrationSchema,
  adminApprovalSchema,
  buyerOnboardingSchema,
  organizationVerificationSchema
};
