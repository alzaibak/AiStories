const { z } = require('zod');

const readerRegistrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(200),
  language: z.enum(['fr', 'en', 'ar']).default('ar')
});

const verificationRequestSchema = z.object({
  email: z.string().trim().email().max(255),
  language: z.enum(['fr', 'en', 'ar']).default('ar')
});

const verificationSchema = z.object({
  email: z.string().trim().email().max(255),
  code: z.string().regex(/^\d{6,8}$/)
});

const passwordResetRequestSchema = verificationRequestSchema.extend({
  accountType: z.enum(['reader', 'admin']).default('reader')
});

const passwordResetVerificationSchema = verificationSchema.extend({
  accountType: z.enum(['reader', 'admin']).default('reader')
});

const passwordResetSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(200),
  accountType: z.enum(['reader', 'admin']).default('reader')
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200)
});

const adminInvitationSchema = z.object({
  email: z.string().trim().email().max(255),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(['ADMIN', 'EDITOR', 'REVIEWER']).default('ADMIN'),
  language: z.enum(['fr', 'en', 'ar']).default('ar')
});

const adminRegistrationSchema = adminInvitationSchema.extend({
  password: z.string().min(12).max(200)
});

const adminApprovalSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

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
  readerRegistrationSchema,
  verificationRequestSchema,
  verificationSchema,
  passwordResetRequestSchema,
  passwordResetVerificationSchema,
  passwordResetSchema,
  loginSchema,
  adminInvitationSchema,
  adminRegistrationSchema,
  adminApprovalSchema
};
