/**
 * Coupon API Routes
 * POST /api/coupons          — Admin: create coupon
 * GET  /api/coupons          — Admin: list coupons
 * POST /api/coupons/apply    — Customer: apply coupon → get NOWPayments checkout URL
 * DELETE /api/coupons/:code  — Admin: deactivate coupon
 */

import { Router, Request, Response } from 'express';
import { CouponService } from '../../billing/coupon-service';
import { logger } from '../../utils/logger';

const TIER_PRICES: Record<string, { price: number; invoiceId: string }> = {
  STARTER: { price: 49, invoiceId: '4725459350' },
  PRO: { price: 149, invoiceId: '5493882802' },
  ELITE: { price: 499, invoiceId: '5264305182' },
};

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';

export const couponRouter: Router = Router();
const couponService = CouponService.getInstance();

// Admin: create coupon
couponRouter.post('/', async (req: Request, res: Response) => {
  try {
    const coupon = couponService.createCoupon(req.body);
    return res.json({ success: true, coupon });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Admin: list coupons
couponRouter.get('/', (_req: Request, res: Response) => {
  return res.json({ coupons: couponService.listCoupons() });
});

// Admin: deactivate coupon
couponRouter.delete('/:code', (req: Request, res: Response) => {
  const ok = couponService.deactivateCoupon(req.params.code as string);
  return res.json({ success: ok });
});

// Customer: apply coupon → create discounted NOWPayments invoice → return checkout URL
couponRouter.post('/apply', async (req: Request, res: Response) => {
  const { code, tier } = req.body;
  if (!code || !tier) {
    return res.status(400).json({ error: 'code and tier required' });
  }

  const tierKey = tier.toUpperCase();
  const tierConfig = TIER_PRICES[tierKey];
  if (!tierConfig) {
    return res.status(400).json({ error: 'Invalid tier. Use STARTER, PRO, or ELITE' });
  }

  const result = couponService.applyCoupon(code, tierKey, tierConfig.price);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  // 100% discount = free, activate directly
  if (result.discountedPrice === 0) {
    return res.json({
      success: true,
      discountPercent: result.discountPercent,
      originalPrice: tierConfig.price,
      finalPrice: 0,
      message: 'Free access granted',
      checkoutUrl: null,
    });
  }

  // Create discounted invoice via NOWPayments API
  try {
    const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: result.discountedPrice,
        price_currency: 'usd',
        order_id: `cashclaw_${tierKey}_coupon_${code}_${Date.now()}`,
        order_description: `CashClaw ${tierKey} (${result.discountPercent}% off with ${code})`,
        success_url: 'https://cashclaw.cc/dashboard.html',
        cancel_url: 'https://cashclaw.cc/#pricing',
      }),
    });

    const invoice = await invoiceRes.json() as { id?: string; invoice_url?: string };

    if (!invoice.id) {
      logger.error('[Coupon] NOWPayments invoice creation failed', invoice);
      return res.status(500).json({ error: 'Payment provider error' });
    }

    return res.json({
      success: true,
      discountPercent: result.discountPercent,
      originalPrice: tierConfig.price,
      finalPrice: result.discountedPrice,
      checkoutUrl: `https://nowpayments.io/payment?iid=${invoice.id}`,
    });
  } catch (err) {
    logger.error('[Coupon] Invoice creation error', { err });
    return res.status(500).json({ error: 'Failed to create payment' });
  }
});
