const { z } = require('zod');
const { apiErrorResponse, requestLanguage } = require('../utils/apiErrors');
const strongPasswordSchema = z.string().min(14).max(200)
  .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule.')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule.')
  .regex(/[0-9]/, 'Le mot de passe doit contenir un chiffre.')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir un caractère spécial.');

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

const publicPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: strongPasswordSchema
});

const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: strongPasswordSchema
});

const adminPasswordResetCompleteSchema = z.object({
  email: z.string().trim().email().max(255),
  token: z.string().min(40).max(200),
  newPassword: strongPasswordSchema
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
const userRoleSchema = z.object({ role: z.enum(['ADMIN', 'EDITOR', 'REVIEWER', 'READER']) });

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(apiErrorResponse(result.error, requestLanguage(req)).body);
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
  publicPasswordChangeSchema,
  adminPasswordChangeSchema,
  adminPasswordResetCompleteSchema,
  loginSchema,
  adminInvitationSchema,
  adminRegistrationSchema,
  adminApprovalSchema,
  userRoleSchema
};
