import Razorpay from 'razorpay';
import crypto from 'crypto';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

const PLAN_CREDITS = {
  'plan_basic': 100,
  'plan_pro': 500,
};

export const createOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;

    const options = {
      amount: amount * 100, // amount in smallest currency unit (paise)
      currency,
      receipt: receipt || `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    
    // Log the intended payment in DB as 'created'
    await prisma.payment.create({
      data: {
        userId: req.user.id,
        razorpayOrderId: order.id,
        amount: options.amount,
        currency: options.currency,
        status: 'created',
        creditsAdded: 0 // Will update on success
      }
    });

    res.json(order);
  } catch (error) {
    logger.error({ err: error }, 'Razorpay create order failed');
    res.status(500).json({ error: 'Failed to create order' });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      const creditsToAssign = PLAN_CREDITS[planId] || 100;

      // Update payment status
      await prisma.payment.update({
        where: { razorpayOrderId: razorpay_order_id },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'captured',
          creditsAdded: creditsToAssign
        }
      });

      // Update user credits
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          credits: { increment: creditsToAssign },
          tier: 'PRO'
        }
      });

      res.json({ message: 'Payment verified successfully', creditsAdded: creditsToAssign });
    } else {
      res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Payment verification failed');
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};
