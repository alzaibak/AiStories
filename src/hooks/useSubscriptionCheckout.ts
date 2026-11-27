import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { translateText, type SiteLanguage } from '@/lib/localization';

type Options = {
  language: SiteLanguage;
  /** Only readers may pay for a plan; everyone else is sent to sign in. */
  isReader: boolean;
  onRequireLogin: () => void;
  /** Discount code offered by the surface, when it has one. */
  promoCode?: string;
};

/**
 * One entry point for starting a subscription payment (profile, pricing page
 * and the in-page plans dialog). It owns the pending plan, the 409 copy and the
 * redirect to Stripe, so the three surfaces cannot drift apart.
 */
export function useSubscriptionCheckout({ language, isReader, onRequireLogin, promoCode = '' }: Options) {
  const [checkoutPlanId, setCheckoutPlanId] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function startCheckout(planId: number) {
    if (!isReader) {
      onRequireLogin();
      return;
    }
    setCheckoutPlanId(planId);
    setCheckoutError(null);
    try {
      const code = promoCode.trim();
      const response = await api.post<{ checkoutUrl: string }>('/payments/subscriptions/checkout', {
        planId,
        language,
        ...(code ? { promoCode: code } : {})
      });
      window.location.assign(response.checkoutUrl);
    } catch (caught) {
      setCheckoutError(caught instanceof ApiError && caught.status === 409
        ? translateText('لديك اشتراك نشط بالفعل. يمكنك إدارته من حسابك.', language)
        : caught instanceof Error ? caught.message : translateText('تعذر بدء الاشتراك.', language));
      setCheckoutPlanId(null);
    }
  }

  return { checkoutPlanId, checkoutError, setCheckoutError, startCheckout };
}
